import React, { useState, useEffect } from 'react';
import { PublicRoomSummary, UserAccountProfile } from '../types/uno.ts';
import { socketClient } from '../services/socket.ts';
import { soundService } from '../services/sound.ts';
import { authService } from '../services/auth.ts';
import { HowToPlayModal } from './HowToPlayModal.tsx';
import { AuthModal } from './AuthModal.tsx';
import { LeaderboardModal } from './LeaderboardModal.tsx';
import {
  Users,
  Play,
  Plus,
  LogIn,
  BookOpen,
  Volume2,
  VolumeX,
  Trophy,
  RefreshCw,
  Flame,
  ArrowRight,
  User,
  Shield,
  Layers,
} from 'lucide-react';

interface LobbyProps {
  onEnterRoom: (roomCode: string) => void;
}

const AVATARS = [
  { id: 'fox', label: 'FOX', emoji: '🦊' },
  { id: 'bear', label: 'BEAR', emoji: '🐻' },
  { id: 'panda', label: 'PANDA', emoji: '🐼' },
  { id: 'lion', label: 'LION', emoji: '🦁' },
  { id: 'tiger', label: 'TIGER', emoji: '🐯' },
  { id: 'rabbit', label: 'RABBIT', emoji: '🐰' },
  { id: 'dragon', label: 'DRAGON', emoji: '🐲' },
  { id: 'spark', label: 'SPARK', emoji: '⚡' },
];

