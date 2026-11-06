import React from 'react';
import { Card, CardColor, CardValue } from '../types/uno.ts';

interface CardViewProps {
  card?: Card;
  isFaceDown?: boolean;
  isPlayable?: boolean;
  onClick?: () => void;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  disabled?: boolean;
}

const COLOR_CLASSES: Record<CardColor, { bg: string; text: string; border: string }> = {
  red: {
    bg: 'bg-red-600',
    text: 'text-red-600',
    border: 'border-white',
  },
  blue: {
    bg: 'bg-blue-600',
    text: 'text-blue-600',
    border: 'border-white',
  },
  green: {
    bg: 'bg-emerald-600',
    text: 'text-emerald-600',
    border: 'border-white',
  },
  yellow: {
    bg: 'bg-amber-400',
    text: 'text-amber-500',
    border: 'border-neutral-900',
  },
  wild: {
    bg: 'bg-neutral-950',
    text: 'text-white',
    border: 'border-amber-400',
  },
};

const SIZE_CLASSES = {
  xs: {
    card: 'w-10 h-14 text-xs',
    oval: 'w-8 h-10',
    center: 'text-sm font-black',
    corner: 'text-[9px] p-0.5',
  },
  sm: {
    card: 'w-14 h-20 text-sm',
    oval: 'w-11 h-15',
    center: 'text-lg font-black',
    corner: 'text-[11px] p-1',
  },
  md: {
    card: 'w-20 h-28 text-base',
    oval: 'w-15 h-22',
    center: 'text-2xl font-black',
    corner: 'text-xs p-1.5',
  },
  lg: {
    card: 'w-24 h-36 text-lg',
    oval: 'w-19 h-28',
    center: 'text-4xl font-black',
    corner: 'text-sm p-2',
  },
  xl: {
    card: 'w-32 h-48 text-xl',
    oval: 'w-25 h-38',
    center: 'text-5xl font-black',
    corner: 'text-base p-2.5',
  },
};

export const CardView: React.FC<CardViewProps> = ({
  card,
  isFaceDown = false,
  isPlayable = false,
  onClick,
  size = 'md',
  className = '',
  disabled = false,
}) => {
  const sizeConfig = SIZE_CLASSES[size];

  // Render Card Back (Crisp, sharp tactile UNO card back)
  if (isFaceDown || !card) {
    return (
      <div
        className={`relative ${sizeConfig.card} rounded-[3px] bg-neutral-950 border-2 border-white/90 shadow-[3px_3px_0px_#000] flex items-center justify-center select-none overflow-hidden transition-all duration-150 ${className}`}
      >
        <div className="absolute inset-1 rounded-[2px] border border-neutral-800 bg-neutral-900 flex items-center justify-center overflow-hidden">
          {/* Tilted red oval badge */}
          <div className="w-[88%] h-[68%] -rotate-25 rounded-[45%] bg-gradient-to-tr from-red-700 to-rose-500 shadow-md flex items-center justify-center border-2 border-amber-300">
            <span className="font-black italic text-amber-300 tracking-tighter drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)] text-center text-xs md:text-sm select-none font-sans">
              UNO
            </span>
          </div>
        </div>
      </div>
    );
  }

  const colorConfig = COLOR_CLASSES[card.color] || COLOR_CLASSES.wild;

  // Render card value label and icon with sharp typographic precision
  const renderCardContent = (val: CardValue, isCorner = false) => {
    switch (val) {
      case 'skip':
        return isCorner ? (
          <span className="font-black font-mono">⊘</span>
        ) : (
          <div className="flex flex-col items-center justify-center">
            <span className="text-2xl md:text-3xl font-black leading-none font-mono">⊘</span>
          </div>
        );
      case 'reverse':
        return isCorner ? (
          <span className="font-black font-mono">⇄</span>
        ) : (
          <div className="flex flex-col items-center justify-center">
            <span className="text-2xl md:text-3xl font-black leading-none font-mono">⇄</span>
          </div>
        );
      case 'draw2':
        return <span className="font-mono font-black">+2</span>;
      case 'wild4':
        return isCorner ? (
          <span className="font-black font-mono text-amber-300">+4</span>
        ) : (
          <div className="flex flex-col items-center justify-center">
            <span className="text-2xl md:text-3xl font-black font-mono text-amber-300 tracking-tight drop-shadow-md">
              +4
            </span>
          </div>
        );
      case 'wild':
        return isCorner ? (
          <span className="font-black font-mono">W</span>
        ) : (
          /* 4-quadrant official sharp wild wheel */
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-[2px] overflow-hidden grid grid-cols-2 shadow-inner border border-white/80">
            <div className="bg-red-500" />
            <div className="bg-blue-500" />
            <div className="bg-amber-400" />
            <div className="bg-emerald-500" />
          </div>
        );
      case '6':
      case '9':
        // Official UNO cards underline 6 and 9
        return <span className="font-mono underline decoration-2 underline-offset-2">{val}</span>;
      default:
        return <span className="font-mono font-black">{val}</span>;
    }
  };

  return (
    <div
      onClick={!disabled && isPlayable && onClick ? onClick : undefined}
      className={`relative ${sizeConfig.card} ${colorConfig.bg} rounded-[3px] border-2 ${colorConfig.border} select-none cursor-pointer transition-all duration-150 transform-gpu ${
        isPlayable && !disabled
          ? 'shadow-[4px_4px_0px_#f59e0b] hover:-translate-y-3 hover:scale-105 ring-2 ring-amber-400 ring-offset-2 ring-offset-neutral-950 animate-pulse'
          : disabled
          ? 'cursor-not-allowed opacity-70 shadow-[2px_2px_0px_#000]'
          : 'shadow-[3px_3px_0px_#000] hover:-translate-y-1'
      } ${className}`}
      title={
        card.color === 'wild'
          ? card.value === 'wild4'
            ? 'Wild Draw 4'
            : 'Wild'
          : `${card.color.toUpperCase()} ${card.value.toUpperCase()}`
      }
    >
      {/* Top-left corner index */}
      <div
        className={`absolute top-0 left-0 ${sizeConfig.corner} font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] leading-none select-none`}
      >
        {renderCardContent(card.value, true)}
      </div>

      {/* Bottom-right corner index (rotated 180deg) */}
      <div
        className={`absolute bottom-0 right-0 ${sizeConfig.corner} font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] leading-none rotate-180 select-none`}
      >
        {renderCardContent(card.value, true)}
      </div>

      {/* Center White Oval with Crisp Contrast */}
      <div className="absolute inset-0 flex items-center justify-center p-1.5 pointer-events-none">
        <div
          className={`${sizeConfig.oval} -rotate-25 rounded-[45%] bg-white shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] flex items-center justify-center border border-black/20`}
        >
          <div
            className={`rotate-25 ${sizeConfig.center} ${colorConfig.text} drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)] leading-none select-none`}
          >
            {renderCardContent(card.value, false)}
          </div>
        </div>
      </div>
    </div>
  );
};
