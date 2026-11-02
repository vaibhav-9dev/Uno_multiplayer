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

const COLOR_CLASSES: Record<CardColor, { bg: string; text: string; ring: string }> = {
  red: {
    bg: 'bg-gradient-to-br from-red-500 via-red-600 to-rose-700',
    text: 'text-red-600',
    ring: 'ring-red-400',
  },
  blue: {
    bg: 'bg-gradient-to-br from-blue-500 via-blue-600 to-sky-700',
    text: 'text-blue-600',
    ring: 'ring-blue-400',
  },
  green: {
    bg: 'bg-gradient-to-br from-emerald-500 via-green-600 to-emerald-700',
    text: 'text-green-600',
    ring: 'ring-green-400',
  },
  yellow: {
    bg: 'bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500',
    text: 'text-amber-500',
    ring: 'ring-amber-300',
  },
  wild: {
    bg: 'bg-gradient-to-br from-neutral-900 via-neutral-950 to-black',
    text: 'text-white',
    ring: 'ring-purple-400',
  },
};

const SIZE_CLASSES = {
  xs: {
    card: 'w-10 h-14 rounded-md text-xs',
    oval: 'w-8 h-10',
    center: 'text-sm font-black',
    corner: 'text-[9px] p-0.5',
  },
  sm: {
    card: 'w-14 h-20 rounded-lg text-sm',
    oval: 'w-11 h-16',
    center: 'text-lg font-black',
    corner: 'text-[11px] p-1',
  },
  md: {
    card: 'w-20 h-28 rounded-xl text-base',
    oval: 'w-16 h-22',
    center: 'text-2xl font-black',
    corner: 'text-xs p-1.5',
  },
  lg: {
    card: 'w-24 h-36 rounded-2xl text-lg',
    oval: 'w-20 h-28',
    center: 'text-4xl font-black',
    corner: 'text-sm p-2',
  },
  xl: {
    card: 'w-32 h-48 rounded-2xl text-xl',
    oval: 'w-26 h-38',
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

  // Render Card Back (Classic UNO back)
  if (isFaceDown || !card) {
    return (
      <div
        className={`relative ${sizeConfig.card} bg-neutral-950 border-2 border-white/90 shadow-xl flex items-center justify-center select-none overflow-hidden transition-all duration-200 ${className}`}
      >
        {/* Subtle patterned card back texture */}
        <div className="absolute inset-1 rounded-lg border border-neutral-800 bg-neutral-900 flex items-center justify-center overflow-hidden">
          {/* Classic tilted red oval */}
          <div className="w-[85%] h-[65%] -rotate-25 rounded-[50%] bg-gradient-to-tr from-red-700 via-red-600 to-rose-500 shadow-md flex items-center justify-center border-2 border-amber-300">
            <span className="font-black italic text-amber-300 tracking-tighter drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] text-center text-sm md:text-base font-sans select-none">
              UNO
            </span>
          </div>
        </div>
      </div>
    );
  }

  const colorConfig = COLOR_CLASSES[card.color] || COLOR_CLASSES.wild;

  // Render card value label and icon
  const renderCardContent = (val: CardValue, isCorner = false) => {
    switch (val) {
      case 'skip':
        return isCorner ? (
          <span>⊘</span>
        ) : (
          <div className="flex flex-col items-center justify-center">
            <span className="text-2xl md:text-3xl font-black leading-none">⊘</span>
          </div>
        );
      case 'reverse':
        return isCorner ? (
          <span>⇄</span>
        ) : (
          <div className="flex flex-col items-center justify-center">
            <span className="text-2xl md:text-3xl font-black leading-none">⇄</span>
          </div>
        );
      case 'draw2':
        return <span>+2</span>;
      case 'wild4':
        return isCorner ? (
          <span className="font-black text-amber-300">+4</span>
        ) : (
          <div className="flex flex-col items-center justify-center">
            <span className="text-2xl md:text-3xl font-black text-amber-300 tracking-tighter drop-shadow-md">
              +4
            </span>
          </div>
        );
      case 'wild':
        return isCorner ? (
          <span className="font-black">W</span>
        ) : (
          /* 4-quadrant official wild wheel */
          <div className="w-8 h-8 md:w-11 md:h-11 rounded-full overflow-hidden grid grid-cols-2 shadow-inner border border-white/60">
            <div className="bg-red-500" />
            <div className="bg-blue-500" />
            <div className="bg-yellow-400" />
            <div className="bg-green-500" />
          </div>
        );
      case '6':
      case '9':
        // Official UNO cards have an underline on 6 and 9 to avoid ambiguity
        return <span className="underline decoration-2 underline-offset-2">{val}</span>;
      default:
        return <span>{val}</span>;
    }
  };

  return (
    <div
      onClick={!disabled && isPlayable && onClick ? onClick : undefined}
      className={`relative ${sizeConfig.card} ${colorConfig.bg} border-2 border-white/95 shadow-lg select-none cursor-pointer transition-all duration-200 transform-gpu ${
        isPlayable && !disabled
          ? 'hover:-translate-y-3 hover:shadow-2xl hover:scale-105 ring-4 ring-amber-300 ring-offset-2 ring-offset-emerald-950 animate-pulse'
          : disabled
          ? 'cursor-not-allowed opacity-75'
          : 'hover:-translate-y-1'
      } ${className}`}
      title={
        card.color === 'wild'
          ? card.value === 'wild4'
            ? 'Wild Draw 4'
            : 'Wild'
          : `${card.color.toUpperCase()} ${card.value.toUpperCase()}`
      }
    >
      {/* Glossy inner bevel */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-black/20 via-transparent to-white/25 pointer-events-none" />

      {/* Top-left corner index */}
      <div className={`absolute top-0 left-0 ${sizeConfig.corner} font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] leading-none select-none`}>
        {renderCardContent(card.value, true)}
      </div>

      {/* Bottom-right corner index (rotated 180deg) */}
      <div className={`absolute bottom-0 right-0 ${sizeConfig.corner} font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] leading-none rotate-180 select-none`}>
        {renderCardContent(card.value, true)}
      </div>

      {/* Center White Oval */}
      <div className="absolute inset-0 flex items-center justify-center p-2 pointer-events-none">
        <div
          className={`${sizeConfig.oval} -rotate-25 rounded-[50%] bg-white shadow-inner flex items-center justify-center border border-black/10`}
        >
          <div
            className={`rotate-25 ${sizeConfig.center} ${colorConfig.text} drop-shadow-[0_2px_3px_rgba(0,0,0,0.3)] leading-none select-none`}
          >
            {renderCardContent(card.value, false)}
          </div>
        </div>
      </div>
    </div>
  );
};
