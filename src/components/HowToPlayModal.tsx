import React from 'react';
import { BookOpen, AlertCircle, ShieldAlert, Award, Sparkles } from 'lucide-react';
import { soundService } from '../services/sound.ts';

interface HowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HowToPlayModal: React.FC<HowToPlayModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fadeIn">
      {/* Sharp Brutalist Window */}
      <div className="w-full max-w-2xl bg-neutral-900 border-2 border-neutral-700 shadow-[6px_6px_0px_#000] text-white flex flex-col max-h-[88vh]">
        {/* Title Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-950 border-b-2 border-neutral-800">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-400" />
            <span className="font-mono text-xs uppercase tracking-wider font-bold text-neutral-300">
              OFFICIAL CLASSIC UNO RULES // 108 CARDS
            </span>
          </div>
          <button
            onClick={() => {
              soundService.play('click');
              onClose();
            }}
            className="w-6 h-6 border border-neutral-700 bg-neutral-900 hover:bg-rose-900 hover:text-white flex items-center justify-center font-mono text-xs"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs font-mono text-neutral-300 leading-relaxed">
          {/* Section 1: Objective */}
          <div className="p-3 bg-neutral-950 border border-neutral-800">
            <h4 className="text-sm font-bold text-amber-400 flex items-center gap-2 mb-1.5 uppercase tracking-wide">
              <Sparkles className="w-4 h-4 text-amber-400" />
              1. Objective & Scoring
            </h4>
            <p>
              Be the first player to empty your hand in each round. Points from all opponents' leftover cards are scored by the round winner and saved permanently to their user account. First to reach <strong>500 points</strong> wins the match (or single-round mode for 1-round matches).
            </p>
          </div>

          {/* Section 2: Playing a Card */}
          <div className="p-3 bg-neutral-950 border border-neutral-800">
            <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-1.5 uppercase tracking-wide">
              <span className="px-1.5 py-0.2 bg-red-600 text-white font-black text-xs">2</span>
              Card Matching & Turn Flow
            </h4>
            <p className="mb-2">
              Each player receives 7 cards. Match the top card of the Discard pile by:
            </p>
            <ul className="list-disc list-inside space-y-1 text-neutral-400 pl-1">
              <li><strong className="text-white">Color:</strong> Match active color (Red, Blue, Green, Yellow).</li>
              <li><strong className="text-white">Value / Action:</strong> Match number (0–9), Skip, Reverse, or +2.</li>
              <li><strong className="text-white">Wild Cards:</strong> Playable on any turn.</li>
            </ul>
            <div className="mt-2 text-[11px] text-neutral-400 p-2 bg-neutral-900 border border-neutral-800">
              💡 <strong>Drawing:</strong> If you cannot or choose not to play, draw 1 card. If playable, you may play it immediately or pass turn.
            </div>
          </div>

          {/* Section 3: Action Cards */}
          <div className="p-3 bg-neutral-950 border border-neutral-800">
            <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-2 uppercase tracking-wide">
              <span className="px-1.5 py-0.2 bg-blue-600 text-white font-black text-xs">3</span>
              Special Action Cards
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="bg-neutral-900 p-2.5 border border-neutral-800">
                <span className="font-bold text-white block mb-0.5">⊘ SKIP</span>
                <span className="text-neutral-400">Next player loses turn and is skipped.</span>
              </div>
              <div className="bg-neutral-900 p-2.5 border border-neutral-800">
                <span className="font-bold text-white block mb-0.5">⇄ REVERSE</span>
                <span className="text-neutral-400">Reverses turn order. In 2-player UNO, acts as Skip!</span>
              </div>
              <div className="bg-neutral-900 p-2.5 border border-neutral-800">
                <span className="font-bold text-white block mb-0.5">+2 DRAW TWO</span>
                <span className="text-neutral-400">Next player draws 2 cards and is skipped.</span>
              </div>
              <div className="bg-neutral-900 p-2.5 border border-neutral-800">
                <span className="font-bold text-white block mb-0.5">🌈 WILD & WILD +4</span>
                <span className="text-neutral-400">Choose new color. Wild +4 adds 4 cards to next player.</span>
              </div>
            </div>
          </div>

          {/* Section 4: Wild Draw 4 Challenge */}
          <div className="bg-amber-950/20 border-2 border-amber-600/70 p-3">
            <h4 className="text-sm font-bold text-amber-400 flex items-center gap-2 mb-1 uppercase tracking-wide">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              4. Wild Draw Four Official Challenge Rule
            </h4>
            <p className="text-[11px] text-neutral-300 mb-2">
              Official UNO rule: A Wild Draw 4 can only legally be played if the player has NO matching color in hand. When targeted, you can Accept or Challenge:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="bg-neutral-950 p-2 border border-emerald-600">
                <strong className="text-emerald-400 block mb-0.5">CHALLENGE SUCCESS:</strong>
                <span>Offender was bluffing and draws 4 cards! You take your turn normally.</span>
              </div>
              <div className="bg-neutral-950 p-2 border border-rose-600">
                <strong className="text-rose-400 block mb-0.5">CHALLENGE FAILED:</strong>
                <span>Offender was honest! You draw <strong>6 cards</strong> and lose your turn.</span>
              </div>
            </div>
          </div>

          {/* Section 5: The UNO Rule */}
          <div className="bg-rose-950/20 border-2 border-rose-600/70 p-3">
            <h4 className="text-sm font-bold text-rose-400 flex items-center gap-2 mb-1 uppercase tracking-wide">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              5. The UNO Shout & Catch Penalty
            </h4>
            <p className="text-[11px] text-neutral-300">
              When down to 1 card, press the <strong className="text-rose-400">UNO!</strong> button. If caught by an opponent before the next card is played, you draw <strong>2 penalty cards</strong>!
            </p>
          </div>

          {/* Section 6: Official Card Values */}
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-2 uppercase tracking-wide">
              <Award className="w-4 h-4 text-amber-400" />
              6. Card Point Values
            </h4>
            <table className="w-full text-xs text-left border-2 border-neutral-800">
              <thead className="bg-neutral-950 text-neutral-400">
                <tr>
                  <th className="p-2 border-b border-neutral-800">CARD</th>
                  <th className="p-2 border-b border-neutral-800">POINTS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800 font-mono">
                <tr>
                  <td className="p-2">Numbers (0–9)</td>
                  <td className="p-2 font-bold text-white">Face Value (0–9 pts)</td>
                </tr>
                <tr>
                  <td className="p-2">Draw Two (+2), Skip, Reverse</td>
                  <td className="p-2 font-bold text-white">20 points each</td>
                </tr>
                <tr>
                  <td className="p-2">Wild, Wild Draw Four (+4)</td>
                  <td className="p-2 font-bold text-white">50 points each</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t-2 border-neutral-800 bg-neutral-950 flex justify-end">
          <button
            onClick={() => {
              soundService.play('click');
              onClose();
            }}
            className="py-2 px-5 bg-amber-400 hover:bg-amber-300 border-2 border-black text-black font-mono font-black text-xs uppercase shadow-[3px_3px_0px_#000] active:translate-x-[1px] active:translate-y-[1px]"
          >
            GOT IT, LET'S PLAY!
          </button>
        </div>
      </div>
    </div>
  );
};
