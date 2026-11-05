import React, { useState, useEffect } from 'react';
import { voiceChatService } from '../services/voiceChat.ts';
import { Mic, MicOff, Headphones, VolumeX, Radio, Users } from 'lucide-react';

interface VoiceChatBarProps {
  roomCode: string;
}

export const VoiceChatBar: React.FC<VoiceChatBarProps> = ({ roomCode }) => {
  const [isConnected, setIsConnected] = useState(voiceChatService.getIsConnected());
  const [isMicMuted, setIsMicMuted] = useState(voiceChatService.getIsMicMuted());
  const [isDeafened, setIsDeafened] = useState(voiceChatService.getIsDeafened());
  const [isLocallySpeaking, setIsLocallySpeaking] = useState(voiceChatService.getIsLocallySpeaking());
  const [peerCount, setPeerCount] = useState(voiceChatService.getConnectedPeerCount());
  const [isConnecting, setIsConnecting] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  useEffect(() => {
    // Subscribe to voice state updates
    const unsubscribe = voiceChatService.subscribe(() => {
      setIsConnected(voiceChatService.getIsConnected());
      setIsMicMuted(voiceChatService.getIsMicMuted());
      setIsDeafened(voiceChatService.getIsDeafened());
      setIsLocallySpeaking(voiceChatService.getIsLocallySpeaking());
      setPeerCount(voiceChatService.getConnectedPeerCount());
    });

    // Auto-attempt voice connection
    let mounted = true;
    const connectVoice = async () => {
      if (!voiceChatService.getIsConnected()) {
        setIsConnecting(true);
        const success = await voiceChatService.startVoice(roomCode);
        if (mounted) {
          setIsConnecting(false);
          if (!success) {
            setMicError('Mic muted or permission needed');
            setTimeout(() => setMicError(null), 6000);
          }
        }
      }
    };
    connectVoice();

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [roomCode]);

  const handleToggleMic = () => {
    if (!isConnected) {
      voiceChatService.startVoice(roomCode);
      return;
    }
    const muted = voiceChatService.toggleMic();
    setIsMicMuted(muted);
  };

  const handleToggleDeafen = () => {
    const deafened = voiceChatService.toggleDeafen();
    setIsDeafened(deafened);
  };

  return (
    <div className="flex items-center gap-1.5 bg-neutral-900/90 border border-neutral-700/80 rounded-xl px-2 py-1 shadow-md backdrop-blur-md">
      {/* Status indicator / Live speaking wave */}
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-black/40 border border-neutral-800">
        {isConnected ? (
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full transition-colors ${
                isLocallySpeaking
                  ? 'bg-emerald-400 animate-ping ring-2 ring-emerald-400'
                  : isMicMuted
                  ? 'bg-neutral-500'
                  : 'bg-emerald-500'
              }`}
            />
            <span className="text-[11px] font-bold text-neutral-300 hidden sm:inline flex items-center gap-1">
              {isLocallySpeaking ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <Radio className="w-3 h-3 animate-pulse" /> Speaking
                </span>
              ) : isMicMuted ? (
                'Muted'
              ) : (
                'Voice'
              )}
            </span>
            {peerCount > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-neutral-400 font-mono ml-0.5">
                <Users className="w-2.5 h-2.5 text-neutral-500" />
                {peerCount + 1}
              </span>
            )}
          </div>
        ) : (
          <button
            onClick={() => voiceChatService.startVoice(roomCode)}
            className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition"
            title="Click to enable in-game voice chat"
          >
            <Radio className="w-3 h-3" />
            <span>{isConnecting ? 'Joining Voice...' : 'Join Voice'}</span>
          </button>
        )}
      </div>

      {/* Mic Mute / Unmute Button */}
      <button
        onClick={handleToggleMic}
        className={`p-1.5 rounded-lg border transition-all flex items-center gap-1 shadow-sm ${
          !isConnected
            ? 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white'
            : isMicMuted
            ? 'bg-rose-950/80 text-rose-300 border-rose-800 hover:bg-rose-900'
            : isLocallySpeaking
            ? 'bg-emerald-600 text-white border-emerald-400 ring-2 ring-emerald-400/50 shadow-emerald-500/30'
            : 'bg-emerald-950/80 text-emerald-300 border-emerald-700 hover:bg-emerald-900'
        }`}
        title={!isConnected ? 'Connect microphone' : isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
      >
        {isMicMuted || !isConnected ? (
          <MicOff className="w-3.5 h-3.5" />
        ) : (
          <Mic className={`w-3.5 h-3.5 ${isLocallySpeaking ? 'animate-bounce' : ''}`} />
        )}
      </button>

      {/* Deafen Button */}
      {isConnected && (
        <button
          onClick={handleToggleDeafen}
          className={`p-1.5 rounded-lg border transition-all shadow-sm ${
            isDeafened
              ? 'bg-rose-950/80 text-rose-300 border-rose-800 hover:bg-rose-900'
              : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-neutral-700 hover:text-white'
          }`}
          title={isDeafened ? 'Undeafen voice' : 'Deafen voice (mute all players)'}
        >
          {isDeafened ? <VolumeX className="w-3.5 h-3.5" /> : <Headphones className="w-3.5 h-3.5" />}
        </button>
      )}

      {/* Ephemeral warning tooltip if mic permission denied */}
      {micError && (
        <div className="absolute top-12 right-4 px-3 py-1.5 rounded-lg bg-rose-900/95 border border-rose-600 text-white text-[11px] shadow-xl z-50 animate-fade-in">
          {micError}
        </div>
      )}
    </div>
  );
};
