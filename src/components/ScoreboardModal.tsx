import React, { useEffect } from 'react';
import { ClientGameState } from '../types/uno.ts';
import confetti from 'canvas-confetti';
import { Trophy, Award, ArrowRight, RotateCcw, Crown, Home } from 'lucide-react';
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
          colors: ['#E51E25', '#0076CE', '#5BB318', '#FFD500'],
        });
      } catch {
        // ignore if canvas is unavailable
      }
    }
  }, [isRoundOver, isGameOver]);

  if (!isRoundOver && !isGameOver) return null;

  const isHost = gameState.hostId === gameState.myPlayerId;
  const winner = gameState.roundWinner;
  const isMe = winner?.playerId === gameState.myPlayerId;

  // Sort players by totalScore descending
  const sortedPlayers = [...gameState.players].sort((a, b) => b.totalScore - a.totalScore);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn">
      <div className="w-full max-w-lg rounded-3xl bg-neutral-900 border-2 border-amber-500/80 p-6 md:p-8 shadow-2xl text-white max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex p-3 rounded-2xl bg-amber-500/20 border border-amber-400 mb-3 text-amber-400">
            {isGameOver ? <Crown className="w-10 h-10 animate-bounce" /> : <Trophy className="w-10 h-10" />}
          </div>
          <h2 className="text-2xl md:text-3xl font-black uppercase tracking-wider text-amber-400">
            {isGameOver ? 'Match Champion!' : 'Round Over!'}
          </h2>
          <p className="text-sm text-neutral-300 mt-1">
            {isGameOver ? (
              <span>
                <strong className="text-white text-base">{gameState.gameWinner?.playerName}</strong> won the entire UNO match!
              </span>
            ) : (
              <span>
                <strong className="text-white text-base">{winner?.playerName}</strong> cleared their hand and won the round!
              </span>
            )}
          </p>
        </div>

        {/* Round Points Breakdown */}
        {winner && (
          <div className="rounded-2xl bg-neutral-950 border border-neutral-800 p-4 mb-6">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-3">
              <span className="text-xs uppercase font-bold text-neutral-400">Round Scoring</span>
              <span className="text-sm font-black text-emerald-400">
                +{winner.pointsEarned} Points
              </span>
            </div>
            <div className="space-y-1.5 text-xs text-neutral-300">
              {winner.breakdown.length === 0 ? (
                <div className="text-neutral-500 italic">No remaining opponent points.</div>
              ) : (
                winner.breakdown.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center py-1 border-b border-neutral-900">
                    <span>From {item.opponentName}'s hand:</span>
                    <span className="font-semibold text-neutral-200">+{item.points} pts</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Match Leaderboard */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-400" />
              Match Standings ({gameState.settings.isSingleRound ? 'Single Round' : `Target: ${gameState.settings.targetScore} pts`})
            </span>
          </div>

          <div className="space-y-2">
            {sortedPlayers.map((p, idx) => {
              const isLead = idx === 0;
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between p-3 rounded-xl border ${
                    isLead
                      ? 'bg-amber-950/30 border-amber-500/50 text-amber-200'
                      : 'bg-neutral-800/60 border-neutral-700/60 text-neutral-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-center font-black text-sm text-neutral-400">#{idx + 1}</span>
                    <span className="text-xl">{p.avatar === 'fox' ? '🦊' : p.avatar === 'bear' ? '🐻' : p.avatar === 'panda' ? '🐼' : p.avatar === 'lion' ? '🦁' : p.avatar === 'tiger' ? '🐯' : p.avatar === 'rabbit' ? '🐰' : p.avatar === 'dragon' ? '🐲' : '⚡'}</span>
                    <div>
                      <div className="font-bold text-sm text-white flex items-center gap-1.5">
                        {p.name}
                        {p.id === gameState.myPlayerId && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-700 text-neutral-300">You</span>
                        )}
                        {isLead && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        Round wins: {p.roundWins}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-base font-black text-white">{p.totalScore}</span>
                    <span className="text-xs text-neutral-400 ml-1">pts</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Host action / waiting message */}
        <div className="mt-4">
          {isHost ? (
            <div className="flex flex-col sm:flex-row gap-3">
              {isGameOver ? (
                <button
                  onClick={() => {
                    soundService.play('click');
                    if (onRestartMatch) onRestartMatch();
                    else onNextRound();
                  }}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black text-base shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-5 h-5" />
                  START NEW MATCH
                </button>
              ) : (
                <button
                  onClick={() => {
                    soundService.play('click');
                    onNextRound();
                  }}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-black text-base shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <span>NEXT ROUND</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              )}
            </div>
          ) : (
            <div className="text-center py-3 rounded-xl bg-neutral-950 border border-neutral-800 text-sm text-neutral-400 animate-pulse">
              Waiting for host ({gameState.players.find((p) => p.id === gameState.hostId)?.name || 'Host'}) to start next round...
            </div>
          )}

          {/* Back to Home / Lobby button */}
          <button
            onClick={() => {
              soundService.play('click');
              if (onLeaveRoom) onLeaveRoom();
            }}
            className="w-full mt-3 py-3 px-4 rounded-xl bg-neutral-800/90 hover:bg-neutral-700 text-neutral-200 hover:text-white font-bold text-sm transition flex items-center justify-center gap-2 border border-neutral-700 shadow-md"
          >
            <Home className="w-4 h-4 text-amber-400" />
            <span>Back to Home Page</span>
          </button>
        </div>
      </div>
    </div>
  );
};
