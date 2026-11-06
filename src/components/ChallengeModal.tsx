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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="w-full max-w-lg bg-neutral-900 border-2 border-amber-400 p-6 md:p-8 shadow-[6px_6px_0px_#000] text-white">
        <div className="flex items-center gap-3 mb-4 border-b-2 border-neutral-800 pb-3">
          <div className="w-10 h-10 bg-amber-400 border border-black flex items-center justify-center text-black">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-mono text-lg md:text-xl font-black tracking-wider text-amber-400 uppercase">
              WILD DRAW FOUR CHALLENGE
            </h3>
            <p className="font-mono text-xs text-neutral-300">
              <span className="font-bold text-white">{challenge.offenderName.toUpperCase()}</span> PLAYED A WILD +4 ON YOU!
            </p>
          </div>
        </div>

        <div className="bg-neutral-950 border-2 border-neutral-800 p-4 mb-5 font-mono text-xs text-neutral-300 space-y-2.5">
          <div className="flex items-center gap-2 text-neutral-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Previous active color was{' '}
              <span className="font-bold uppercase text-amber-400 px-1 py-0.2 bg-neutral-900 border border-neutral-700">
                {challenge.colorBeforeWild}
              </span>
              .
            </span>
          </div>
          <p className="text-[11px] text-neutral-400 leading-relaxed">
            <strong>OFFICIAL RULE:</strong> Wild Draw 4 can only be played legally if the player holds <em>no cards</em> matching active color ({challenge.colorBeforeWild}).
          </p>
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-800 text-[11px]">
            <div className="bg-emerald-950/40 border border-emerald-700 p-2.5">
              <span className="font-bold text-emerald-400 block mb-0.5">IF CHALLENGE SUCCEEDS:</span>
              <span className="text-neutral-300">{challenge.offenderName} bluffed & draws 4 penalty cards! You play turn normally.</span>
            </div>
            <div className="bg-rose-950/40 border border-rose-700 p-2.5">
              <span className="font-bold text-rose-400 block mb-0.5">IF CHALLENGE FAILS:</span>
              <span className="text-neutral-300">{challenge.offenderName} was honest! You draw <strong>6 cards</strong> & lose your turn.</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            onClick={() => {
              soundService.play('challenge');
              onDecision(true);
            }}
            className="flex-1 py-3 px-4 bg-amber-400 hover:bg-amber-300 border-2 border-black text-black font-mono font-black text-xs uppercase tracking-wider shadow-[4px_4px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition flex items-center justify-center gap-2"
          >
            <ShieldAlert className="w-4 h-4" />
            CHALLENGE BLUFF!
          </button>

          <button
            onClick={() => {
              soundService.play('click');
              onDecision(false);
            }}
            className="flex-1 py-3 px-4 bg-neutral-950 hover:bg-neutral-800 border-2 border-neutral-700 text-neutral-200 font-mono font-bold text-xs uppercase tracking-wider shadow-[3px_3px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-neutral-400" />
            ACCEPT (+4 CARDS)
          </button>
        </div>
      </div>
    </div>
  );
};
