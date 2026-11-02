import React, { useState, useEffect } from 'react';
import { PublicRoomSummary } from '../types/uno.ts';
import { socketClient } from '../services/socket.ts';
import { soundService } from '../services/sound.ts';
import { HowToPlayModal } from './HowToPlayModal.tsx';
import {
  Users,
  Play,
  PlusCircle,
  LogIn,
  BookOpen,
  Volume2,
  VolumeX,
  History,
  Sparkles,
  Trophy,
  RefreshCw,
  Flame,
  ArrowRight,
  Shield,
  Layers,
} from 'lucide-react';

interface LobbyProps {
  onEnterRoom: (roomCode: string) => void;
}

const AVATARS = [
  { id: 'fox', label: 'Fox', emoji: '🦊' },
  { id: 'bear', label: 'Bear', emoji: '🐻' },
  { id: 'panda', label: 'Panda', emoji: '🐼' },
  { id: 'lion', label: 'Lion', emoji: '🦁' },
  { id: 'tiger', label: 'Tiger', emoji: '🐯' },
  { id: 'rabbit', label: 'Rabbit', emoji: '🐰' },
  { id: 'dragon', label: 'Dragon', emoji: '🐲' },
  { id: 'spark', label: 'Spark', emoji: '⚡' },
];

export const Lobby: React.FC<LobbyProps> = ({ onEnterRoom }) => {
  // Player profile state stored in localStorage
  const [playerName, setPlayerName] = useState(() => {
    return localStorage.getItem('uno_player_name') || `Player_${Math.floor(100 + Math.random() * 900)}`;
  });
  const [playerAvatar, setPlayerAvatar] = useState(() => {
    return localStorage.getItem('uno_player_avatar') || 'fox';
  });

  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isMuted, setIsMuted] = useState(soundService.getMuted());
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Create room modal options
  const [maxPlayers, setMaxPlayers] = useState<number>(4);
  const [isSingleRound, setIsSingleRound] = useState<boolean>(false);
  const [targetScore, setTargetScore] = useState<number>(500);
  const [isPrivate, setIsPrivate] = useState<boolean>(false);

  // Public waiting rooms
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // Check URL query parameters for direct room join invite (e.g. ?room=ABCD12)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setJoinCodeInput(roomParam.toUpperCase());
    }
  }, []);

  // Save profile changes
  const handleNameChange = (name: string) => {
    setPlayerName(name);
    localStorage.setItem('uno_player_name', name);
  };

  const handleAvatarChange = (avatarId: string) => {
    soundService.play('click');
    setPlayerAvatar(avatarId);
    localStorage.setItem('uno_player_avatar', avatarId);
  };

  const handleToggleMute = () => {
    const muted = soundService.toggleMute();
    setIsMuted(muted);
  };

  // Fetch public rooms
  const fetchPublicRooms = async () => {
    try {
      setLoadingRooms(true);
      const res = await fetch(`${(import.meta as any).env?.VITE_BACKEND_URL || ''}/api/public-rooms`);
      if (res.ok) {
        const data = await res.json();
        setPublicRooms(data.rooms || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    fetchPublicRooms();
    const interval = setInterval(fetchPublicRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  // Quick match / Play Online
  const handleQuickMatch = async () => {
    if (!playerName.trim()) {
      setErrorMessage('Please enter a display name first.');
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    soundService.play('click');

    const res = await socketClient.quickMatch(playerName.trim(), playerAvatar);
    setIsLoading(false);
    if (res.success && res.roomCode) {
      onEnterRoom(res.roomCode);
    } else {
      setErrorMessage(res.message || 'Could not find or join match.');
    }
  };

  // Create Room
  const handleCreateRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) {
      setErrorMessage('Please enter a display name.');
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    soundService.play('click');

    const res = await socketClient.createRoom(playerName.trim(), playerAvatar, {
      maxPlayers,
      isSingleRound,
      targetScore: isSingleRound ? 1 : targetScore,
      isPrivate,
    });

    setIsLoading(false);
    if (res.success && res.roomCode) {
      setIsCreatingRoom(false);
      onEnterRoom(res.roomCode);
    } else {
      setErrorMessage(res.message || 'Failed to create room.');
    }
  };

  // Join Room by Code
  const handleJoinByCode = async (codeToJoin?: string) => {
    const code = (codeToJoin || joinCodeInput).trim().toUpperCase();
    if (!code) {
      setErrorMessage('Please enter a room code.');
      return;
    }
    if (!playerName.trim()) {
      setErrorMessage('Please enter your name.');
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    soundService.play('click');

    const res = await socketClient.joinRoom(code, playerName.trim(), playerAvatar);
    setIsLoading(false);
    if (res.success && res.roomCode) {
      onEnterRoom(res.roomCode);
    } else {
      setErrorMessage(res.message || 'Unable to join room. Verify the code.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 via-emerald-950 to-neutral-950 text-white flex flex-col justify-between select-none">
      {/* Top Navbar */}
      <nav className="flex items-center justify-between px-4 md:px-8 py-3.5 bg-neutral-950/80 backdrop-blur-md border-b border-neutral-800">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-red-600 via-amber-500 to-yellow-400 p-0.5 shadow-lg flex items-center justify-center transform -rotate-6">
            <span className="font-black italic text-black text-sm tracking-tighter">
              UNO
            </span>
          </div>
          <div>
            <span className="font-black text-lg md:text-xl tracking-tight text-white flex items-center gap-1.5">
              UNO <span className="text-amber-400 text-xs px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30">CLASSIC ONLINE</span>
            </span>
          </div>
        </div>

        {/* Right Nav actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleMute}
            className="p-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white transition"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            onClick={() => {
              soundService.play('click');
              setShowHistory(true);
            }}
            className="p-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white transition flex items-center gap-1.5 text-xs font-bold"
            title="Game Stats"
          >
            <History className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Stats</span>
          </button>

          <button
            onClick={() => {
              soundService.play('click');
              setShowHowToPlay(true);
            }}
            className="p-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white transition flex items-center gap-1.5 text-xs font-bold"
          >
            <BookOpen className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Rules</span>
          </button>
        </div>
      </nav>

      {/* Hero / Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-5xl mx-auto w-full">
        {/* Error Alert */}
        {errorMessage && (
          <div className="w-full max-w-lg mb-6 p-3.5 rounded-2xl bg-rose-950/80 border border-rose-500 text-rose-200 text-xs md:text-sm font-semibold flex items-center justify-between shadow-lg animate-fadeIn">
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-200 font-bold ml-2">
              ✕
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full items-start">
          {/* Left Column: Player Profile & Quick Actions */}
          <div className="lg:col-span-5 space-y-6">
            {/* Player Card */}
            <div className="rounded-3xl bg-neutral-900/90 border-2 border-neutral-800 p-6 shadow-2xl backdrop-blur-md">
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block mb-3">
                Your Player Profile
              </span>

              {/* Username Input */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-neutral-300 mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  maxLength={16}
                  value={playerName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Enter your nickname"
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-950 border border-neutral-700 text-white font-bold text-sm focus:outline-none focus:border-amber-400 transition"
                />
              </div>

              {/* Avatar Selector */}
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5">
                  Choose Avatar
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {AVATARS.map((av) => (
                    <button
                      key={av.id}
                      type="button"
                      onClick={() => handleAvatarChange(av.id)}
                      className={`p-2.5 rounded-xl border text-2xl flex flex-col items-center justify-center transition-all ${
                        playerAvatar === av.id
                          ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/50 scale-105'
                          : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800'
                      }`}
                    >
                      <span>{av.emoji}</span>
                      <span className="text-[10px] text-neutral-400 mt-1 font-semibold">
                        {av.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Play Online CTA */}
            <div className="rounded-3xl bg-gradient-to-br from-red-600 via-amber-600 to-yellow-500 p-1 shadow-2xl">
              <div className="rounded-[22px] bg-neutral-950/80 backdrop-blur-sm p-6 text-center">
                <div className="inline-flex p-3 rounded-2xl bg-amber-400/20 text-amber-300 border border-amber-400/40 mb-3">
                  <Flame className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-white uppercase tracking-wide mb-1">
                  Play Online
                </h3>
                <p className="text-xs text-neutral-300 mb-4 font-medium">
                  Quick match with real human players worldwide. No bots, strict official rules!
                </p>

                <button
                  disabled={isLoading}
                  onClick={handleQuickMatch}
                  className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-300 text-black font-black text-base shadow-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>{isLoading ? 'FINDING MATCH...' : 'QUICK MATCH'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Create Room, Join by Code & Public Rooms Browser */}
          <div className="lg:col-span-7 space-y-6">
            {/* Create & Join Room Card */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Create Room Button */}
              <button
                onClick={() => {
                  soundService.play('click');
                  setIsCreatingRoom(true);
                }}
                className="group p-6 rounded-3xl bg-neutral-900/90 border-2 border-neutral-800 hover:border-emerald-500/80 text-left transition-all duration-200 shadow-xl hover:-translate-y-1"
              >
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-400 mb-4 group-hover:scale-110 transition-transform">
                  <PlusCircle className="w-6 h-6" />
                </div>
                <h4 className="text-lg font-black text-white uppercase tracking-wider mb-1">
                  Create Room
                </h4>
                <p className="text-xs text-neutral-400">
                  Host a private or public game. Choose 2-4 players, match scoring, and invite friends.
                </p>
              </button>

              {/* Join Room by Code */}
              <div className="p-6 rounded-3xl bg-neutral-900/90 border-2 border-neutral-800 text-left shadow-xl flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-400 flex items-center justify-center text-blue-400 mb-3">
                    <LogIn className="w-6 h-6" />
                  </div>
                  <h4 className="text-lg font-black text-white uppercase tracking-wider mb-1">
                    Join by Code
                  </h4>
                  <p className="text-xs text-neutral-400 mb-3">
                    Enter the 6-character room code shared by your friend.
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    placeholder="CODE"
                    className="w-28 px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-700 text-center font-mono font-black text-base text-amber-400 uppercase tracking-widest focus:outline-none focus:border-blue-400"
                  />
                  <button
                    disabled={isLoading || !joinCodeInput.trim()}
                    onClick={() => handleJoinByCode()}
                    className="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-white font-black text-xs uppercase tracking-wider transition"
                  >
                    Join
                  </button>
                </div>
              </div>
            </div>

            {/* Public Rooms Browser */}
            <div className="rounded-3xl bg-neutral-900/90 border-2 border-neutral-800 p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-amber-400" />
                  <h4 className="text-sm font-black text-white uppercase tracking-wider">
                    Public Rooms Waiting for Players
                  </h4>
                </div>
                <button
                  onClick={fetchPublicRooms}
                  disabled={loadingRooms}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-white transition"
                  title="Refresh Rooms"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingRooms ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {publicRooms.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-neutral-950 border border-neutral-800 text-xs text-neutral-500">
                  <Sparkles className="w-6 h-6 text-neutral-600 mx-auto mb-2" />
                  No public rooms currently waiting. Create one or click Quick Match!
                </div>
              ) : (
                <div className="space-y-2.5 max-h-56 overflow-y-auto">
                  {publicRooms.map((room) => (
                    <div
                      key={room.roomCode}
                      className="flex items-center justify-between p-3 rounded-xl bg-neutral-950 border border-neutral-800 hover:border-neutral-700 transition"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white">{room.hostName}'s Table</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-neutral-800 text-amber-400">
                            {room.roomCode}
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-400 flex items-center gap-3 mt-0.5">
                          <span>
                            {room.playerCount}/{room.maxPlayers} players
                          </span>
                          <span>•</span>
                          <span>{room.isSingleRound ? 'Single Round' : `Target ${room.targetScore} pts`}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleJoinByCode(room.roomCode)}
                        className="py-1.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition flex items-center gap-1"
                      >
                        <span>Join</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-neutral-500 border-t border-neutral-900">
        UNO Classic Multiplayer • 100% Real Human-vs-Human • Official 108 Card Deck Rules
      </footer>

      {/* CREATE ROOM MODAL */}
      {isCreatingRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl bg-neutral-900 border-2 border-neutral-700 p-6 md:p-8 shadow-2xl text-white">
            <h3 className="text-xl font-black text-white uppercase tracking-wider mb-1">
              Create UNO Room
            </h3>
            <p className="text-xs text-neutral-400 mb-6">
              Configure room settings and match rules
            </p>

            <form onSubmit={handleCreateRoomSubmit} className="space-y-4">
              {/* Max Players */}
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5">
                  Max Human Players
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[2, 3, 4].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setMaxPlayers(num)}
                      className={`py-2 rounded-xl border text-sm font-bold transition ${
                        maxPlayers === num
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:bg-neutral-800'
                      }`}
                    >
                      {num} Players
                    </button>
                  ))}
                </div>
              </div>

              {/* Match Mode */}
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5">
                  Game Mode & Scoring
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSingleRound(false)}
                    className={`p-3 rounded-xl border text-left transition ${
                      !isSingleRound
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:bg-neutral-800'
                    }`}
                  >
                    <span className="font-bold text-xs block">Classic Match (500 pts)</span>
                    <span className="text-[10px] text-neutral-400">Multiple rounds until 500</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsSingleRound(true)}
                    className={`p-3 rounded-xl border text-left transition ${
                      isSingleRound
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:bg-neutral-800'
                    }`}
                  >
                    <span className="font-bold text-xs block">Single Round</span>
                    <span className="text-[10px] text-neutral-400">Winner of round wins match</span>
                  </button>
                </div>
              </div>

              {/* Privacy Setting */}
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5">
                  Room Visibility
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPrivate(false)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition ${
                      !isPrivate
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:bg-neutral-800'
                    }`}
                  >
                    Public (Listed in Lobby)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPrivate(true)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition ${
                      isPrivate
                        ? 'bg-blue-500/20 border-blue-400 text-blue-300'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:bg-neutral-800'
                    }`}
                  >
                    Private (Code Only)
                  </button>
                </div>
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreatingRoom(false)}
                  className="flex-1 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-black text-xs uppercase tracking-wider transition shadow-lg"
                >
                  {isLoading ? 'Creating...' : 'Create & Host'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GAME STATS / HISTORY MODAL */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl bg-neutral-900 border-2 border-neutral-700 p-6 md:p-8 shadow-2xl text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-emerald-400">
                <Trophy className="w-6 h-6" />
                <h3 className="text-xl font-black uppercase tracking-wider text-white">
                  Player Stats
                </h3>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="rounded-2xl bg-neutral-950 p-4 border border-neutral-800 space-y-3 mb-6">
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-400">Player Handle:</span>
                <span className="font-bold text-white">{playerName}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-400">Total Games Played:</span>
                <span className="font-bold text-white">Tracked Live in Session</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-400">Server Authentication:</span>
                <span className="font-bold text-emerald-400">Secure Session Token Active</span>
              </div>
            </div>

            <button
              onClick={() => setShowHistory(false)}
              className="w-full py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* How to Play Modal */}
      <HowToPlayModal isOpen={showHowToPlay} onClose={() => setShowHowToPlay(false)} />
    </div>
  );
};
