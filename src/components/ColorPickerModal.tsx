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
  title = 'CHOOSE ACTIVE COLOR',
}) => {
  if (!isOpen) return null;

  const colors: { key: ActiveColor; name: string; bg: string; hover: string; border: string }[] = [
    { key: 'red', name: 'RED', bg: 'bg-red-600', hover: 'hover:bg-red-500', border: 'border-white' },
    { key: 'blue', name: 'BLUE', bg: 'bg-blue-600', hover: 'hover:bg-blue-500', border: 'border-white' },
    { key: 'yellow', name: 'YELLOW', bg: 'bg-amber-400', hover: 'hover:bg-amber-300', border: 'border-black' },
    { key: 'green', name: 'GREEN', bg: 'bg-emerald-600', hover: 'hover:bg-emerald-500', border: 'border-white' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-fadeIn p-4">
      <div className="w-80 md:w-96 bg-neutral-900 border-2 border-neutral-700 shadow-[6px_6px_0px_#000] p-6 text-center text-white">
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 bg-amber-400 border border-black" />
          <h3 className="font-mono text-lg md:text-xl font-black uppercase tracking-wider text-white">
            {title}
          </h3>
        </div>
        <p className="font-mono text-xs text-neutral-400 mb-5 uppercase tracking-wide">
          Select which color continues the game:
        </p>

        <div className="grid grid-cols-2 gap-3">
          {colors.map((c) => (
            <button
              key={c.key}
              onClick={() => {
                soundService.play('wild_pick');
                onSelectColor(c.key);
              }}
              className={`${c.bg} ${c.hover} h-20 md:h-24 border-2 ${c.border} shadow-[4px_4px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition flex flex-col items-center justify-center`}
            >
              <span className={`font-mono text-base font-black tracking-wider ${c.key === 'yellow' ? 'text-black' : 'text-white'} drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]`}>
                {c.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
