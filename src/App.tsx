import { useState, useEffect } from 'react';
import { ClientGameState } from './types/uno.ts';
import { socketClient } from './services/socket.ts';
import { soundService } from './services/sound.ts';
import { Lobby } from './components/Lobby.tsx';
import { GameTable } from './components/GameTable.tsx';

export default function App() {
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);

  useEffect(() => {
    const socket = socketClient.socket;

    // Listen to authoritative game state updates from server
    const handleGameState = (state: ClientGameState) => {
      setGameState(state);
      setActiveRoomCode(state.roomCode);

      // Keep URL sync with room code
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

    // Listen to game error notifications
    const handleGameError = (data: { message: string }) => {
      console.warn('UNO Game Error:', data.message);
    };

    socket.on('game:state', handleGameState);
    socket.on('game:sound', handleGameSound);
    socket.on('game:error', handleGameError);

    // Attempt automatic session reconnect on startup if page refreshed
    const savedName = localStorage.getItem('uno_player_name');
    const savedAvatar = localStorage.getItem('uno_player_avatar');
    socketClient.reconnect(savedName || undefined, savedAvatar || undefined).then((res) => {
      if (res.success && res.roomCode) {
        setActiveRoomCode(res.roomCode);
      }
    });

    return () => {
      socket.off('game:state', handleGameState);
      socket.off('game:sound', handleGameSound);
      socket.off('game:error', handleGameError);
    };
  }, []);

  const handleEnterRoom = (code: string) => {
    setActiveRoomCode(code);
  };

  const handleLeaveRoom = () => {
    socketClient.leaveRoom();
    setGameState(null);
    setActiveRoomCode(null);

    // Clean URL
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
  };

  return (
    <div className="min-h-screen bg-neutral-950 font-sans text-white antialiased">
      {activeRoomCode && gameState ? (
        <GameTable gameState={gameState} onLeaveRoom={handleLeaveRoom} />
      ) : (
        <Lobby onEnterRoom={handleEnterRoom} />
      )}
    </div>
  );
}
