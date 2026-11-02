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
  Users,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface GameTableProps {
  gameState: ClientGameState;
  onLeaveRoom: () => void;
}

const COLOR_BORDER_MAP: Record<ActiveColor, string> = {
  red: 'border-red-500 shadow-red-500/50',
  blue: 'border-blue-500 shadow-blue-500/50',
  green: 'border-emerald-500 shadow-emerald-500/50',
  yellow: 'border-amber-400 shadow-amber-400/50',
};

const COLOR_BG_MAP: Record<ActiveColor, string> = {
  red: 'bg-red-600',
  blue: 'bg-blue-600',
  green: 'bg-emerald-600',
  yellow: 'bg-amber-400 text-black',
};

export const GameTable: React.FC<GameTableProps> = ({ gameState, onLeaveRoom }) => {
  const [isMuted, setIsMuted] = useState(soundService.getMuted());
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [pendingWildCard, setPendingWildCard] = useState<Card | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [unoAlertText, setUnoAlertText] = useState<string | null>(null);
  const [recentChatReaction, setRecentChatReaction] = useState<{ name: string; text: string } | null>(null);

  const isMyTurn = gameState.activePlayerId === gameState.myPlayerId;
  const isHost = gameState.hostId === gameState.myPlayerId;
  const me = gameState.players.find((p) => p.id === gameState.myPlayerId);

  // Filter out self to get opponents list
  const myIndex = gameState.players.findIndex((p) => p.id === gameState.myPlayerId);
  const opponents = gameState.players
    .map((p, idx) => ({ player: p, originalIndex: idx }))
    .filter((item) => item.player.id !== gameState.myPlayerId);

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
      setUnoAlertText(`${data.playerName.toUpperCase()} CALLED UNO! 🔥`);
      setTimeout(() => setUnoAlertText(null), 3000);
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
    if (!isMyTurn) return;
    if (gameState.activeChallenge) return;

    if (card.color === 'wild') {
      // Prompt user to pick color
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
    if (!isMyTurn) return;
    if (gameState.activeChallenge) return;
    socketClient.drawCard();
  };

  // Send quick reaction
  const handleSendEmote = (emote: string) => {
    soundService.play('click');
    socketClient.sendChat(undefined, emote);
  };

  // Layout opponents based on count (1 opponent -> top; 2 opponents -> left & right; 3 opponents -> left, top, right)
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
    <div className="relative min-h-screen w-full bg-gradient-to-b from-emerald-950 via-neutral-950 to-emerald-950 text-white flex flex-col justify-between overflow-x-hidden select-none">
      {/* Background table felt texture effect */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-900/40 via-neutral-950/80 to-black pointer-events-none" />

      {/* Top Header Bar */}
      <header className="relative z-20 flex items-center justify-between px-3 md:px-6 py-2.5 bg-neutral-950/80 backdrop-blur-md border-b border-neutral-800">
        {/* Left: Room Code & Link */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-700">
            <span className="text-xs text-neutral-400 font-bold uppercase">Room:</span>
            <span className="text-sm font-black text-amber-400 tracking-wider font-mono">
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

          <div className="hidden sm:flex items-center gap-2 text-xs text-neutral-400">
            <span className="px-2 py-1 rounded-lg bg-neutral-900 border border-neutral-800">
              {gameState.settings.isSingleRound ? 'Single Round' : `Target: ${gameState.settings.targetScore} pts`}
            </span>
          </div>
        </div>

        {/* Center: Turn Direction Indicator */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-900/90 border border-neutral-700 text-xs font-bold text-neutral-200">
            {gameState.turnDirection === 1 ? (
              <>
                <RotateCw className="w-3.5 h-3.5 text-amber-400 animate-spin" style={{ animationDuration: '6s' }} />
                <span className="hidden md:inline">Clockwise</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5 text-blue-400 animate-spin" style={{ animationDuration: '6s' }} />
                <span className="hidden md:inline">Counter-Clockwise</span>
              </>
            )}
          </div>
        </div>

        {/* Right: Sound, Rules, Leave */}
        <div className="flex items-center gap-1.5 md:gap-2">
          <button
            onClick={handleToggleMute}
            className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white transition"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            onClick={() => {
              soundService.play('click');
              setShowHowToPlay(true);
            }}
            className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white transition"
            title="Rules & How to Play"
          >
            <HelpCircle className="w-4 h-4 text-amber-400" />
          </button>

          <button
            onClick={() => {
              soundService.play('click');
              onLeaveRoom();
            }}
            className="p-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800 text-rose-300 hover:text-rose-100 transition"
            title="Leave Room"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Floating Big UNO Alert Notification */}
      {unoAlertText && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-bounce pointer-events-none">
          <div className="px-6 py-2.5 rounded-full bg-gradient-to-r from-red-600 via-amber-500 to-red-600 text-white font-black text-lg shadow-[0_0_30px_rgba(245,158,11,0.6)] border-2 border-white flex items-center gap-2">
            <Flame className="w-6 h-6 text-yellow-200" />
            {unoAlertText}
          </div>
        </div>
      )}

      {/* Floating Reaction Emote Bubble */}
      {recentChatReaction && (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 z-40 animate-fadeIn pointer-events-none">
          <div className="px-4 py-2 rounded-2xl bg-neutral-900/90 border border-neutral-700 shadow-2xl backdrop-blur-md flex items-center gap-2">
            <span className="text-xs font-bold text-neutral-400">{recentChatReaction.name}:</span>
            <span className="text-xl">{recentChatReaction.text}</span>
          </div>
        </div>
      )}

      {/* MAIN GAME TABLE / WAITING ROOM */}
      {gameState.status === 'waiting' ? (
        /* ================= WAITING LOBBY ================= */
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-4 max-w-xl mx-auto w-full text-center">
          <div className="w-full rounded-3xl bg-neutral-900/90 border-2 border-neutral-800 p-6 md:p-8 shadow-2xl backdrop-blur-md">
            <div className="inline-flex p-3 rounded-2xl bg-emerald-500/20 border border-emerald-400 mb-4 text-emerald-400">
              <Users className="w-8 h-8" />
            </div>

            <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-wider mb-2">
              Waiting for Players
            </h2>
            <p className="text-xs md:text-sm text-neutral-400 mb-6">
              Share the Room Code with friends to join! Need 2 to 4 players.
            </p>

            {/* Room Code Card */}
            <div
              onClick={handleCopyRoom}
              className="group cursor-pointer flex items-center justify-between p-4 rounded-2xl bg-neutral-950 border border-neutral-800 hover:border-amber-400/60 transition mb-6"
            >
              <div className="text-left">
                <span className="text-xs text-neutral-500 block uppercase font-bold">Room Code</span>
                <span className="text-2xl font-black text-amber-400 font-mono tracking-widest">
                  {gameState.roomCode}
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 text-xs font-bold text-neutral-300 group-hover:bg-amber-400 group-hover:text-black transition">
                {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCode ? 'Copied!' : 'Copy Link'}</span>
              </div>
            </div>

            {/* Player Seats List */}
            <div className="space-y-2.5 mb-6 text-left">
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block mb-1">
                Players in Room ({gameState.players.length}/{gameState.settings.maxPlayers})
              </span>
              {gameState.players.map((p) => {
                const isPlayerHost = p.id === gameState.hostId;
                const isCurrentMe = p.id === gameState.myPlayerId;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between p-3 rounded-xl border ${
                      isCurrentMe
                        ? 'bg-neutral-800/80 border-amber-400/50'
                        : 'bg-neutral-950/60 border-neutral-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {p.avatar === 'fox' ? '🦊' : p.avatar === 'bear' ? '🐻' : p.avatar === 'panda' ? '🐼' : p.avatar === 'lion' ? '🦁' : p.avatar === 'tiger' ? '🐯' : p.avatar === 'rabbit' ? '🐰' : p.avatar === 'dragon' ? '🐲' : '⚡'}
                      </span>
                      <div>
                        <div className="font-bold text-sm text-white flex items-center gap-2">
                          {p.name}
                          {isCurrentMe && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-700 text-neutral-300">You</span>
                          )}
                          {isPlayerHost && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Host
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-neutral-400">
                          {p.isConnected ? 'Connected' : 'Disconnected'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {p.isReady ? (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/80 font-bold flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          Ready
                        </span>
                      ) : (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-neutral-900 text-neutral-400 border border-neutral-800 font-medium">
                          Waiting
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
                className={`w-full py-4 px-6 rounded-2xl font-black text-base shadow-xl flex items-center justify-center gap-2 transition-all duration-200 ${
                  gameState.players.length >= 2
                    ? 'bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-600 hover:from-emerald-400 hover:to-green-400 text-white hover:scale-[1.02] active:scale-[0.98]'
                    : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                }`}
              >
                <Play className="w-5 h-5 fill-current" />
                {gameState.players.length >= 2
                  ? 'START UNO GAME'
                  : `WAITING FOR PLAYERS (Need at least 2)`}
              </button>
            ) : (
              <div className="py-4 px-6 rounded-2xl bg-neutral-950 border border-neutral-800 text-sm text-neutral-400 flex items-center justify-center gap-2 animate-pulse">
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
            {/* Active Turn Banner */}
            <div className="mb-3">
              <div
                className={`px-4 py-1.5 rounded-full border text-xs md:text-sm font-black uppercase tracking-wider shadow-lg flex items-center gap-2 transition-all ${
                  isMyTurn
                    ? 'bg-amber-400 text-black border-amber-300 ring-4 ring-amber-400/40 animate-pulse'
                    : 'bg-neutral-900/90 text-neutral-300 border-neutral-700'
                }`}
              >
                {isMyTurn ? (
                  <>
                    <Flame className="w-4 h-4 text-red-600 animate-bounce" />
                    <span>IT'S YOUR TURN!</span>
                  </>
                ) : (
                  <>
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                    <span>
                      {gameState.players.find((p) => p.id === gameState.activePlayerId)?.name || 'Player'}'s turn
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Piles and Central Action Row */}
            <div className="flex items-center justify-center gap-6 md:gap-10">
              {/* Draw Pile (Clickable on turn) */}
              <div className="flex flex-col items-center">
                <div
                  onClick={isMyTurn ? handleDrawCard : undefined}
                  className={`relative cursor-pointer transition-all duration-200 ${
                    isMyTurn
                      ? 'hover:scale-105 active:scale-95 ring-4 ring-amber-400/60 ring-offset-2 ring-offset-emerald-950 rounded-2xl'
                      : 'cursor-not-allowed'
                  }`}
                  title={isMyTurn ? 'Click to Draw a Card' : 'Draw Pile'}
                >
                  {/* Visual 3D Stack depth */}
                  <div className="absolute top-1 left-1 w-20 md:w-24 h-28 md:h-36 rounded-2xl bg-neutral-900 border border-neutral-800 -z-10" />
                  <div className="absolute top-2 left-2 w-20 md:w-24 h-28 md:h-36 rounded-2xl bg-neutral-900 border border-neutral-800 -z-20" />

                  <CardView isFaceDown size="lg" className="shadow-2xl" />

                  {/* Draw Pile Count Badge */}
                  <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 text-[10px] md:text-xs font-bold text-neutral-200 whitespace-nowrap shadow-md">
                    {gameState.drawPileCount} cards
                  </div>

                  {isMyTurn && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl opacity-0 hover:opacity-100 transition-opacity">
                      <span className="font-black text-amber-300 text-xs md:text-sm uppercase tracking-wider drop-shadow-md">
                        +1 Draw
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Active Color & Discard Pile */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  {/* Glowing color ring around top discard */}
                  <div
                    className={`absolute -inset-2.5 rounded-3xl border-4 ${
                      gameState.activeColor ? COLOR_BORDER_MAP[gameState.activeColor] : 'border-neutral-600'
                    } shadow-2xl transition-all duration-300 pointer-events-none animate-pulse`}
                  />

                  {gameState.topDiscard ? (
                    <CardView card={gameState.topDiscard} size="lg" className="shadow-2xl rotate-2" />
                  ) : (
                    <div className="w-24 h-36 rounded-2xl border-2 border-dashed border-neutral-700 flex items-center justify-center text-xs text-neutral-500">
                      Discard
                    </div>
                  )}

                  {/* Active Color Tag */}
                  {gameState.activeColor && (
                    <div
                      className={`absolute -bottom-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full ${
                        COLOR_BG_MAP[gameState.activeColor]
                      } text-[10px] md:text-xs font-black uppercase tracking-wider shadow-lg border border-white/60 whitespace-nowrap`}
                    >
                      Color: {gameState.activeColor}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Interactive Turn Action Prompt / Drawn Card Options */}
            {isMyTurn && gameState.pendingDrawnCard && (
              <div className="mt-4 p-3 rounded-2xl bg-neutral-900/95 border-2 border-amber-400 shadow-2xl flex flex-col sm:flex-row items-center gap-3 animate-fadeIn">
                <span className="text-xs font-bold text-neutral-300">
                  You drew a playable card!
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
                    className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xs shadow-md transition"
                  >
                    Play Drawn Card
                  </button>
                  <button
                    onClick={() => socketClient.passTurn()}
                    className="px-4 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs border border-neutral-700 transition"
                  >
                    Pass Turn
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Player Hand Area */}
          <div className="relative z-20 w-full flex flex-col items-center pb-2">
            {/* Quick Action Buttons Row (UNO Button & Catch UNO Button & Emotes) */}
            <div className="flex items-center justify-between w-full max-w-4xl px-2 mb-2">
              {/* Left: Catch UNO Button (When opponent is vulnerable) */}
              <div>
                {gameState.canCatchUnoTarget ? (
                  <button
                    onClick={() => {
                      soundService.play('click');
                      socketClient.catchUno();
                    }}
                    className="px-4 py-2 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-xs md:text-sm shadow-xl border-2 border-amber-300 animate-bounce flex items-center gap-1.5"
                    title={`Catch ${gameState.canCatchUnoTarget.targetPlayerName} for forgetting to call UNO!`}
                  >
                    <AlertCircle className="w-4 h-4 text-amber-300" />
                    CATCH UNO! ({gameState.canCatchUnoTarget.targetPlayerName})
                  </button>
                ) : (
                  /* Emote reaction bar */
                  <div className="flex items-center gap-1 bg-neutral-900/80 p-1 rounded-2xl border border-neutral-800">
                    {['🔥', '🤝', '😱', '😂', '🤔'].map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleSendEmote(emoji)}
                        className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-neutral-800 text-base transition hover:scale-125"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Center / Right: Big Official UNO Button */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    soundService.play('click');
                    socketClient.callUno();
                  }}
                  className={`px-6 py-2.5 rounded-2xl font-black text-sm md:text-base tracking-wider shadow-2xl transition-all duration-200 flex items-center gap-2 border-2 ${
                    me?.cardCount === 1 || me?.cardCount === 2
                      ? 'bg-gradient-to-r from-red-600 via-amber-500 to-red-600 hover:from-red-500 hover:to-amber-400 text-white border-yellow-300 ring-4 ring-red-500/50 scale-105 animate-pulse'
                      : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border-neutral-700'
                  }`}
                  title="Call UNO when you have 1 or 2 cards left!"
                >
                  <Flame className="w-5 h-5 text-amber-300" />
                  <span>UNO!</span>
                  {me?.calledUno && <Check className="w-4 h-4 text-emerald-400" />}
                </button>
              </div>
            </div>

            {/* Hand Cards Fan Spread */}
            <div className="w-full flex justify-center overflow-x-auto py-3 px-2 no-scrollbar">
              <div className="inline-flex items-end justify-center min-w-max pb-2">
                {gameState.myHand.length === 0 ? (
                  <div className="text-sm text-neutral-400 italic">No cards in hand.</div>
                ) : (
                  gameState.myHand.map((card, index) => {
                    // Check if card is playable
                    const topDiscard = gameState.topDiscard;
                    const activeColor = gameState.activeColor;
                    const isPlayable = Boolean(
                      isMyTurn &&
                      topDiscard &&
                      activeColor &&
                      (card.color === 'wild' ||
                        card.color === activeColor ||
                        card.value === topDiscard.value)
                    );

                    // Dynamic fan rotation and spacing
                    const total = gameState.myHand.length;
                    const spreadAngle = total > 1 ? Math.min(4, 30 / total) : 0;
                    const angle = (index - (total - 1) / 2) * spreadAngle;
                    const translateY = Math.abs(index - (total - 1) / 2) * 2;

                    return (
                      <div
                        key={card.id}
                        className="-ml-4 sm:-ml-5 first:ml-0 transition-transform duration-200"
                        style={{
                          transform: `translateY(${translateY}px) rotate(${angle}deg)`,
                          zIndex: index,
                        }}
                      >
                        <CardView
                          card={card}
                          size="md"
                          isPlayable={isPlayable}
                          disabled={!isMyTurn}
                          onClick={() => handleCardClick(card)}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Player Status Badge */}
            <div className="flex items-center gap-3 text-xs text-neutral-400 mt-1">
              <span className="font-bold text-white flex items-center gap-1">
                Your Hand: <span className="text-amber-400">{gameState.myHand.length} cards</span>
              </span>
              <span>•</span>
              <span>Total Points: <strong className="text-white">{me?.totalScore || 0}</strong></span>
              {me?.calledUno && (
                <>
                  <span>•</span>
                  <span className="text-amber-400 font-bold flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5" /> UNO Called!
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Logs Drawer Toggle (Bottom-Right) */}
      <div className="fixed bottom-2 right-2 z-40">
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-700 text-xs font-bold text-neutral-300 shadow-xl backdrop-blur-md transition"
        >
          <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
          <span>Game Log</span>
          {showLogs ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>

        {showLogs && (
          <div className="absolute bottom-10 right-0 w-80 md:w-96 rounded-2xl bg-neutral-950/95 border-2 border-neutral-800 p-3 shadow-2xl backdrop-blur-md max-h-64 overflow-y-auto space-y-1 text-xs text-neutral-300">
            <div className="font-bold text-neutral-400 pb-1 mb-1 border-b border-neutral-800 flex justify-between">
              <span>Game Action Log</span>
              <span>{gameState.logs.length} events</span>
            </div>
            {gameState.logs.length === 0 ? (
              <div className="text-neutral-500 italic py-2">No actions logged yet.</div>
            ) : (
              [...gameState.logs].reverse().map((entry) => (
                <div
                  key={entry.id}
                  className={`py-1 border-b border-neutral-900 ${
                    entry.type === 'challenge'
                      ? 'text-amber-300 font-semibold'
                      : entry.type === 'uno'
                      ? 'text-rose-400 font-bold'
                      : entry.type === 'round_win'
                      ? 'text-emerald-400 font-bold'
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

      {/* Modals */}
      <ColorPickerModal
        isOpen={pendingWildCard !== null}
        onSelectColor={handleSelectColor}
        title={pendingWildCard?.value === 'wild4' ? 'Wild Draw Four Color' : 'Wild Color'}
      />

      {gameState.activeChallenge && gameState.activeChallenge.targetPlayerId === gameState.myPlayerId && (
        <ChallengeModal
          challenge={gameState.activeChallenge}
          onDecision={(didChallenge) => socketClient.resolveChallenge(didChallenge)}
        />
      )}

      <ScoreboardModal
        gameState={gameState}
        onNextRound={() => socketClient.nextRound()}
        onRestartMatch={() => socketClient.startGame()}
      />

      <HowToPlayModal isOpen={showHowToPlay} onClose={() => setShowHowToPlay(false)} />
    </div>
  );
};
