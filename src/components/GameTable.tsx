import React, { useState, useEffect } from 'react';
import { ClientGameState, Card, ActiveColor } from '../types/uno.ts';
import { socketClient } from '../services/socket.ts';
import { soundService } from '../services/sound.ts';
import { CardView } from './CardView.tsx';
import { OpponentSeat } from './OpponentSeat.tsx';
import { ColorPickerModal } from './ColorPickerModal.tsx';
import { ChallengeModal } from './ChallengeModal.tsx';
import { ScoreboardModal } from './ScoreboardModal.tsx';
import { HowToPlayModal } from './HowToPlayModal.tsx';
import { VoiceChatBar } from './VoiceChatBar.tsx';
import {
  Volume2,
  VolumeX,
  HelpCircle,
  LogOut,
  Copy,
  Check,
  RotateCw,
  RotateCcw,
  Flame,
  AlertCircle,
  Play,
  Pause,
  Clock,
  Users,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  StopCircle,
  FastForward,
  Home,
  Send,
} from 'lucide-react';

interface GameTableProps {
  gameState: ClientGameState;
  onLeaveRoom: () => void;
}

const COLOR_BORDER_MAP: Record<ActiveColor, string> = {
  red: 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]',
  blue: 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]',
  green: 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]',
  yellow: 'border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.5)]',
};

const COLOR_BG_MAP: Record<ActiveColor, string> = {
  red: 'bg-red-600 text-white',
  blue: 'bg-blue-600 text-white',
  green: 'bg-emerald-600 text-white',
  yellow: 'bg-amber-400 text-black',
};

