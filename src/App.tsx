import { useState, useEffect } from 'react';
import { ClientGameState } from './types/uno.ts';
import { socketClient, getActiveRoom, setActiveRoom } from './services/socket.ts';
import { soundService } from './services/sound.ts';
import { Lobby } from './components/Lobby.tsx';
import { GameTable } from './components/GameTable.tsx';

export default function App() {
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: 'warn' | 'success' | 'info';
    message: string;
  } | null>(null);

  useEffect(() => {
    const socket = socketClient.socket;

    // Listen to authoritative game state updates from server
    const handleGameState = (state: ClientGameState) => {
      setGameState(state);
      setActiveRoomCode(state.roomCode);
      setActiveRoom(state.roomCode);

      // Keep URL synced with room code
      const url = new URL(window.location.href);
      if (url.searchParams.get('room') !== state.roomCode) {
        url.searchParams.set('room', state.roomCode);
        window.history.replaceState({}, '', url.toString());
      }
    };

    // Listen to audio triggers
    const handleGameSound = (data: { sound: any }) => {
      if (data.sound) {
        soundService.play(data.sound);
      }
    };

    // Player dropped / disconnected alert
    const handlePlayerDropped = (data: { playerId: string; playerName: string }) => {
      setNotification({
        type: 'warn',
        message: `⚠️ ${data.playerName} lost connection! Waiting for reconnection...`,
      });
      setTimeout(() => setNotification(null), 6000);
    };

    // Player returned / reconnected alert
    const handlePlayerReconnected = (data: { playerId: string; playerName: string }) => {
      setNotification({
        type: 'success',
        message: `✅ ${data.playerName} reconnected to the match!`,
      });
      setTimeout(() => setNotification(null), 5000);
    };

    // Match aborted alert
    const handleGameAborted = (data: { abortedBy: string; reason: string }) => {
      setNotification({
        type: 'warn',
        message: `🛑 Match aborted by ${data.abortedBy}: ${data.reason}`,
      });
      setTimeout(() => setNotification(null), 7000);
    };

    // Listen to game error notifications
    const handleGameError = (data: { message: string }) => {
      console.warn('UNO Game Error:', data.message);
      setNotification({
        type: 'warn',
        message: data.message,
      });
      setTimeout(() => setNotification(null), 5000);
    };

    socket.on('game:state', handleGameState);
    socket.on('game:sound', handleGameSound);
    socket.on('game:player-dropped', handlePlayerDropped);
    socket.on('game:player-reconnected', handlePlayerReconnected);
    socket.on('game:aborted', handleGameAborted);
    socket.on('game:error', handleGameError);

    // Controlled Reconnection:
    // Only reconnect if this tab was actively inside a game OR has ?room=... in the URL.
    const urlParams = new URLSearchParams(window.location.search);
    const urlRoom = urlParams.get('room');
    const storedActiveRoom = getActiveRoom();
    const targetRoom = urlRoom || storedActiveRoom;

    if (targetRoom) {
      const savedName = localStorage.getItem('uno_player_name');
      const savedAvatar = localStorage.getItem('uno_player_avatar');
      socketClient
        .reconnect(targetRoom, savedName || undefined, savedAvatar || undefined)
        .then((res) => {
          if (res.success && res.roomCode) {
            setActiveRoomCode(res.roomCode);
            setActiveRoom(res.roomCode);
          } else {
            // Room is expired, completed, or invalid: reset to lobby cleanly
            setActiveRoom(null);
            setActiveRoomCode(null);
            setGameState(null);
            const url = new URL(window.location.href);
            url.searchParams.delete('room');
            window.history.replaceState({}, '', url.toString());
          }
        });
    } else {
      // Clean start on Lobby
      setActiveRoom(null);
      setActiveRoomCode(null);
      setGameState(null);
    }

    return () => {
      socket.off('game:state', handleGameState);
      socket.off('game:sound', handleGameSound);
      socket.off('game:player-dropped', handlePlayerDropped);
      socket.off('game:player-reconnected', handlePlayerReconnected);
      socket.off('game:aborted', handleGameAborted);
      socket.off('game:error', handleGameError);
    };
  }, []);

  const handleEnterRoom = (code: string) => {
    setActiveRoomCode(code);
    setActiveRoom(code);
  };

  const handleLeaveRoom = () => {
    socketClient.leaveRoom();
    setActiveRoom(null);
    setGameState(null);
    setActiveRoomCode(null);

    // Clean URL
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
  };

  return (
    <div className="min-h-screen bg-neutral-950 font-sans text-white antialiased">
      {/* Global Notification Toast */}
      {notification && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-md border animate-bounce flex items-center gap-3 text-sm font-bold bg-neutral-900/95 border-amber-500/80 text-amber-300">
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="text-neutral-400 hover:text-white text-xs ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {activeRoomCode && gameState ? (
        <GameTable gameState={gameState} onLeaveRoom={handleLeaveRoom} />
      ) : (
        <Lobby onEnterRoom={handleEnterRoom} />
      )}
    </div>
  );
}
