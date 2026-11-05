import React, { useState, useEffect } from 'react';
import { PlayerPublicInfo } from '../types/uno.ts';
import { CardView } from './CardView.tsx';
import { WifiOff, Flame, MicOff, Volume2, VolumeX, Radio } from 'lucide-react';
import { voiceChatService } from '../services/voiceChat.ts';

interface OpponentSeatProps {
  player: PlayerPublicInfo;
  isActiveTurn: boolean;
  isHost: boolean;
  position: 'top' | 'left' | 'right';
}

const AVATAR_MAP: Record<string, string> = {
  fox: '🦊',
  bear: '🐻',
  panda: '🐼',
  lion: '🦁',
  tiger: '🐯',
  rabbit: '🐰',
  dragon: '🐲',
  spark: '⚡',
};

export const OpponentSeat: React.FC<OpponentSeatProps> = ({
  player,
  isActiveTurn,
  isHost,
  position,
}) => {
  const avatarEmoji = AVATAR_MAP[player.avatar] || '🦊';
  const [, setVoiceTick] = useState(0);

  useEffect(() => {
    // Listen to voice events (speaking, mute changes, etc.)
    return voiceChatService.subscribe(() => {
      setVoiceTick((t) => t + 1);
    });
  }, []);

  const isSpeaking = voiceChatService.isPeerSpeaking(player.id);
  const isPeerMuted = voiceChatService.isPeerMuted(player.id);
  const isLocallyMuted = voiceChatService.isPeerLocallyMuted(player.id);

  // Cap visible rendered card fan to 10 so it doesn't overflow screen, but show actual badge count
  const visibleCardsCount = Math.min(player.cardCount, 8);

  return (
    <div
      className={`flex flex-col items-center transition-all duration-300 ${
        position === 'left' ? 'sm:items-start' : position === 'right' ? 'sm:items-end' : 'items-center'
      }`}
    >
      {/* Player Header Card */}
      <div
        className={`relative flex items-center gap-2.5 px-3.5 py-2 rounded-2xl backdrop-blur-md transition-all duration-300 shadow-xl ${
          isSpeaking
            ? 'bg-neutral-900/95 border-2 border-emerald-400 ring-4 ring-emerald-400/40 shadow-emerald-500/30 scale-105'
            : isActiveTurn
            ? 'bg-neutral-900/90 border-2 border-amber-400 ring-4 ring-amber-400/30 scale-105'
            : 'bg-neutral-950/70 border border-neutral-700/60'
        }`}
      >
        {/* Avatar with status glow & voice ripple */}
        <div className="relative">
          <div
            className={`w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center text-xl md:text-2xl border-2 transition-all ${
              isSpeaking
                ? 'bg-emerald-500/30 border-emerald-400 ring-4 ring-emerald-400/60 shadow-lg'
                : !player.isConnected
                ? 'bg-rose-950/60 border-rose-500 opacity-60'
                : isActiveTurn
                ? 'bg-amber-500/20 border-amber-400'
                : 'bg-neutral-800 border-neutral-600'
            }`}
          >
            {avatarEmoji}
          </div>

          {/* Active Speaking Badge */}
          {isSpeaking && (
            <div className="absolute -top-1 -right-1 p-0.5 rounded-full bg-emerald-500 text-black shadow-md animate-pulse" title="Speaking">
              <Radio className="w-3 h-3" />
            </div>
          )}

          {/* Mic Muted Badge */}
          {isPeerMuted && !isSpeaking && (
            <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-neutral-800 border border-neutral-600 text-neutral-400" title="Microphone Muted">
              <MicOff className="w-2.5 h-2.5" />
            </div>
          )}

          {!player.isConnected && (
            <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-rose-600 text-white shadow-md animate-pulse" title="Player Disconnected">
              <WifiOff className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        {/* Name and card count info */}
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-xs md:text-sm text-white max-w-[100px] truncate">
              {player.name}
            </span>
            {isHost && (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40">
                HOST
              </span>
            )}
            {/* Quick local mute button for this noisy opponent */}
            <button
              onClick={() => voiceChatService.toggleMutePeerLocally(player.id)}
              className={`p-1 rounded-md text-[10px] transition ${
                isLocallyMuted
                  ? 'bg-rose-900/60 text-rose-300 hover:bg-rose-800'
                  : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'
              }`}
              title={isLocallyMuted ? `Unmute ${player.name} for you` : `Mute ${player.name} for you`}
            >
              {isLocallyMuted ? <VolumeX className="w-3 h-3 text-rose-400" /> : <Volume2 className="w-3 h-3 opacity-60 hover:opacity-100" />}
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-neutral-300">
            {!player.isConnected ? (
              <span className="font-bold text-rose-400 text-[10px] animate-pulse">
                Disconnected
              </span>
            ) : (
              <>
                <span className="font-bold text-white bg-neutral-800/80 px-1.5 py-0.5 rounded text-[10px] border border-neutral-700">
                  {player.cardCount} {player.cardCount === 1 ? 'card' : 'cards'}
                </span>
                <span className="text-neutral-400 text-[10px]">{player.totalScore} pts</span>
              </>
            )}
          </div>
        </div>

        {/* UNO Called Flame Badge */}
        {player.calledUno && (
          <div className="px-2 py-0.5 rounded-full bg-gradient-to-r from-red-600 to-amber-500 text-white text-[10px] font-black flex items-center gap-1 shadow-md animate-bounce">
            <Flame className="w-3 h-3" />
            UNO!
          </div>
        )}

        {/* Active turn indicator pulse */}
        {isActiveTurn && (
          <div className="absolute -top-2.5 right-2 px-2 py-0.5 rounded-full bg-amber-400 text-black text-[9px] font-black uppercase tracking-wider animate-pulse shadow-md">
            Thinking...
          </div>
        )}
      </div>

      {/* 3D Overlapping Card Fan */}
      {player.cardCount > 0 && (
        <div className="relative flex items-center justify-center h-16 md:h-20 mt-1 px-4">
          {Array.from({ length: visibleCardsCount }).map((_, index) => {
            const total = visibleCardsCount;
            // Fan rotation angle between -20deg and +20deg
            const angle = total > 1 ? -18 + (36 / (total - 1)) * index : 0;
            const offsetX = total > 1 ? -12 * (total - 1) * 0.5 + index * 12 : 0;

            return (
              <div
                key={index}
                className="absolute transition-transform duration-200"
                style={{
                  transform: `translateX(${offsetX}px) rotate(${angle}deg)`,
                  zIndex: index,
                }}
              >
                <CardView isFaceDown size="xs" className="shadow-md pointer-events-none" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
