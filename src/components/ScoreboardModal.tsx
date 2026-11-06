import React, { useEffect } from 'react';
import { ClientGameState } from '../types/uno.ts';
import confetti from 'canvas-confetti';
import { Trophy, Award, ArrowRight, RotateCcw, Crown, Home, CheckCircle2 } from 'lucide-react';
import { soundService } from '../services/sound.ts';

interface ScoreboardModalProps {
  gameState: ClientGameState;
  onNextRound: () => void;
  onRestartMatch?: () => void;
  onLeaveRoom?: () => void;
}

export const ScoreboardModal: React.FC<ScoreboardModalProps> = ({
  gameState,
  onNextRound,
  onRestartMatch,
  onLeaveRoom,
}) => {
  const isRoundOver = gameState.status === 'round_over';
  const isGameOver = gameState.status === 'game_over';

  useEffect(() => {
    if (isRoundOver || isGameOver) {
      soundService.play('win');
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#dc2626', '#2563eb', '#16a34a', '#f59e0b'],
        });
      } catch {
        // ignore if canvas is unavailable
      }
    }
  }, [isRoundOver, isGameOver]);

  if (!isRoundOver && !isGameOver) return null;

  const isHost = gameState.hostId === gameState.myPlayerId;
  const winner = gameState.roundWinner;

  // Sort players by totalScore descending
  const sortedPlayers = [...gameState.players].sort((a, b) => b.totalScore - a.totalScore);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fadeIn">
      {/* Sharp Brutalist Window */}
      <div className="w-full max-w-lg bg-neutral-900 border-2 border-neutral-700 shadow-[6px_6px_0px_#000] text-white max-h-[90vh] overflow-y-auto">
        {/* Title Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-950 border-b-2 border-neutral-800">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-amber-400 border border-neutral-700" />
            <span className="font-mono text-xs uppercase tracking-wider font-bold text-neutral-300">
              {isGameOver ? 'MATCH CHAMPIONSHIP // FINAL RESULTS' : 'ROUND FINISHED // SCORE TALLY'}
            </span>
          </div>
          {onLeaveRoom && (
            <button
              onClick={onLeaveRoom}
              className="w-6 h-6 border border-neutral-700 bg-neutral-900 hover:bg-rose-900 hover:text-white flex items-center justify-center font-mono text-xs"
            >
              ✕
            </button>
          )}
        </div>

        <div className="p-6">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex p-3 bg-neutral-950 border-2 border-amber-400 shadow-[3px_3px_0px_#000] mb-3 text-amber-400">
              {isGameOver ? <Crown className="w-9 h-9 animate-bounce" /> : <Trophy className="w-9 h-9" />}
            </div>
            <h2 className="font-mono text-2xl font-black uppercase tracking-wider text-amber-400">
              {isGameOver ? 'MATCH CHAMPION!' : 'ROUND OVER!'}
            </h2>
            <p className="font-mono text-xs text-neutral-300 mt-1">
              {isGameOver ? (
                <span>
                  <strong className="text-white text-sm">
                    {gameState.gameWinner?.playerName.toUpperCase()}
                  </strong>{' '}
                  WON THE ENTIRE UNO MATCH!
                </span>
              ) : (
                <span>
                  <strong className="text-white text-sm">
                    {winner?.playerName.toUpperCase()}
                  </strong>{' '}
                  CLEARED THEIR HAND AND WON THE ROUND!
                </span>
              )}
            </p>
          </div>

          {/* Round Points Breakdown */}
          {winner && (
            <div className="bg-neutral-950 border-2 border-neutral-800 p-4 mb-5">
              <div className="flex items-center justify-between border-b-2 border-neutral-850 pb-2 mb-2.5">
                <span className="font-mono text-xs uppercase font-bold text-neutral-400">
                  ROUND SCORE ADDED
                </span>
                <span className="font-mono text-sm font-black text-emerald-400">
                  +{winner.pointsEarned} POINTS
                </span>
              </div>
              <div className="space-y-1 font-mono text-xs text-neutral-300">
                {winner.breakdown.length === 0 ? (
                  <div className="text-neutral-500 italic">No remaining opponent points.</div>
                ) : (
                  winner.breakdown.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center py-1 border-b border-neutral-900"
                    >
                      <span className="text-neutral-400">From {item.opponentName}'s hand:</span>
                      <span className="font-bold text-white">+{item.points} pts</span>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-2.5 pt-2 border-t border-neutral-900 flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Points credited to player's persistent account score!</span>
              </div>
            </div>
          )}

          {/* Match Leaderboard */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-400" />
                MATCH STANDINGS (
                {gameState.settings.isSingleRound
                  ? 'SINGLE ROUND'
                  : `TARGET: ${gameState.settings.targetScore} PTS`}
                )
              </span>
            </div>

            <div className="space-y-2">
              {sortedPlayers.map((p, idx) => {
                const isLead = idx === 0;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between p-3 border-2 font-mono transition ${
                      isLead
                        ? 'bg-amber-950/25 border-amber-400/80 shadow-[2px_2px_0px_#000]'
                        : 'bg-neutral-950 border-neutral-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-center font-mono font-black text-xs text-neutral-400">
                        #{idx + 1}
                      </span>
                      <span className="text-xl">
                        {p.avatar === 'bear'
                          ? '🐻'
                          : p.avatar === 'panda'
                          ? '🐼'
                          : p.avatar === 'lion'
                          ? '🦁'
                          : p.avatar === 'tiger'
                          ? '🐯'
                          : p.avatar === 'rabbit'
                          ? '🐰'
                          : p.avatar === 'dragon'
                          ? '🐲'
                          : p.avatar === 'spark'
                          ? '⚡'
                          : '🦊'}
                      </span>
                      <div>
                        <div className="font-bold text-xs md:text-sm text-white flex items-center gap-1.5">
                          {p.name}
                          {p.id === gameState.myPlayerId && (
                            <span className="text-[9px] px-1 bg-neutral-800 text-neutral-300 border border-neutral-700">
                              YOU
                            </span>
                          )}
                          {isLead && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                        </div>
                        <div className="text-[10px] text-neutral-400">
                          Rounds Won: {p.roundWins}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-base font-black text-amber-400">{p.totalScore}</span>
                      <span className="text-[10px] text-neutral-400 ml-1">PTS</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Host action / waiting message */}
          <div className="mt-4">
            {isHost ? (
              <div className="flex flex-col sm:flex-row gap-2.5">
                {isGameOver ? (
                  <button
                    onClick={() => {
                      soundService.play('click');
                      if (onRestartMatch) onRestartMatch();
                      else onNextRound();
                    }}
                    className="w-full py-3 bg-amber-400 hover:bg-amber-300 border-2 border-black text-black font-mono font-black text-xs uppercase tracking-wider shadow-[4px_4px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    START NEW MATCH
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      soundService.play('click');
                      onNextRound();
                    }}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 border-2 border-black text-black font-mono font-black text-xs uppercase tracking-wider shadow-[4px_4px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition flex items-center justify-center gap-2"
                  >
                    <span>NEXT ROUND</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center py-2.5 bg-neutral-950 border-2 border-neutral-800 text-xs font-mono text-neutral-400 animate-pulse">
                Waiting for host (
                {gameState.players.find((p) => p.id === gameState.hostId)?.name || 'Host'}) to start
                next round...
              </div>
            )}

            {/* Back to Home / Lobby button */}
            <button
              onClick={() => {
                soundService.play('click');
                if (onLeaveRoom) onLeaveRoom();
              }}
              className="w-full mt-2.5 py-2.5 bg-neutral-950 hover:bg-neutral-800 text-neutral-300 hover:text-white font-mono font-bold text-xs uppercase border-2 border-neutral-700 shadow-[3px_3px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition flex items-center justify-center gap-2"
            >
              <Home className="w-3.5 h-3.5 text-amber-400" />
              <span>RETURN TO LOBBY</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
