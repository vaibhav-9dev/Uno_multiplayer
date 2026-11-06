import React, { useState, useEffect } from 'react';
import { UserAccountProfile } from '../types/uno.ts';
import { authService } from '../services/auth.ts';
import { Trophy, RefreshCw, Crown, Shield, Flame } from 'lucide-react';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUsername?: string;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  isOpen,
  onClose,
  currentUsername,
}) => {
  const [leaderboard, setLeaderboard] = useState<UserAccountProfile[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLeaderboard = async () => {
    setLoading(true);
    const data = await authService.getLeaderboard();
    setLeaderboard(data);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchLeaderboard();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fadeIn">
      {/* Sharp Brutalist Window */}
      <div className="w-full max-w-xl bg-neutral-900 border-2 border-neutral-700 shadow-[6px_6px_0px_#000] text-white max-h-[85vh] flex flex-col">
        {/* Title Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-950 border-b-2 border-neutral-800 shrink-0">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="font-mono text-xs uppercase tracking-wider font-bold text-neutral-200">
              LEADERBOARD // GLOBAL CAREER SCORES
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchLeaderboard}
              disabled={loading}
              className="p-1 border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="w-6 h-6 border border-neutral-700 bg-neutral-900 hover:bg-rose-900 hover:text-white flex items-center justify-center font-mono text-xs transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Subheader info */}
        <div className="px-5 py-3 bg-neutral-950/60 border-b border-neutral-800 text-[11px] font-mono text-neutral-400 shrink-0 flex items-center justify-between">
          <span>Points accumulate after every finished round and match.</span>
          <span className="text-amber-400 font-bold">100% REAL PLAYERS</span>
        </div>

        {/* Table list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {leaderboard.length === 0 && !loading && (
            <div className="p-8 text-center text-xs font-mono text-neutral-500">
              No ranked accounts recorded yet. Play a match to be the first!
            </div>
          )}

          {leaderboard.map((user, idx) => {
            const isMe = currentUsername && user.username.toLowerCase() === currentUsername.toLowerCase();
            const isFirst = idx === 0;
            const isTop3 = idx < 3;

            return (
              <div
                key={user.username}
                className={`flex items-center justify-between p-3 border-2 transition ${
                  isMe
                    ? 'bg-amber-950/30 border-amber-400 shadow-[3px_3px_0px_#d97706]'
                    : isFirst
                    ? 'bg-neutral-950 border-amber-400/80 shadow-[2px_2px_0px_#000]'
                    : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Rank badge */}
                  <div
                    className={`w-7 h-7 border font-mono font-black text-xs flex items-center justify-center ${
                      isFirst
                        ? 'bg-amber-400 text-black border-black'
                        : isTop3
                        ? 'bg-neutral-800 text-amber-300 border-neutral-600'
                        : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                    }`}
                  >
                    #{idx + 1}
                  </div>

                  {/* Avatar */}
                  <span className="text-xl">
                    {user.avatar === 'bear'
                      ? '🐻'
                      : user.avatar === 'panda'
                      ? '🐼'
                      : user.avatar === 'lion'
                      ? '🦁'
                      : user.avatar === 'tiger'
                      ? '🐯'
                      : user.avatar === 'rabbit'
                      ? '🐰'
                      : user.avatar === 'dragon'
                      ? '🐲'
                      : user.avatar === 'spark'
                      ? '⚡'
                      : '🦊'}
                  </span>

                  <div>
                    <div className="flex items-center gap-1.5 font-mono text-sm font-bold text-white">
                      <span>{user.displayName || user.username}</span>
                      {isMe && (
                        <span className="text-[9px] px-1 bg-amber-400 text-black font-black uppercase">
                          YOU
                        </span>
                      )}
                      {isFirst && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                    </div>
                    <div className="text-[10px] font-mono text-neutral-400 flex items-center gap-2 mt-0.5">
                      <span>{user.matchesWon} wins</span>
                      <span>•</span>
                      <span>{user.matchesPlayed} games</span>
                      {user.unoShouts > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-rose-400 flex items-center gap-0.5">
                            <Flame className="w-2.5 h-2.5" />
                            {user.unoShouts}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Score */}
                <div className="text-right">
                  <div className="font-mono text-lg font-black text-amber-400">
                    {user.totalScore.toLocaleString()}
                  </div>
                  <div className="text-[9px] font-mono text-neutral-500 uppercase">
                    POINTS
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 bg-neutral-950 border-t-2 border-neutral-800 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="py-1.5 px-4 bg-neutral-800 hover:bg-neutral-700 text-white font-mono text-xs font-bold uppercase border border-neutral-600 shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px]"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
