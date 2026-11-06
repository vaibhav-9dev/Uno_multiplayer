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
    // Listen to voice events
    return voiceChatService.subscribe(() => {
      setVoiceTick((t) => t + 1);
    });
  }, []);

  const isSpeaking = voiceChatService.isPeerSpeaking(player.id);
  const isPeerMuted = voiceChatService.isPeerMuted(player.id);
  const isLocallyMuted = voiceChatService.isPeerLocallyMuted(player.id);

  // Cap visible rendered card fan to 8 so it fits nicely
  const visibleCardsCount = Math.min(player.cardCount, 8);

  return (
    <div
      className={`flex flex-col items-center transition-all duration-200 ${
        position === 'left' ? 'sm:items-start' : position === 'right' ? 'sm:items-end' : 'items-center'
      }`}
    >
      {/* Player Header Box (Sharp Engineered Plaque) */}
      <div
        className={`relative flex items-center gap-2.5 px-3 py-2 border-2 transition-all duration-150 ${
          isSpeaking
            ? 'bg-neutral-900 border-emerald-400 shadow-[4px_4px_0px_#059669]'
            : isActiveTurn
            ? 'bg-neutral-900 border-amber-400 shadow-[4px_4px_0px_#d97706]'
            : 'bg-neutral-950 border-neutral-800 shadow-[3px_3px_0px_#000]'
        }`}
      >
        {/* Avatar with status border */}
        <div className="relative">
          <div
            className={`w-9 h-9 border-2 flex items-center justify-center text-xl transition-all ${
              isSpeaking
                ? 'bg-emerald-950 border-emerald-400 text-emerald-300'
                : !player.isConnected
                ? 'bg-rose-950 border-rose-500 opacity-60'
                : isActiveTurn
                ? 'bg-amber-950 border-amber-400'
                : 'bg-neutral-900 border-neutral-700'
            }`}
          >
            {avatarEmoji}
          </div>

          {/* Active Speaking Pip */}
          {isSpeaking && (
            <div
              className="absolute -top-1.5 -right-1.5 p-0.5 bg-emerald-500 text-black border border-black shadow-[1px_1px_0px_#000]"
              title="Speaking"
            >
              <Radio className="w-2.5 h-2.5" />
            </div>
          )}

          {/* Mic Muted Pip */}
          {isPeerMuted && !isSpeaking && (
            <div
              className="absolute -bottom-1 -right-1 p-0.5 bg-neutral-900 border border-neutral-700 text-neutral-400"
              title="Microphone Muted"
            >
              <MicOff className="w-2.5 h-2.5" />
            </div>
          )}

          {!player.isConnected && (
            <div
              className="absolute -bottom-1 -right-1 p-0.5 bg-rose-600 text-white border border-black animate-pulse"
              title="Player Disconnected"
            >
              <WifiOff className="w-2.5 h-2.5" />
            </div>
          )}
        </div>

        {/* Name and card count info */}
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-xs md:text-sm text-white max-w-[95px] truncate">
              {player.name}
            </span>
            {isHost && (
              <span className="text-[9px] font-mono px-1 py-0.2 bg-amber-400 text-black font-black uppercase">
                HOST
              </span>
            )}
            {/* Quick local mute button */}
            <button
              onClick={() => voiceChatService.toggleMutePeerLocally(player.id)}
              className={`p-0.5 text-[10px] border transition ${
                isLocallyMuted
                  ? 'bg-rose-950 border-rose-600 text-rose-300'
                  : 'border-transparent text-neutral-500 hover:text-neutral-300 hover:border-neutral-700'
              }`}
              title={isLocallyMuted ? `Unmute ${player.name}` : `Mute ${player.name}`}
            >
              {isLocallyMuted ? <VolumeX className="w-3 h-3 text-rose-400" /> : <Volume2 className="w-3 h-3" />}
            </button>
          </div>

          <div className="flex items-center gap-2 font-mono text-[10px] text-neutral-400 mt-0.5">
            {!player.isConnected ? (
              <span className="font-bold text-rose-400 animate-pulse">[DISCONNECTED]</span>
            ) : (
              <>
                <span className="font-bold text-white bg-neutral-900 px-1 py-0.2 border border-neutral-800">
                  {player.cardCount} {player.cardCount === 1 ? 'CARD' : 'CARDS'}
                </span>
                <span className="text-amber-400 font-bold">{player.totalScore} PTS</span>
              </>
            )}
          </div>
        </div>

        {/* UNO Called Flame Badge */}
        {player.calledUno && (
          <div className="px-1.5 py-0.5 bg-rose-600 border border-white text-white font-mono text-[9px] font-black flex items-center gap-1 shadow-[2px_2px_0px_#000] animate-bounce">
            <Flame className="w-2.5 h-2.5 text-amber-300" />
            UNO!
          </div>
        )}

        {/* Active turn indicator tag */}
        {isActiveTurn && (
          <div className="absolute -top-2.5 right-1 px-1.5 py-0.2 bg-amber-400 border border-black text-black font-mono text-[9px] font-black uppercase tracking-wider shadow-[2px_2px_0px_#000]">
            TURN
          </div>
        )}
      </div>

      {/* Overlapping Card Fan */}
      {player.cardCount > 0 && (
        <div className="relative flex items-center justify-center h-14 md:h-16 mt-1 px-3">
          {Array.from({ length: visibleCardsCount }).map((_, index) => {
            const total = visibleCardsCount;
            const angle = total > 1 ? -16 + (32 / (total - 1)) * index : 0;
            const offsetX = total > 1 ? -10 * (total - 1) * 0.5 + index * 10 : 0;

            return (
              <div
                key={index}
                className="absolute transition-transform duration-150"
                style={{
                  transform: `translateX(${offsetX}px) rotate(${angle}deg)`,
                  zIndex: index,
                }}
              >
                <CardView isFaceDown size="xs" className="pointer-events-none" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