export const Lobby: React.FC<LobbyProps> = ({ onEnterRoom }) => {
  // User account state from auth service
  const [currentUser, setCurrentUser] = useState<UserAccountProfile | null>(authService.getUser());

  // Player display name & avatar (synced with account if logged in)
  const [playerName, setPlayerName] = useState(() => {
    return (
      authService.getUser()?.displayName ||
      authService.getUser()?.username ||
      localStorage.getItem('uno_player_name') ||
      `Player_${Math.floor(100 + Math.random() * 900)}`
    );
  });
  const [playerAvatar, setPlayerAvatar] = useState(() => {
    return authService.getUser()?.avatar || localStorage.getItem('uno_player_avatar') || 'fox';
  });

  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
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

  // Subscribe to auth changes
  useEffect(() => {
    return authService.subscribe((user) => {
      setCurrentUser(user);
      if (user) {
        setPlayerName(user.displayName || user.username);
        setPlayerAvatar(user.avatar || 'fox');
      }
    });
  }, []);

  // Check URL query parameters for direct room invite (?room=ABC123)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setJoinCodeInput(roomParam.toUpperCase());
    }
  }, []);

  // Save profile changes (if guest)
  const handleNameChange = (name: string) => {
    setPlayerName(name);
    localStorage.setItem('uno_player_name', name);
  };

  const handleAvatarChange = (avatarId: string) => {
    soundService.play('click');
    setPlayerAvatar(avatarId);
    localStorage.setItem('uno_player_avatar', avatarId);
    if (currentUser) {
      authService.updateProfile({ avatar: avatarId });
    }
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

    const res = await socketClient.quickMatch(
      playerName.trim(),
      playerAvatar,
      currentUser?.username
    );
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

    const res = await socketClient.createRoom(
      playerName.trim(),
      playerAvatar,
      {
        maxPlayers,
        isSingleRound,
        targetScore: isSingleRound ? 1 : targetScore,
        isPrivate,
      },
      currentUser?.username
    );

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

    const res = await socketClient.joinRoom(
      code,
      playerName.trim(),
      playerAvatar,
      currentUser?.username
    );
    setIsLoading(false);
    if (res.success && res.roomCode) {
      onEnterRoom(res.roomCode);
    } else {
      setErrorMessage(res.message || 'Unable to join room. Verify the code.');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col justify-between select-none">
      {/* Top Industrial Navbar */}
      <nav className="flex items-center justify-between px-4 md:px-8 py-3 bg-neutral-950 border-b-2 border-neutral-800 shadow-[0_2px_0px_#000]">
        <div className="flex items-center gap-3">
          {/* Sharp Arcade Logo */}
          <div className="w-9 h-9 bg-red-600 border-2 border-black flex items-center justify-center shadow-[3px_3px_0px_#000]">
            <span className="font-black italic text-amber-300 text-sm tracking-tighter">
              UNO
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-base md:text-lg tracking-wider text-white">
                UNO // CLASSIC
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 bg-neutral-800 text-amber-400 border border-neutral-700 font-bold uppercase">
                HUMAN MULTIPLAYER
              </span>
            </div>
          </div>
        </div>

        {/* Right Nav actions with User Account Bar */}
        <div className="flex items-center gap-2">
          {/* Sound Toggle */}
          <button
            onClick={handleToggleMute}
            className="p-2 bg-neutral-900 hover:bg-neutral-800 border-2 border-neutral-700 text-neutral-300 hover:text-white shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Global Leaderboard Button */}
          <button
            onClick={() => {
              soundService.play('click');
              setShowLeaderboard(true);
            }}
            className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border-2 border-neutral-700 text-neutral-200 hover:text-white font-mono text-xs font-bold uppercase flex items-center gap-1.5 shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">LEADERBOARD</span>
          </button>

          {/* Rules Button */}
          <button
            onClick={() => {
              soundService.play('click');
              setShowHowToPlay(true);
            }}
            className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border-2 border-neutral-700 text-neutral-200 hover:text-white font-mono text-xs font-bold uppercase flex items-center gap-1.5 shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition"
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">RULES</span>
          </button>

          {/* User Account / Login Button */}
          {currentUser ? (
            <button
              onClick={() => {
                soundService.play('click');
                setShowAuthModal(true);
              }}
              className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 border-2 border-black text-black font-mono text-xs font-black uppercase flex items-center gap-2 shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition"
            >
              <span>{AVATARS.find((a) => a.id === currentUser.avatar)?.emoji || '🦊'}</span>
              <span className="max-w-[100px] truncate">{currentUser.displayName || currentUser.username}</span>
              <span className="bg-black text-amber-400 px-1 py-0.2 text-[10px] font-mono">
                {currentUser.totalScore} PTS
              </span>
            </button>
          ) : (
            <button
              onClick={() => {
                soundService.play('click');
                setShowAuthModal(true);
              }}
              className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 border-2 border-black text-black font-mono text-xs font-black uppercase flex items-center gap-1.5 shadow-[3px_3px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition"
            >
              <User className="w-3.5 h-3.5" />
              <span>LOG IN / SIGN UP</span>
            </button>
          )}
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-6xl mx-auto w-full">
        {/* Error Alert */}
        {errorMessage && (
          <div className="w-full max-w-xl mb-6 p-3 bg-rose-950 border-2 border-rose-600 text-rose-200 text-xs font-mono font-bold flex items-center justify-between shadow-[4px_4px_0px_#000] animate-fadeIn">
            <span>[ERROR] {errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-white px-1.5 py-0.5 border border-rose-600"
            >
              ✕
            </button>
          </div>
        )}

        {/* Account score notice if not logged in */}
        {!currentUser && (
          <div className="w-full max-w-4xl mb-6 p-3 bg-neutral-900 border-2 border-amber-500/80 shadow-[4px_4px_0px_#000] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-2 text-amber-300">
              <Shield className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                Want your match score to save permanently? Log in or create an account to accumulate points after every game!
              </span>
            </div>
            <button
              onClick={() => {
                soundService.play('click');
                setShowAuthModal(true);
              }}
              className="shrink-0 px-3 py-1 bg-amber-400 hover:bg-amber-300 border-2 border-black text-black font-black uppercase text-[11px] shadow-[2px_2px_0px_#000]"
            >
              LOG IN NOW
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full items-start">
          {/* Left Column: Player Identity & Quick Match */}
          <div className="lg:col-span-5 space-y-5">
            {/* Player Card (Sharp Box) */}
            <div className="bg-neutral-900 border-2 border-neutral-700 p-5 shadow-[5px_5px_0px_#000]">
              <div className="flex items-center justify-between border-b-2 border-neutral-800 pb-2.5 mb-4">
                <span className="font-mono text-xs font-black uppercase tracking-wider text-neutral-300">
                  PLAYER PROFILE
                </span>
                {currentUser ? (
                  <span className="font-mono text-[10px] text-emerald-400 font-bold px-1.5 py-0.5 bg-emerald-950 border border-emerald-700">
                    LOGGED IN // SCORE PERSISTS
                  </span>
                ) : (
                  <span className="font-mono text-[10px] text-neutral-500 uppercase">
                    GUEST SESSION
                  </span>
                )}
              </div>

              {/* Username Input */}
              <div className="mb-4">
                <label className="block font-mono text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
                  DISPLAY NAME
                </label>
                <input
                  type="text"
                  maxLength={16}
                  value={playerName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Enter your nickname"
                  className="w-full px-3 py-2 bg-neutral-950 border-2 border-neutral-700 text-white font-mono text-sm font-bold focus:outline-none focus:border-amber-400 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] transition"
                />
              </div>

              {/* Avatar Selector */}
              <div>
                <label className="block font-mono text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">
                  SELECT AVATAR
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {AVATARS.map((av) => (
                    <button
                      key={av.id}
                      type="button"
                      onClick={() => handleAvatarChange(av.id)}
                      className={`p-2 border-2 flex flex-col items-center justify-center transition ${
                        playerAvatar === av.id
                          ? 'bg-amber-400/20 border-amber-400 text-white shadow-[2px_2px_0px_#000]'
                          : 'bg-neutral-950 border-neutral-800 hover:border-neutral-600 text-neutral-400'
                      }`}
                    >
                      <span className="text-xl">{av.emoji}</span>
                      <span className="font-mono text-[9px] mt-0.5 font-bold">{av.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Play Online CTA (Sharp Box) */}
            <div className="bg-neutral-900 border-2 border-amber-400 p-5 shadow-[5px_5px_0px_#000]">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-amber-400 border border-black text-black">
                  <Flame className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h3 className="font-mono text-base font-black uppercase tracking-wider text-white">
                    PLAY ONLINE
                  </h3>
                  <span className="font-mono text-[10px] text-amber-400 uppercase font-bold">
                    INSTANT MATCHMAKING
                  </span>
                </div>
              </div>

              <p className="font-mono text-xs text-neutral-400 mb-4 leading-relaxed">
                Connect with real players worldwide. Follows official classic 108-card deck rules.
              </p>

              <button
                disabled={isLoading}
                onClick={handleQuickMatch}
                className="w-full py-3.5 bg-amber-400 hover:bg-amber-300 border-2 border-black text-black font-mono font-black text-sm uppercase tracking-wider shadow-[4px_4px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{isLoading ? 'FINDING SEAT...' : 'QUICK MATCH'}</span>
              </button>
            </div>
          </div>

          {/* Right Column: Create Room, Join by Code & Public Rooms Browser */}
          <div className="lg:col-span-7 space-y-5">
            {/* Create & Join Room Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Create Room Button (Sharp Box) */}
              <button
                onClick={() => {
                  soundService.play('click');
                  setIsCreatingRoom(true);
                }}
                className="p-5 bg-neutral-900 border-2 border-neutral-700 hover:border-emerald-400 text-left shadow-[5px_5px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition group"
              >
                <div className="w-10 h-10 bg-emerald-950 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center mb-3 group-hover:bg-emerald-500 group-hover:text-black transition">
                  <Plus className="w-5 h-5 stroke-[3]" />
                </div>
                <h4 className="font-mono text-base font-black text-white uppercase tracking-wider mb-1">
                  CREATE ROOM
                </h4>
                <p className="font-mono text-xs text-neutral-400">
                  Host custom matches. Choose 2-4 players, match scoring, or private invite codes.
                </p>
              </button>

              {/* Join Room by Code (Sharp Box) */}
              <div className="p-5 bg-neutral-900 border-2 border-neutral-700 shadow-[5px_5px_0px_#000] flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 bg-blue-950 border-2 border-blue-500 text-blue-400 flex items-center justify-center mb-3">
                    <LogIn className="w-5 h-5" />
                  </div>
                  <h4 className="font-mono text-base font-black text-white uppercase tracking-wider mb-1">
                    JOIN BY CODE
                  </h4>
                  <p className="font-mono text-xs text-neutral-400 mb-3">
                    Enter the 6-character room code from your friend.
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    placeholder="CODE"
                    className="w-28 px-2 py-2 bg-neutral-950 border-2 border-neutral-700 text-center font-mono font-black text-sm text-amber-400 uppercase tracking-widest focus:outline-none focus:border-blue-400"
                  />
                  <button
                    disabled={isLoading || !joinCodeInput.trim()}
                    onClick={() => handleJoinByCode()}
                    className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-600 border-2 border-black text-white font-mono font-black text-xs uppercase tracking-wider shadow-[3px_3px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition"
                  >
                    JOIN
                  </button>
                </div>
              </div>
            </div>

            {/* Public Rooms Browser (Sharp Box) */}
            <div className="bg-neutral-900 border-2 border-neutral-700 p-5 shadow-[5px_5px_0px_#000]">
              <div className="flex items-center justify-between border-b-2 border-neutral-800 pb-2.5 mb-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" />
                  <h4 className="font-mono text-xs font-black text-white uppercase tracking-wider">
                    PUBLIC TABLES WAITING FOR PLAYERS
                  </h4>
                </div>
                <button
                  onClick={fetchPublicRooms}
                  disabled={loadingRooms}
                  className="p-1 border border-neutral-700 bg-neutral-950 hover:bg-neutral-800 text-neutral-400 hover:text-white"
                  title="Refresh Rooms"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingRooms ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {publicRooms.length === 0 ? (
                <div className="p-8 text-center bg-neutral-950 border-2 border-neutral-800 text-xs font-mono text-neutral-500">
                  NO ACTIVE PUBLIC TABLES WAITING. CREATE ONE OR CLICK QUICK MATCH!
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {publicRooms.map((room) => (
                    <div
                      key={room.roomCode}
                      className="flex items-center justify-between p-3 bg-neutral-950 border-2 border-neutral-800 hover:border-neutral-600 transition"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-white">
                            {room.hostName}'S TABLE
                          </span>
                          <span className="font-mono text-[10px] px-1.5 py-0.2 bg-neutral-800 text-amber-400 border border-neutral-700 font-bold">
                            {room.roomCode}
                          </span>
                        </div>
                        <div className="font-mono text-[11px] text-neutral-400 flex items-center gap-2 mt-0.5">
                          <span>
                            {room.playerCount}/{room.maxPlayers} PLAYERS
                          </span>
                          <span>•</span>
                          <span>{room.isSingleRound ? 'SINGLE ROUND' : `TARGET ${room.targetScore} PTS`}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleJoinByCode(room.roomCode)}
                        className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 border-2 border-black text-black font-mono font-black text-xs uppercase flex items-center gap-1 shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition"
                      >
                        <span>JOIN</span>
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

      {/* Industrial Footer */}
      <footer className="text-center py-3 bg-neutral-950 border-t-2 border-neutral-900 font-mono text-xs text-neutral-500">
        UNO CLASSIC MULTIPLAYER // 100% REAL HUMAN OPPONENTS // PERSISTENT SCORE ENGINE
      </footer>

      {/* CREATE ROOM MODAL (Sharp Brutalist Box) */}
      {isCreatingRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-neutral-900 border-2 border-neutral-700 p-6 shadow-[6px_6px_0px_#000] text-white">
            <div className="flex items-center justify-between border-b-2 border-neutral-800 pb-3 mb-4">
              <h3 className="font-mono text-base font-black text-white uppercase tracking-wider">
                HOST NEW UNO TABLE
              </h3>
              <button
                onClick={() => setIsCreatingRoom(false)}
                className="w-6 h-6 border border-neutral-700 bg-neutral-950 hover:bg-rose-900 text-neutral-300 font-mono text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRoomSubmit} className="space-y-4">
              {/* Max Players */}
              <div>
                <label className="block font-mono text-xs font-bold uppercase tracking-wider text-neutral-300 mb-1.5">
                  PLAYER CAPACITY
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[2, 3, 4].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setMaxPlayers(num)}
                      className={`py-2 border-2 font-mono text-xs font-bold uppercase transition ${
                        maxPlayers === num
                          ? 'bg-amber-400 text-black border-black shadow-[2px_2px_0px_#000]'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-600'
                      }`}
                    >
                      {num} PLAYERS
                    </button>
                  ))}
                </div>
              </div>

              {/* Match Mode */}
              <div>
                <label className="block font-mono text-xs font-bold uppercase tracking-wider text-neutral-300 mb-1.5">
                  GAME RULES & SCORING
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSingleRound(false)}
                    className={`p-2.5 border-2 text-left font-mono transition ${
                      !isSingleRound
                        ? 'bg-amber-400 text-black border-black shadow-[2px_2px_0px_#000]'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-600'
                    }`}
                  >
                    <span className="font-bold text-xs block">CLASSIC (500 PTS)</span>
                    <span className={`text-[10px] ${!isSingleRound ? 'text-black/80' : 'text-neutral-500'}`}>
                      Cumulative rounds
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsSingleRound(true)}
                    className={`p-2.5 border-2 text-left font-mono transition ${
                      isSingleRound
                        ? 'bg-amber-400 text-black border-black shadow-[2px_2px_0px_#000]'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-600'
                    }`}
                  >
                    <span className="font-bold text-xs block">SINGLE ROUND</span>
                    <span className={`text-[10px] ${isSingleRound ? 'text-black/80' : 'text-neutral-500'}`}>
                      First to zero wins
                    </span>
                  </button>
                </div>
              </div>

              {/* Privacy Setting */}
              <div>
                <label className="block font-mono text-xs font-bold uppercase tracking-wider text-neutral-300 mb-1.5">
                  VISIBILITY
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPrivate(false)}
                    className={`py-2 px-3 border-2 font-mono text-xs font-bold uppercase transition ${
                      !isPrivate
                        ? 'bg-emerald-500 text-black border-black shadow-[2px_2px_0px_#000]'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                    }`}
                  >
                    PUBLIC TABLE
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPrivate(true)}
                    className={`py-2 px-3 border-2 font-mono text-xs font-bold uppercase transition ${
                      isPrivate
                        ? 'bg-blue-500 text-white border-black shadow-[2px_2px_0px_#000]'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                    }`}
                  >
                    PRIVATE (CODE)
                  </button>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreatingRoom(false)}
                  className="flex-1 py-2.5 bg-neutral-950 hover:bg-neutral-800 border-2 border-neutral-700 text-neutral-300 font-mono font-bold text-xs uppercase"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 border-2 border-black text-black font-mono font-black text-xs uppercase tracking-wider shadow-[4px_4px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition"
                >
                  {isLoading ? 'CREATING...' : 'CREATE & HOST'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        currentUser={currentUser}
      />

      {/* Leaderboard Modal */}
      <LeaderboardModal
        isOpen={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
        currentUsername={currentUser?.username}
      />

      {/* How to Play Modal */}
      <HowToPlayModal isOpen={showHowToPlay} onClose={() => setShowHowToPlay(false)} />
    </div>
  );
};
