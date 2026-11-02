import React from 'react';
import { ActiveColor } from '../types/uno.ts';
import { soundService } from '../services/sound.ts';

interface ColorPickerModalProps {
  isOpen: boolean;
  onSelectColor: (color: ActiveColor) => void;
  title?: string;
}

export const ColorPickerModal: React.FC<ColorPickerModalProps> = ({
  isOpen,
  onSelectColor,
  title = 'Choose Next Color',
}) => {
  if (!isOpen) return null;

  const colors: { key: ActiveColor; name: string; bg: string; hover: string; ring: string }[] = [
    { key: 'red', name: 'RED', bg: 'bg-red-600', hover: 'hover:bg-red-500', ring: 'ring-red-400' },
    { key: 'blue', name: 'BLUE', bg: 'bg-blue-600', hover: 'hover:bg-blue-500', ring: 'ring-blue-400' },
    { key: 'yellow', name: 'YELLOW', bg: 'bg-yellow-400', hover: 'hover:bg-yellow-300', ring: 'ring-yellow-300' },
    { key: 'green', name: 'GREEN', bg: 'bg-emerald-600', hover: 'hover:bg-emerald-500', ring: 'ring-emerald-400' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-80 md:w-96 rounded-3xl bg-neutral-900 border-2 border-neutral-700 p-6 shadow-2xl text-center">
        <h3 className="text-xl md:text-2xl font-black text-white tracking-wide mb-1 uppercase">
          {title}
        </h3>
        <p className="text-xs md:text-sm text-neutral-400 mb-6 font-medium">
          Select which color continues the game:
        </p>

        <div className="grid grid-cols-2 gap-4">
          {colors.map((c) => (
            <button
              key={c.key}
              onClick={() => {
                soundService.play('wild_pick');
                onSelectColor(c.key);
              }}
              className={`${c.bg} ${c.hover} h-24 md:h-28 rounded-2xl flex flex-col items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 ${c.ring}`}
            >
              <div className="w-8 h-8 rounded-full bg-white/20 border-2 border-white/40 mb-1 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-white" />
              </div>
              <span className="text-lg font-black tracking-wider text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                {c.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
