import React from 'react';
import { X, BookOpen, AlertCircle, ShieldAlert, Award, Sparkles } from 'lucide-react';
import { soundService } from '../services/sound.ts';

interface HowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HowToPlayModal: React.FC<HowToPlayModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="w-full max-w-2xl rounded-3xl bg-neutral-900 border-2 border-neutral-700 shadow-2xl text-white flex flex-col max-h-[88vh]">
        {/* Modal Header */}
        <div className="p-5 md:p-6 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-black uppercase tracking-wider text-amber-400">
                Official Classic UNO Rules
              </h3>
              <p className="text-xs text-neutral-400 font-medium">Standard 108-card deck rules & scoring</p>
            </div>
          </div>
          <button
            onClick={() => {
              soundService.play('click');
              onClose();
            }}
            className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-neutral-300 leading-relaxed">
          {/* Section 1: Objective */}
          <div>
            <h4 className="text-base font-bold text-white flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              1. Objective of the Game
            </h4>
            <p>
              Be the first player to discard all of your cards in each round. You score points for all the cards left in opponents’ hands. The first player to reach <strong>500 points</strong> wins the match (or play in single-round mode for quick games).
            </p>
          </div>

          {/* Section 2: Playing a Card */}
          <div>
            <h4 className="text-base font-bold text-white flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full bg-red-600 text-white inline-flex items-center justify-center text-xs font-black">2</span>
              Card Matching & Turn Flow
            </h4>
            <p className="mb-2">
              Each player starts with 7 cards. On your turn, you must match a card from your hand to the top card of the Discard pile, either by:
            </p>
            <ul className="list-disc list-inside space-y-1 text-neutral-400 pl-2">
              <li><strong className="text-white">Color:</strong> Matches the active color (Red, Blue, Green, Yellow).</li>
              <li><strong className="text-white">Number / Value:</strong> Matches the number (0–9) or symbol.</li>
              <li><strong className="text-white">Wild Cards:</strong> Can be played on any card.</li>
            </ul>
            <p className="mt-2 text-xs text-neutral-400 bg-neutral-950 p-3 rounded-xl border border-neutral-800">
              💡 <strong>Drawing:</strong> If you don't have a matching card (or choose not to play), draw 1 card from the Draw pile. If that drawn card is playable, you can play it immediately or pass to the next player.
            </p>
          </div>

          {/* Section 3: Action Cards */}
          <div>
            <h4 className="text-base font-bold text-white flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white inline-flex items-center justify-center text-xs font-black">3</span>
              Special Action Cards
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                <span className="font-bold text-white block mb-1">⊘ Skip Card</span>
                <span>The next player loses their turn and is skipped.</span>
              </div>
              <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                <span className="font-bold text-white block mb-1">⇄ Reverse Card</span>
                <span>Reverses direction of play. <em>In a 2-player game, Reverse acts exactly like a Skip!</em></span>
              </div>
              <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                <span className="font-bold text-white block mb-1">+2 Draw Two Card</span>
                <span>Next player draws 2 cards and forfeits their turn.</span>
              </div>
              <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                <span className="font-bold text-white block mb-1">🌈 Wild Card</span>
                <span>Player chooses which color continues play.</span>
              </div>
            </div>
          </div>

          {/* Section 4: Wild Draw 4 Challenge */}
          <div className="bg-amber-950/20 border border-amber-600/40 p-4 rounded-2xl">
            <h4 className="text-base font-bold text-amber-400 flex items-center gap-2 mb-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              4. Wild Draw Four & Official Challenge Rule
            </h4>
            <p className="text-xs text-neutral-300 mb-2">
              Under official UNO rules, a Wild Draw Four can legally only be played if you do <strong>not</strong> hold any card in your hand matching the active color.
            </p>
            <p className="text-xs text-neutral-300 mb-2">
              When played against you, you can choose to <strong>Accept</strong> (+4 cards and skip turn) or <strong>Challenge</strong>:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="bg-neutral-900 p-2.5 rounded-lg border border-neutral-800">
                <strong className="text-emerald-400 block mb-0.5">Successful Challenge:</strong>
                If the player held a card matching the prior color, they are caught bluffing and must draw 4 cards! You do not draw and take your turn.
              </div>
              <div className="bg-neutral-900 p-2.5 rounded-lg border border-neutral-800">
                <strong className="text-rose-400 block mb-0.5">Failed Challenge:</strong>
                If the player was honest, you must draw <strong>6 cards</strong> (4 + 2 penalty) and your turn is skipped!
              </div>
            </div>
          </div>

          {/* Section 5: The UNO Rule */}
          <div className="bg-rose-950/20 border border-rose-600/40 p-4 rounded-2xl">
            <h4 className="text-base font-bold text-rose-400 flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              5. The UNO Rule & Catching
            </h4>
            <p className="text-xs text-neutral-300">
              When you have only <strong>1 card left</strong>, you must press the <span className="font-black text-rose-400">UNO!</span> button. If you forget to call UNO and another player presses <span className="font-black text-amber-400">CATCH UNO!</span> before the next player takes their turn, you must draw <strong>2 penalty cards</strong>!
            </p>
          </div>

          {/* Section 6: Official Scoring */}
          <div>
            <h4 className="text-base font-bold text-white flex items-center gap-2 mb-2">
              <Award className="w-4 h-4 text-amber-400" />
              6. Official Scoring
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border border-neutral-800 rounded-xl overflow-hidden">
                <thead className="bg-neutral-950 text-neutral-400">
                  <tr>
                    <th className="p-2 border-b border-neutral-800">Card</th>
                    <th className="p-2 border-b border-neutral-800">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  <tr>
                    <td className="p-2">Number Cards (0–9)</td>
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
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950 rounded-b-3xl text-right">
          <button
            onClick={() => {
              soundService.play('click');
              onClose();
            }}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black text-sm transition"
          >
            Got it, Let's Play!
          </button>
        </div>
      </div>
    </div>
  );
};
