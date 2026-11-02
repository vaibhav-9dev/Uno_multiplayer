import React from 'react';
import { WildChallengeState } from '../types/uno.ts';
import { ShieldAlert, CheckCircle2, AlertTriangle } from 'lucide-react';
import { soundService } from '../services/sound.ts';

interface ChallengeModalProps {
  challenge: WildChallengeState;
  onDecision: (didChallenge: boolean) => void;
}

export const ChallengeModal: React.FC<ChallengeModalProps> = ({ challenge, onDecision }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn">
      <div className="w-full max-w-lg rounded-3xl bg-neutral-900 border-2 border-amber-500/80 p-6 md:p-8 shadow-2xl text-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500 flex items-center justify-center text-amber-400">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-xl md:text-2xl font-black tracking-wide text-amber-400 uppercase">
              Wild Draw Four Challenge!
            </h3>
            <p className="text-sm text-neutral-300">
              <span className="font-bold text-white">{challenge.offenderName}</span> played a Wild Draw 4 on you!
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-neutral-950 border border-neutral-800 p-4 mb-6 text-sm text-neutral-300 space-y-2">
          <div className="flex items-center gap-2 text-neutral-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Previous active color was <span className="font-bold uppercase text-white px-1.5 py-0.5 rounded bg-neutral-800">{challenge.colorBeforeWild}</span>.
            </span>
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed">
            <strong>Official Rule:</strong> A Wild Draw 4 can only be played legally if the player holds <em>no cards</em> matching the active color (<span className="uppercase text-white font-medium">{challenge.colorBeforeWild}</span>).
          </p>
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-800 text-xs">
            <div className="bg-emerald-950/40 border border-emerald-800/60 p-2.5 rounded-xl">
              <span className="font-bold text-emerald-400 block mb-1">If Challenge Succeeds:</span>
              <span>{challenge.offenderName} bluffed & draws 4 cards! You play your turn normally.</span>
            </div>
            <div className="bg-rose-950/40 border border-rose-800/60 p-2.5 rounded-xl">
              <span className="font-bold text-rose-400 block mb-1">If Challenge Fails:</span>
              <span>{challenge.offenderName} was honest! You draw <strong>6 cards</strong> (+2 penalty) & lose your turn.</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => {
              soundService.play('challenge');
              onDecision(true);
            }}
            className="flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-black font-black text-base shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <ShieldAlert className="w-5 h-5" />
            CHALLENGE BLUFF!
          </button>

          <button
            onClick={() => {
              soundService.play('click');
              onDecision(false);
            }}
            className="flex-1 py-3.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-base transition-transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5 text-neutral-400" />
            Accept (+4 Cards)
          </button>
        </div>
      </div>
    </div>
  );
};