export const GameTable: React.FC<GameTableProps> = ({ gameState, onLeaveRoom }) => {
  const [isMuted, setIsMuted] = useState(soundService.getMuted());
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [pendingWildCard, setPendingWildCard] = useState<Card | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const [unoAlertText, setUnoAlertText] = useState<string | null>(null);
  const [recentChatReaction, setRecentChatReaction] = useState<{ name: string; text: string } | null>(null);
  const [chatInputText, setChatInputText] = useState('');
  const [dropSeconds, setDropSeconds] = useState(0);
  const [turnSecondsRemaining, setTurnSecondsRemaining] = useState(180);

  const isMyTurn = gameState.activePlayerId === gameState.myPlayerId;
  const isHost = gameState.hostId === gameState.myPlayerId;
  const me = gameState.players.find((p) => p.id === gameState.myPlayerId);

  // Filter out self to get opponents list
  const opponents = gameState.players
    .map((p, idx) => ({ player: p, originalIndex: idx }))
    .filter((item) => item.player.id !== gameState.myPlayerId);

  // Timer for disconnected player
  useEffect(() => {
    if (!gameState.disconnectedPlayer) {
      setDropSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - gameState.disconnectedPlayer!.disconnectedAt) / 1000);
      setDropSeconds(elapsed);
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState.disconnectedPlayer]);

  // Turn timer countdown (3 minutes timeout)
  useEffect(() => {
    if (gameState.status !== 'in_progress' || gameState.isPaused) return;

    const updateTimer = () => {
      const elapsed = Date.now() - (gameState.turnStartedAt || Date.now());
      const remaining = Math.max(0, Math.ceil((gameState.turnTimeoutMs - elapsed) / 1000));
      setTurnSecondsRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [gameState.status, gameState.isPaused, gameState.turnStartedAt, gameState.turnTimeoutMs, gameState.activePlayerId]);

  // Copy room code or direct link
  const handleCopyRoom = () => {
    soundService.play('click');
    const shareUrl = `${window.location.origin}?room=${gameState.roomCode}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Toggle sound
  const handleToggleMute = () => {
    const muted = soundService.toggleMute();
    setIsMuted(muted);
  };

  // Listen for real-time UNO alerts and emotes
  useEffect(() => {
    const socket = socketClient.socket;
    const handleUnoAlert = (data: { playerName: string }) => {
      setUnoAlertText(`${data.playerName.toUpperCase()} SHOUTED UNO! 🔥`);
      setTimeout(() => setUnoAlertText(null), 3500);
    };

    const handleChat = (data: { playerName: string; message?: string; emote?: string }) => {
      const text = data.emote || data.message || '';
      if (text) {
        setRecentChatReaction({ name: data.playerName, text });
        setTimeout(() => setRecentChatReaction(null), 3500);
      }
    };

    socket.on('game:uno-alert', handleUnoAlert);
    socket.on('game:chat-message', handleChat);

    return () => {
      socket.off('game:uno-alert', handleUnoAlert);
      socket.off('game:chat-message', handleChat);
    };
  }, []);

  // Play card handler
  const handleCardClick = (card: Card) => {
    if (!isMyTurn || gameState.isPaused) return;
    if (gameState.activeChallenge) return;

    if (card.color === 'wild') {
      soundService.play('click');
      setPendingWildCard(card);
    } else {
      socketClient.playCard(card.id);
    }
  };

  const handleSelectColor = (color: ActiveColor) => {
    if (!pendingWildCard) return;
    socketClient.playCard(pendingWildCard.id, color);
    setPendingWildCard(null);
  };

  // Draw card handler
  const handleDrawCard = () => {
    if (!isMyTurn || gameState.isPaused) return;
    if (gameState.activeChallenge) return;
    socketClient.drawCard();
  };

  // Send quick reaction
  const handleSendEmote = (emote: string) => {
    soundService.play('click');
    socketClient.sendChat(undefined, emote);
  };

  // Abort match confirmation
  const handleConfirmAbort = () => {
    setShowAbortConfirm(false);
    soundService.play('click');
    socketClient.abortMatch('Match was aborted by player request.');
  };

  // Layout opponents based on count
  const renderOpponents = () => {
    if (opponents.length === 1) {
      return (
        <div className="flex justify-center w-full">
          <OpponentSeat
            player={opponents[0].player}
            isActiveTurn={gameState.activePlayerId === opponents[0].player.id}
            isHost={gameState.hostId === opponents[0].player.id}
            position="top"
          />
        </div>
      );
    }

    if (opponents.length === 2) {
      return (
        <div className="flex justify-between items-center w-full px-4 md:px-12">
          <OpponentSeat
            player={opponents[0].player}
            isActiveTurn={gameState.activePlayerId === opponents[0].player.id}
            isHost={gameState.hostId === opponents[0].player.id}
            position="left"
          />
          <OpponentSeat
            player={opponents[1].player}
            isActiveTurn={gameState.activePlayerId === opponents[1].player.id}
            isHost={gameState.hostId === opponents[1].player.id}
            position="right"
          />
        </div>
      );
    }

    if (opponents.length === 3) {
      return (
        <div className="grid grid-cols-3 items-center w-full px-2 md:px-8">
          <OpponentSeat
            player={opponents[0].player}
            isActiveTurn={gameState.activePlayerId === opponents[0].player.id}
            isHost={gameState.hostId === opponents[0].player.id}
            position="left"
          />
          <OpponentSeat
            player={opponents[1].player}
            isActiveTurn={gameState.activePlayerId === opponents[1].player.id}
            isHost={gameState.hostId === opponents[1].player.id}
            position="top"
          />
          <OpponentSeat
            player={opponents[2].player}
            isActiveTurn={gameState.activePlayerId === opponents[2].player.id}
            isHost={gameState.hostId === opponents[2].player.id}
            position="right"
          />
        </div>
      );
    }

    return null;
  };

  return (
    <div className="relative min-h-screen w-full bg-neutral-950 text-white flex flex-col justify-between overflow-x-hidden select-none">
      {/* Top Header Bar (Sharp Box) */}
      <header className="relative z-20 flex items-center justify-between px-3 md:px-6 py-2.5 bg-neutral-950 border-b-2 border-neutral-800 shadow-[0_2px_0px_#000]">
        {/* Left: Room Code & Link */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 border-2 border-neutral-700 shadow-[2px_2px_0px_#000]">
            <span className="font-mono text-xs text-neutral-400 font-bold uppercase">ROOM:</span>
            <span className="font-mono text-sm font-black text-amber-400 tracking-wider">
              {gameState.roomCode}
            </span>
            <button
              onClick={handleCopyRoom}
              className="p-1 text-neutral-400 hover:text-white transition"
              title="Copy Room Link"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 font-mono text-xs text-neutral-400">
            <span className="px-2.5 py-1 bg-neutral-900 border border-neutral-800">
              {gameState.settings.isSingleRound ? 'SINGLE ROUND' : `TARGET: ${gameState.settings.targetScore} PTS`}
            </span>
          </div>
        </div>

        {/* Center: Turn Direction Indicator (Sharp Plaque) */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-neutral-900 border-2 border-neutral-700 font-mono text-xs font-bold text-neutral-200 shadow-[2px_2px_0px_#000]">
            {gameState.turnDirection === 1 ? (
              <>
                <RotateCw className="w-3.5 h-3.5 text-amber-400 animate-spin" style={{ animationDuration: '6s' }} />
                <span className="hidden md:inline uppercase">CLOCKWISE</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5 text-blue-400 animate-spin" style={{ animationDuration: '6s' }} />
                <span className="hidden md:inline uppercase">COUNTER-CLOCKWISE</span>
              </>
            )}
          </div>
        </div>

        {/* Right: Voice Chat, Sound, Pause/Resume, Rules, Abort, Leave */}
        <div className="flex items-center gap-1.5 md:gap-2">
          {/* Live Voice Chat Bar */}
          <VoiceChatBar roomCode={gameState.roomCode} />

          <button
            onClick={handleToggleMute}
            className="p-2 bg-neutral-900 hover:bg-neutral-800 border-2 border-neutral-700 text-neutral-300 hover:text-white shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition"
            title={isMuted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Pause / Resume Button */}
          {gameState.status === 'in_progress' && (
            <button
              onClick={() => {
                soundService.play('click');
                if (gameState.isPaused) {
                  socketClient.resumeMatch();
                } else {
                  socketClient.pauseMatch();
                }
              }}
              className={`px-2.5 py-1.5 border-2 font-mono text-xs font-bold uppercase transition flex items-center gap-1 shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] ${
                gameState.isPaused
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-black border-black animate-pulse'
                  : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-white'
              }`}
              title={gameState.isPaused ? 'Resume Match' : 'Pause Match'}
            >
              {gameState.isPaused ? (
                <>
                  <Play className="w-3 h-3 fill-current" />
                  <span>RESUME</span>
                </>
              ) : (
                <>
                  <Pause className="w-3 h-3" />
                  <span className="hidden sm:inline">PAUSE</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={() => {
              soundService.play('click');
              setShowHowToPlay(true);
            }}
            className="p-2 bg-neutral-900 hover:bg-neutral-800 border-2 border-neutral-700 text-neutral-300 hover:text-white shadow-[2px_2px_0px_#000] transition"
            title="Rules & How to Play"
          >
            <HelpCircle className="w-4 h-4 text-amber-400" />
          </button>

          {/* Abort Match Button */}
          {(gameState.status === 'in_progress' || gameState.status === 'round_over') && (
            <button
              onClick={() => {
                soundService.play('click');
                setShowAbortConfirm(true);
              }}
              className="px-2.5 py-1.5 bg-neutral-950 hover:bg-rose-950/60 border-2 border-rose-700 text-rose-300 hover:text-white transition flex items-center gap-1 font-mono text-xs font-bold uppercase shadow-[2px_2px_0px_#000]"
              title="Abort Match"
            >
              <StopCircle className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden sm:inline">ABORT</span>
            </button>
          )}

          <button
            onClick={() => {
              soundService.play('click');
              onLeaveRoom();
            }}
            className="p-2 bg-neutral-950 hover:bg-neutral-800 border-2 border-neutral-700 text-neutral-300 hover:text-white shadow-[2px_2px_0px_#000] transition"
            title="Leave Room"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Disconnected Player Alert Banner (Sharp Box) */}
      {gameState.disconnectedPlayer && gameState.status === 'in_progress' && (
        <div className="relative z-30 w-full bg-amber-400 text-black px-4 py-2 border-b-2 border-black font-mono font-bold text-xs md:text-sm shadow-[0_3px_0px_#000] flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-black shrink-0 animate-bounce" />
            <span>
              [ALERT] <strong>{gameState.disconnectedPlayer.name.toUpperCase()}</strong> lost connection ({dropSeconds}s ago). Waiting for reconnection...
            </span>
          </div>

          <div className="flex items-center gap-2">
            {gameState.disconnectedPlayer.isTurnPlayer && (
              <button
                onClick={() => {
                  soundService.play('click');
                  socketClient.skipTurn();
                }}
                className="px-3 py-1 bg-black text-amber-300 hover:bg-neutral-800 text-xs font-mono font-black uppercase transition flex items-center gap-1 shadow-[2px_2px_0px_#000]"
              >
                <FastForward className="w-3.5 h-3.5" />
                SKIP TURN
              </button>
            )}

            <button
              onClick={() => {
                soundService.play('click');
                setShowAbortConfirm(true);
              }}
              className="px-3 py-1 bg-red-950 text-white hover:bg-red-900 text-xs font-mono font-black uppercase transition flex items-center gap-1 shadow-[2px_2px_0px_#000] border border-black"
            >
              <StopCircle className="w-3.5 h-3.5" />
              ABORT MATCH
            </button>
          </div>
        </div>
      )}

      {/* Only One Active Player Left Alert Banner */}
      {gameState.onlyOnePlayerLeft && gameState.status === 'in_progress' && (
        <div className="relative z-30 w-full bg-rose-600 text-white px-4 py-2 border-b-2 border-black font-mono font-bold text-xs md:text-sm shadow-[0_3px_0px_#000] flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-300 shrink-0 animate-bounce" />
            <span>
              [ALERT] All opponents disconnected. You can wait or end the match.
            </span>
          </div>

          <button
            onClick={() => {
              soundService.play('click');
              socketClient.abortMatch('Match ended: Only 1 active player remained.');
            }}
            className="px-3 py-1 bg-black text-white hover:bg-neutral-900 font-mono font-black text-xs uppercase transition border border-white shadow-[2px_2px_0px_#000]"
          >
            <StopCircle className="w-3.5 h-3.5" />
            <span>EXIT & ABORT</span>
          </button>
        </div>
      )}

      {/* Floating Big UNO Alert Notification */}
      {unoAlertText && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 animate-bounce pointer-events-none">
          <div className="px-5 py-2 bg-red-600 text-white font-mono font-black text-base border-2 border-amber-300 shadow-[5px_5px_0px_#000] flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-300" />
            {unoAlertText}
          </div>
        </div>
      )}

      {/* Floating Reaction Emote Bubble */}
      {recentChatReaction && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-40 animate-fadeIn pointer-events-none">
          <div className="px-3.5 py-1.5 bg-neutral-900 border-2 border-neutral-700 shadow-[4px_4px_0px_#000] flex items-center gap-2 font-mono">
            <span className="text-xs font-bold text-neutral-400">{recentChatReaction.name}:</span>
            <span className="text-xl">{recentChatReaction.text}</span>
          </div>
        </div>
      )}

      {/* MAIN GAME TABLE / WAITING ROOM */}
      {gameState.status === 'waiting' ? (
        /* ================= WAITING LOBBY (Sharp Brutalist Box) ================= */
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-4 max-w-xl mx-auto w-full text-center">
          <div className="w-full bg-neutral-900 border-2 border-neutral-700 p-6 md:p-8 shadow-[6px_6px_0px_#000]">
            <div className="inline-flex p-3 bg-emerald-950 border-2 border-emerald-500 mb-3 text-emerald-400 shadow-[2px_2px_0px_#000]">
              <Users className="w-7 h-7" />
            </div>

            <h2 className="font-mono text-xl md:text-2xl font-black text-white uppercase tracking-wider mb-1">
              WAITING FOR PLAYERS
            </h2>
            <p className="font-mono text-xs text-neutral-400 mb-5">
              Share the Room Code to invite opponents. Requires 2 to 4 players.
            </p>

            {/* Room Code Card (Sharp Box) */}
            <div
              onClick={handleCopyRoom}
              className="cursor-pointer flex items-center justify-between p-3.5 bg-neutral-950 border-2 border-neutral-800 hover:border-amber-400 transition mb-5 shadow-[3px_3px_0px_#000]"
            >
              <div className="text-left font-mono">
                <span className="text-[10px] text-neutral-500 block uppercase font-bold">INVITE ROOM CODE</span>
                <span className="text-2xl font-black text-amber-400 tracking-widest">
                  {gameState.roomCode}
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-amber-400 hover:text-black text-neutral-200 border border-neutral-700 font-mono text-xs font-bold uppercase transition">
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'LINK COPIED!' : 'COPY LINK'}</span>
              </div>
            </div>

            {/* Player Seats List */}
            <div className="space-y-2 mb-6 text-left">
              <span className="font-mono text-xs font-bold text-neutral-400 uppercase tracking-wider block mb-1">
                SEATS ({gameState.players.length}/{gameState.settings.maxPlayers})
              </span>
              {gameState.players.map((p) => {
                const isPlayerHost = p.id === gameState.hostId;
                const isCurrentMe = p.id === gameState.myPlayerId;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between p-2.5 border-2 font-mono transition ${
                      isCurrentMe
                        ? 'bg-neutral-950 border-amber-400 shadow-[2px_2px_0px_#000]'
                        : 'bg-neutral-950 border-neutral-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">
                        {p.avatar === 'bear'
                          ? '🐻'
                          : p.avatar === 'panda'
                          ? '🐼'
                          : p.avatar === 'lion'
                          ? '🦁'
                          : p.avatar === 'tiger'
                          ? '🐯'
                          : p.avatar === 'rabbit'
                          ? '🐰'
                          : p.avatar === 'dragon'
                          ? '🐲'
                          : p.avatar === 'spark'
                          ? '⚡'
                          : '🦊'}
                      </span>
                      <div>
                        <div className="font-bold text-xs md:text-sm text-white flex items-center gap-1.5">
                          {p.name}
                          {isCurrentMe && (
                            <span className="text-[9px] px-1 bg-neutral-800 text-neutral-300 border border-neutral-700">
                              YOU
                            </span>
                          )}
                          {isPlayerHost && (
                            <span className="text-[9px] px-1 bg-amber-400 text-black font-black uppercase">
                              HOST
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-neutral-500">
                          {p.isConnected ? 'CONNECTED' : 'DISCONNECTED'}
                        </div>
                      </div>
                    </div>

                    <div>
                      {p.isReady ? (
                        <span className="font-mono text-[10px] px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-600 font-bold uppercase flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          READY
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] px-2 py-0.5 bg-neutral-900 text-neutral-500 border border-neutral-800 uppercase">
                          WAITING
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Host Start Game Controls */}
            {isHost ? (
              <button
                disabled={gameState.players.length < 2}
                onClick={() => {
                  soundService.play('click');
                  socketClient.startGame();
                }}
                className={`w-full py-3.5 border-2 font-mono font-black text-xs md:text-sm uppercase tracking-wider shadow-[4px_4px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition flex items-center justify-center gap-2 ${
                  gameState.players.length >= 2
                    ? 'bg-emerald-500 hover:bg-emerald-400 border-black text-black'
                    : 'bg-neutral-800 text-neutral-500 border-neutral-700 cursor-not-allowed'
                }`}
              >
                <Play className="w-4 h-4 fill-current" />
                {gameState.players.length >= 2
                  ? 'START UNO MATCH'
                  : 'NEED AT LEAST 2 PLAYERS TO START'}
              </button>
            ) : (
              <div className="py-3 px-4 bg-neutral-950 border-2 border-neutral-800 text-xs font-mono text-neutral-400 flex items-center justify-center gap-2 animate-pulse">
                <span>Waiting for host to start the game...</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ================= ACTIVE GAME TABLE ================= */
        <div className="relative z-10 flex-1 flex flex-col justify-between py-2 px-2 md:px-6">
          {/* Opponents Section */}
          <div className="w-full pt-1 pb-2">
            {renderOpponents()}
          </div>

          {/* Center Table Play Area */}
          <div className="relative flex flex-col items-center justify-center my-auto py-2">
            {/* Active Turn Banner + Turn Countdown Timer */}
            <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
              <div
                className={`px-3.5 py-1 border-2 font-mono text-xs font-black uppercase tracking-wider shadow-[3px_3px_0px_#000] flex items-center gap-2 transition-all ${
                  isMyTurn
                    ? 'bg-amber-400 text-black border-black shadow-[4px_4px_0px_#d97706] animate-pulse'
                    : 'bg-neutral-900 text-neutral-300 border-neutral-700'
                }`}
              >
                {isMyTurn ? (
                  <>
                    <Flame className="w-3.5 h-3.5 text-red-600 fill-current animate-bounce" />
                    <span>YOUR TURN TO PLAY</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 bg-amber-400 animate-ping" />
                    <span>
                      {gameState.players.find((p) => p.id === gameState.activePlayerId)?.name.toUpperCase() || 'PLAYER'}'S TURN
                    </span>
                  </>
                )}
              </div>

              {/* 3-Minute Turn Limit Timer */}
              {gameState.status === 'in_progress' && (
                <div
                  className={`px-2.5 py-1 border-2 text-xs font-mono font-bold flex items-center gap-1.5 shadow-[2px_2px_0px_#000] ${
                    turnSecondsRemaining <= 30
                      ? 'bg-rose-950 border-rose-500 text-rose-300 animate-pulse'
                      : 'bg-neutral-900 border-neutral-700 text-neutral-300'
                  }`}
                  title="Turn timeout limit"
                >
                  <Clock className={`w-3 h-3 ${turnSecondsRemaining <= 30 ? 'text-rose-400' : 'text-amber-400'}`} />
                  <span>
                    {Math.floor(turnSecondsRemaining / 60)}:{String(turnSecondsRemaining % 60).padStart(2, '0')}
                  </span>
                </div>
              )}
            </div>

            {/* Piles and Central Action Row */}
            <div className="flex items-center justify-center gap-6 md:gap-10">
              {/* Draw Pile (Sharp tactile card stack) */}
              <div className="flex flex-col items-center">
                <div
                  onClick={isMyTurn && !gameState.isPaused ? handleDrawCard : undefined}
                  className={`relative cursor-pointer transition-all ${
                    isMyTurn && !gameState.isPaused
                      ? 'hover:scale-105 active:scale-95'
                      : 'cursor-not-allowed opacity-85'
                  }`}
                  title={isMyTurn ? 'Click to Draw a Card' : 'Draw Pile'}
                >
                  {/* Visual 3D Stack depth */}
                  <div className="absolute top-1 left-1 w-20 md:w-24 h-28 md:h-36 bg-neutral-900 border-2 border-neutral-800 -z-10 shadow-[2px_2px_0px_#000]" />
                  <div className="absolute top-2 left-2 w-20 md:w-24 h-28 md:h-36 bg-neutral-950 border-2 border-neutral-800 -z-20 shadow-[2px_2px_0px_#000]" />

                  <CardView isFaceDown size="lg" className="shadow-[4px_4px_0px_#000]" />

                  {/* Draw Pile Count Badge */}
                  <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-neutral-950 border-2 border-neutral-700 text-[10px] font-mono font-bold text-neutral-200 whitespace-nowrap shadow-[2px_2px_0px_#000]">
                    {gameState.drawPileCount} CARDS
                  </div>

                  {isMyTurn && !gameState.isPaused && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity">
                      <span className="font-mono font-black text-amber-300 text-xs uppercase tracking-wider">
                        +1 DRAW
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Active Color & Discard Pile (Sharp Box) */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  {/* Color frame */}
                  <div
                    className={`absolute -inset-2 border-2 ${
                      gameState.activeColor ? COLOR_BORDER_MAP[gameState.activeColor] : 'border-neutral-600'
                    } transition-all duration-200 pointer-events-none`}
                  />

                  {gameState.topDiscard ? (
                    <CardView card={gameState.topDiscard} size="lg" className="shadow-[4px_4px_0px_#000]" />
                  ) : (
                    <div className="w-24 h-36 border-2 border-dashed border-neutral-700 flex items-center justify-center text-xs font-mono text-neutral-500">
                      DISCARD
                    </div>
                  )}

                  {/* Active Color Tag */}
                  {gameState.activeColor && (
                    <div
                      className={`absolute -bottom-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 ${
                        COLOR_BG_MAP[gameState.activeColor]
                      } font-mono text-[10px] font-black uppercase tracking-wider border-2 border-black whitespace-nowrap shadow-[2px_2px_0px_#000]`}
                    >
                      COLOR: {gameState.activeColor}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Interactive Turn Action Prompt / Drawn Card Options (Sharp Box) */}
            {isMyTurn && !gameState.isPaused && gameState.pendingDrawnCard && (
              <div className="mt-4 p-3 bg-neutral-900 border-2 border-amber-400 shadow-[4px_4px_0px_#000] flex flex-col sm:flex-row items-center gap-3 animate-fadeIn">
                <span className="font-mono text-xs font-bold text-white uppercase">
                  PLAY DRAWN CARD OR PASS?
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (gameState.pendingDrawnCard?.color === 'wild') {
                        setPendingWildCard(gameState.pendingDrawnCard);
                      } else {
                        socketClient.playCard(gameState.pendingDrawnCard!.id);
                      }
                    }}
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 border-2 border-black text-black font-mono font-black text-xs uppercase shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition"
                  >
                    PLAY CARD
                  </button>
                  <button
                    onClick={() => socketClient.passTurn()}
                    className="px-3 py-1.5 bg-neutral-950 hover:bg-neutral-800 border-2 border-neutral-700 text-neutral-300 font-mono font-bold text-xs uppercase shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition"
                  >
                    PASS TURN
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Player Hand Area */}
          <div className="relative z-20 w-full flex flex-col items-center pb-2">
            {/* Quick Action Buttons Row (UNO Button & Catch UNO Button & Emotes) */}
            <div className="flex items-center justify-between w-full max-w-4xl px-2 mb-2">
              {/* Left: Catch UNO Button */}
              <div>
                {gameState.canCatchUnoTarget ? (
                  <button
                    onClick={() => {
                      soundService.play('click');
                      socketClient.catchUno();
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-mono font-black text-xs uppercase tracking-wider border-2 border-amber-300 shadow-[4px_4px_0px_#000] animate-bounce flex items-center gap-1.5"
                    title={`Catch ${gameState.canCatchUnoTarget.targetPlayerName} for forgetting to call UNO!`}
                  >
                    <AlertCircle className="w-4 h-4 text-amber-300" />
                    CATCH UNO! ({gameState.canCatchUnoTarget.targetPlayerName.toUpperCase()})
                  </button>
                ) : (
                  /* Quick Talk & Emote bar (Sharp Boxes) */
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Emote bar */}
                    <div className="flex items-center gap-1 bg-neutral-900 p-1 border-2 border-neutral-700 shadow-[2px_2px_0px_#000]">
                      {['🔥', '🤝', '😱', '😂', '🤔', 'GG'].map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => handleSendEmote(emoji)}
                          className="px-1.5 h-6 flex items-center justify-center hover:bg-neutral-800 text-xs font-mono font-bold transition hover:scale-110"
                          title={`Send ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>

                    {/* Quick Text Input to Talk */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (chatInputText.trim()) {
                          soundService.play('click');
                          socketClient.sendChat(chatInputText.trim());
                          setChatInputText('');
                        }
                      }}
                      className="hidden sm:flex items-center gap-1 bg-neutral-900 px-2 py-1 border-2 border-neutral-700 shadow-[2px_2px_0px_#000]"
                    >
                      <input
                        type="text"
                        value={chatInputText}
                        onChange={(e) => setChatInputText(e.target.value)}
                        placeholder="Type message..."
                        maxLength={60}
                        className="bg-transparent text-xs font-mono text-white placeholder-neutral-500 focus:outline-none w-28 md:w-36"
                      />
                      <button
                        type="submit"
                        disabled={!chatInputText.trim()}
                        className="p-0.5 text-amber-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
                        title="Send Message"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </div>
                )}
              </div>

              {/* Center / Right: Big Official UNO Button (Sharp Box) */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    soundService.play('click');
                    socketClient.callUno();
                  }}
                  className={`px-5 py-2 font-mono font-black text-xs md:text-sm tracking-wider uppercase shadow-[4px_4px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center gap-1.5 border-2 ${
                    me?.cardCount === 1 || me?.cardCount === 2
                      ? 'bg-red-600 hover:bg-red-500 text-white border-amber-300 ring-2 ring-red-500 animate-pulse'
                      : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border-neutral-700'
                  }`}
                  title="Call UNO when you have 1 or 2 cards left!"
                >
                  <Flame className="w-4 h-4 text-amber-300 fill-current" />
                  <span>UNO!</span>
                  {me?.calledUno && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </button>
              </div>
            </div>

            {/* Hand Cards Fan Spread */}
            <div className="w-full flex justify-center overflow-x-auto py-2 px-2 no-scrollbar">
              <div className="inline-flex items-end justify-center min-w-max pb-2">
                {gameState.myHand.length === 0 ? (
                  <div className="font-mono text-xs text-neutral-400 italic">No cards in hand.</div>
                ) : (
                  gameState.myHand.map((card, index) => {
                    const topDiscard = gameState.topDiscard;
                    const activeColor = gameState.activeColor;
                    const isPlayable = Boolean(
                      isMyTurn &&
                      !gameState.isPaused &&
                      topDiscard &&
                      activeColor &&
                      (card.color === 'wild' ||
                        card.color === activeColor ||
                        card.value === topDiscard.value)
                    );

                    const total = gameState.myHand.length;
                    const spreadAngle = total > 1 ? Math.min(3.5, 28 / total) : 0;
                    const angle = (index - (total - 1) / 2) * spreadAngle;
                    const translateY = Math.abs(index - (total - 1) / 2) * 2;

                    return (
                      <div
                        key={card.id}
                        className="-ml-3 sm:-ml-4 first:ml-0 transition-transform duration-150"
                        style={{
                          transform: `translateY(${translateY}px) rotate(${angle}deg)`,
                          zIndex: index,
                        }}
                      >
                        <CardView
                          card={card}
                          size="md"
                          isPlayable={isPlayable}
                          disabled={!isMyTurn || gameState.isPaused}
                          onClick={() => handleCardClick(card)}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Player Status Badge (Sharp Box) */}
            <div className="flex items-center gap-3 font-mono text-[11px] text-neutral-400 mt-0.5 bg-neutral-900 border border-neutral-800 px-3 py-1">
              <span className="font-bold text-white flex items-center gap-1">
                HAND: <strong className="text-amber-400">{gameState.myHand.length} CARDS</strong>
              </span>
              <span>•</span>
              <span>
                MATCH SCORE: <strong className="text-white">{me?.totalScore || 0} PTS</strong>
              </span>
              {me?.calledUno && (
                <>
                  <span>•</span>
                  <span className="text-amber-400 font-bold flex items-center gap-1">
                    <Flame className="w-3 h-3 text-red-500 fill-current" /> UNO CALLED!
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Logs Drawer Toggle (Sharp Box) */}
      <div className="fixed bottom-2 right-2 z-40">
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="flex items-center gap-1.5 px-3 py-1 bg-neutral-900 hover:bg-neutral-800 border-2 border-neutral-700 font-mono text-xs font-bold text-neutral-300 shadow-[3px_3px_0px_#000] transition uppercase"
        >
          <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
          <span>GAME LOG</span>
          {showLogs ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>

        {showLogs && (
          <div className="absolute bottom-9 right-0 w-80 md:w-96 bg-neutral-950 border-2 border-neutral-700 p-3 shadow-[5px_5px_0px_#000] max-h-64 overflow-y-auto space-y-1 font-mono text-xs text-neutral-300">
            <div className="font-bold text-neutral-400 pb-1 mb-1 border-b border-neutral-800 flex justify-between uppercase">
              <span>ACTION EVENTS</span>
              <span>{gameState.logs.length} EVENTS</span>
            </div>
            {gameState.logs.length === 0 ? (
              <div className="text-neutral-500 italic py-2">No actions logged yet.</div>
            ) : (
              [...gameState.logs].reverse().map((entry) => (
                <div
                  key={entry.id}
                  className={`py-0.5 border-b border-neutral-900 ${
                    entry.type === 'challenge'
                      ? 'text-amber-300 font-semibold'
                      : entry.type === 'uno'
                      ? 'text-rose-400 font-bold'
                      : entry.type === 'round_win'
                      ? 'text-emerald-400 font-bold'
                      : entry.type === 'pause' || entry.type === 'resume'
                      ? 'text-blue-300 font-semibold'
                      : entry.type === 'timeout'
                      ? 'text-orange-400 font-bold'
                      : 'text-neutral-300'
                  }`}
                >
                  {entry.message}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* MODALS */}

      {/* Paused Overlay (Sharp Box) */}
      {gameState.isPaused && (
        <div className="fixed inset-0 z-45 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-sm bg-neutral-900 border-2 border-amber-400 p-6 shadow-[6px_6px_0px_#000] text-white text-center">
            <div className="w-12 h-12 bg-amber-400 border border-black text-black mx-auto mb-3 flex items-center justify-center">
              <Pause className="w-6 h-6" />
            </div>
            <h3 className="font-mono text-xl font-black uppercase tracking-wider text-amber-400 mb-1">
              MATCH PAUSED
            </h3>
            <p className="font-mono text-xs text-neutral-300 mb-5">
              Paused by <strong className="text-white">{gameState.pausedBy || 'Player'}</strong>. Turns and card actions are frozen.
            </p>
            <button
              onClick={() => {
                soundService.play('click');
                socketClient.resumeMatch();
              }}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 border-2 border-black text-black font-mono font-black text-xs uppercase tracking-wider shadow-[4px_4px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>RESUME GAME</span>
            </button>
          </div>
        </div>
      )}

      {/* Abort Confirmation Dialog (Sharp Box) */}
      {showAbortConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-neutral-900 border-2 border-rose-600 p-6 shadow-[6px_6px_0px_#000] text-white text-center">
            <div className="w-12 h-12 bg-rose-950 border-2 border-rose-600 text-rose-400 mx-auto mb-3 flex items-center justify-center">
              <StopCircle className="w-6 h-6" />
            </div>
            <h3 className="font-mono text-xl font-black uppercase tracking-wider text-rose-400 mb-1">
              ABORT MATCH?
            </h3>
            <p className="font-mono text-xs text-neutral-300 mb-5">
              Are you sure you want to abort the match? The game will immediately end for all players and return to the lobby.
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowAbortConfirm(false)}
                className="flex-1 py-2.5 bg-neutral-950 hover:bg-neutral-800 border-2 border-neutral-700 text-neutral-300 font-mono font-bold text-xs uppercase"
              >
                CANCEL
              </button>
              <button
                onClick={handleConfirmAbort}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 border-2 border-black text-white font-mono font-black text-xs uppercase tracking-wider shadow-[3px_3px_0px_#000]"
              >
                YES, ABORT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Match Aborted Banner / Dialog (Sharp Box) */}
      {gameState.status === 'aborted' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-neutral-900 border-2 border-amber-400 p-6 shadow-[6px_6px_0px_#000] text-white text-center">
            <div className="w-12 h-12 bg-amber-400 border border-black text-black mx-auto mb-3 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-mono text-xl font-black uppercase tracking-wider text-amber-400 mb-1">
              MATCH ABORTED
            </h3>
            <p className="font-mono text-xs text-neutral-200 mb-1">
              {gameState.abortInfo?.abortedBy ? (
                <>Aborted by <strong className="text-white">{gameState.abortInfo.abortedBy}</strong></>
              ) : (
                'The match was ended early.'
              )}
            </p>
            <p className="font-mono text-xs text-neutral-400 mb-5">
              {gameState.abortInfo?.reason || 'Player disconnected or requested to abort.'}
            </p>
            <button
              onClick={() => {
                soundService.play('click');
                onLeaveRoom();
              }}
              className="w-full py-3 bg-amber-400 hover:bg-amber-300 border-2 border-black text-black font-mono font-black text-xs uppercase tracking-wider shadow-[4px_4px_0px_#000] flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              <span>RETURN TO LOBBY</span>
            </button>
          </div>
        </div>
      )}

      {/* Color Picker Modal */}
      <ColorPickerModal
        isOpen={pendingWildCard !== null}
        onSelectColor={handleSelectColor}
        title={pendingWildCard?.value === 'wild4' ? 'WILD +4 COLOR' : 'WILD COLOR'}
      />

      {/* Challenge Modal */}
      {gameState.activeChallenge && gameState.activeChallenge.targetPlayerId === gameState.myPlayerId && (
        <ChallengeModal
          challenge={gameState.activeChallenge}
          onDecision={(didChallenge) => socketClient.resolveChallenge(didChallenge)}
        />
      )}

      {/* Scoreboard Modal */}
      <ScoreboardModal
        gameState={gameState}
        onNextRound={() => socketClient.nextRound()}
        onRestartMatch={() => socketClient.startGame()}
        onLeaveRoom={onLeaveRoom}
      />

      {/* How to Play Modal */}
      <HowToPlayModal isOpen={showHowToPlay} onClose={() => setShowHowToPlay(false)} />
    </div>
  );
};
