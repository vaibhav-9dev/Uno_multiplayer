import React, { useState } from 'react';
import { authService } from '../services/auth.ts';
import { soundService } from '../services/sound.ts';
import { UserAccountProfile } from '../types/uno.ts';
import { Shield, Trophy, Flame, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccountProfile | null;
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

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, currentUser }) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('fox');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!username.trim()) {
      setErrorMsg('Username is required.');
      return;
    }
    if (!password) {
      setErrorMsg('Password is required.');
      return;
    }

    setLoading(true);
    soundService.play('click');

    try {
      if (tab === 'login') {
        const res = await authService.login(username.trim(), password);
        if (res.success) {
          setSuccessMsg(`Welcome back, ${res.user?.displayName || res.user?.username}!`);
          setTimeout(() => {
            onClose();
          }, 600);
        } else {
          setErrorMsg(res.message || 'Login failed. Check your credentials.');
        }
      } else {
        const res = await authService.register(username.trim(), password, selectedAvatar);
        if (res.success) {
          setSuccessMsg(`Account created! Score will persist after every match.`);
          setTimeout(() => {
            onClose();
          }, 700);
        } else {
          setErrorMsg(res.message || 'Registration failed.');
        }
      }
    } catch {
      setErrorMsg('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    soundService.play('click');
    authService.logout();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fadeIn">
      {/* Sharp Brutalist Window */}
      <div className="w-full max-w-md bg-neutral-900 border-2 border-neutral-700 shadow-[6px_6px_0px_#000] text-white">
        {/* Window Mechanical Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-950 border-b-2 border-neutral-800">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-amber-400 border border-neutral-700" />
            <span className="font-mono text-xs uppercase tracking-wider font-bold text-neutral-300">
              {currentUser ? 'ACCOUNT // PROFILE & CAREER' : 'AUTHENTICATION // LOGIN'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 border border-neutral-700 bg-neutral-900 hover:bg-rose-900 hover:text-white flex items-center justify-center font-mono text-xs transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {currentUser ? (
            /* Logged In Profile & Career Stats */
            <div className="space-y-5">
              <div className="p-4 bg-neutral-950 border-2 border-neutral-800 flex items-center gap-4">
                <div className="w-14 h-14 bg-neutral-900 border-2 border-amber-400 flex items-center justify-center text-3xl shadow-[3px_3px_0px_#000]">
                  {AVATARS.find((a) => a.id === currentUser.avatar)?.emoji || '🦊'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg text-white font-mono uppercase tracking-wide">
                      {currentUser.displayName || currentUser.username}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-600 font-bold">
                      ACTIVE
                    </span>
                  </div>
                  <div className="text-xs text-neutral-400 font-mono mt-0.5">
                    ID: @{currentUser.username}
                  </div>
                </div>
              </div>

              {/* Career Stats Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 bg-neutral-950 border-2 border-neutral-800">
                  <span className="text-[10px] uppercase font-mono text-neutral-400 flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    CAREER SCORE
                  </span>
                  <div className="text-2xl font-black font-mono text-amber-400 mt-1">
                    {currentUser.totalScore.toLocaleString()}
                  </div>
                  <span className="text-[10px] text-neutral-500 font-mono">
                    Adds after every match
                  </span>
                </div>

                <div className="p-3 bg-neutral-950 border-2 border-neutral-800">
                  <span className="text-[10px] uppercase font-mono text-neutral-400 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    MATCH WINS
                  </span>
                  <div className="text-2xl font-black font-mono text-emerald-400 mt-1">
                    {currentUser.matchesWon}{' '}
                    <span className="text-xs text-neutral-500 font-normal">/ {currentUser.matchesPlayed}</span>
                  </div>
                  <span className="text-[10px] text-neutral-500 font-mono">
                    {currentUser.matchesPlayed > 0
                      ? `${Math.round((currentUser.matchesWon / currentUser.matchesPlayed) * 100)}% Win Rate`
                      : 'No matches yet'}
                  </span>
                </div>

                <div className="p-3 bg-neutral-950 border-2 border-neutral-800">
                  <span className="text-[10px] uppercase font-mono text-neutral-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                    ROUNDS WON
                  </span>
                  <div className="text-xl font-black font-mono text-white mt-1">
                    {currentUser.roundsWon}
                  </div>
                </div>

                <div className="p-3 bg-neutral-950 border-2 border-neutral-800">
                  <span className="text-[10px] uppercase font-mono text-neutral-400 flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-rose-400" />
                    UNO SHOUTS
                  </span>
                  <div className="text-xl font-black font-mono text-white mt-1">
                    {currentUser.unoShouts}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  onClick={handleLogout}
                  className="w-full py-2.5 px-4 bg-neutral-950 hover:bg-neutral-800 border-2 border-neutral-700 text-rose-400 hover:text-rose-300 font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-[2px_2px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition"
                >
                  <LogOut className="w-4 h-4" />
                  LOG OUT ACCOUNT
                </button>
              </div>
            </div>
          ) : (
            /* Login / Register Forms */
            <div>
              {/* Tab Toggle */}
              <div className="flex border-2 border-neutral-800 bg-neutral-950 p-1 mb-5">
                <button
                  type="button"
                  onClick={() => {
                    soundService.play('click');
                    setTab('login');
                    setErrorMsg(null);
                  }}
                  className={`flex-1 py-2 font-mono text-xs font-bold uppercase tracking-wider transition ${
                    tab === 'login'
                      ? 'bg-amber-400 text-black border border-black shadow-[2px_2px_0px_#000]'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  SIGN IN
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundService.play('click');
                    setTab('register');
                    setErrorMsg(null);
                  }}
                  className={`flex-1 py-2 font-mono text-xs font-bold uppercase tracking-wider transition ${
                    tab === 'register'
                      ? 'bg-amber-400 text-black border border-black shadow-[2px_2px_0px_#000]'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  CREATE ACCOUNT
                </button>
              </div>

              {/* Feedback messages */}
              {errorMsg && (
                <div className="mb-4 p-2.5 bg-rose-950 border-2 border-rose-600 text-rose-200 text-xs font-mono flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="mb-4 p-2.5 bg-emerald-950 border-2 border-emerald-600 text-emerald-200 text-xs font-mono flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{successMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Username */}
                <div>
                  <label className="block text-xs font-mono font-bold uppercase tracking-wider text-neutral-300 mb-1">
                    USERNAME
                  </label>
                  <input
                    type="text"
                    maxLength={18}
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. card_shark"
                    className="w-full px-3 py-2 bg-neutral-950 border-2 border-neutral-700 text-white font-mono text-sm focus:outline-none focus:border-amber-400 transition"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-mono font-bold uppercase tracking-wider text-neutral-300 mb-1">
                    PASSWORD
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-neutral-950 border-2 border-neutral-700 text-white font-mono text-sm focus:outline-none focus:border-amber-400 transition"
                  />
                </div>

                {/* Avatar Picker (Only for register) */}
                {tab === 'register' && (
                  <div>
                    <label className="block text-xs font-mono font-bold uppercase tracking-wider text-neutral-300 mb-1">
                      CHOOSE BADGE AVATAR
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {AVATARS.map((av) => (
                        <button
                          key={av.id}
                          type="button"
                          onClick={() => {
                            soundService.play('click');
                            setSelectedAvatar(av.id);
                          }}
                          className={`p-2 border-2 flex flex-col items-center justify-center transition ${
                            selectedAvatar === av.id
                              ? 'bg-amber-400/20 border-amber-400 text-white shadow-[2px_2px_0px_#000]'
                              : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                          }`}
                        >
                          <span className="text-xl">{av.emoji}</span>
                          <span className="text-[9px] font-mono mt-0.5">{av.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-amber-400 hover:bg-amber-300 text-black font-black font-mono text-xs uppercase tracking-wider border-2 border-black shadow-[4px_4px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition disabled:opacity-50"
                  >
                    {loading
                      ? 'PROCESSING...'
                      : tab === 'login'
                      ? 'LOG IN & LOAD SCORE'
                      : 'CREATE ACCOUNT & START SCORING'}
                  </button>
                </div>
              </form>

              <div className="mt-4 p-3 bg-neutral-950 border border-neutral-800 text-[11px] font-mono text-neutral-400">
                ℹ️ When logged in, your points won in every UNO round and match victory accumulate into your permanent career score!
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
