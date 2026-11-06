/**
 * Official UNO Game Types
 */

export type CardColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild';
export type ActiveColor = 'red' | 'blue' | 'green' | 'yellow';

export type CardValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild4';

export interface Card {
  id: string; // Unique card identifier (e.g. 'red_7_1', 'wild4_3')
  color: CardColor;
  value: CardValue;
  score: number; // Face value: 0-9, action: 20, wild: 50
}

export interface UserAccountProfile {
  username: string;
  displayName: string;
  avatar: string;
  totalScore: number;
  matchesPlayed: number;
  matchesWon: number;
  roundsWon: number;
  unoShouts: number;
  createdAt: number;
  lastActiveAt: number;
}

export interface PlayerPublicInfo {
  id: string;
  name: string;
  avatar: string;
  cardCount: number;
  isReady: boolean;
  isConnected: boolean;
  calledUno: boolean;
  score: number;
  totalScore: number; // For match play
  roundWins: number;
  accountUsername?: string;
}

export interface PlayerPrivateInfo extends PlayerPublicInfo {
  sessionToken: string;
  hand: Card[];
}

export type GameStatus = 'waiting' | 'in_progress' | 'round_over' | 'game_over' | 'aborted';
export type TurnDirection = 1 | -1; // 1 = clockwise, -1 = counter-clockwise

export interface WildChallengeState {
  offenderId: string;
  offenderName: string;
  targetPlayerId: string;
  targetPlayerName: string;
  colorBeforeWild: ActiveColor;
  chosenColor: ActiveColor;
  wildCard: Card;
  offenderHadMatchingColor: boolean; // Server-computed ground truth
}

export interface GameLogEntry {
  id: string;
  timestamp: number;
  type: 'play' | 'draw' | 'pass' | 'uno' | 'catch_uno' | 'challenge' | 'round_win' | 'info' | 'system' | 'pause' | 'resume' | 'timeout';
  message: string;
  playerId?: string;
  playerName?: string;
  card?: Card;
  color?: ActiveColor;
}

export interface RoomSettings {
  maxPlayers: number; // 2, 3, or 4
  targetScore: number; // 500 for standard match, or 1 for single round
  isSingleRound: boolean;
  isPrivate: boolean;
}

export interface PublicRoomSummary {
  roomCode: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  status: GameStatus;
  targetScore: number;
  isSingleRound: boolean;
}

export interface ClientGameState {
  roomCode: string;
  hostId: string;
  status: GameStatus;
  settings: RoomSettings;
  players: PlayerPublicInfo[];
  myPlayerId: string;
  myHand: Card[];
  currentTurnIndex: number; // Index in players array
  activePlayerId: string;
  turnDirection: TurnDirection;
  topDiscard: Card | null;
  activeColor: ActiveColor | null;
  drawPileCount: number;
  discardPileCount: number;
  // Interaction state
  activeChallenge: WildChallengeState | null;
  pendingDrawnCard: Card | null; // If player drew a playable card and has option to play or pass
  lastPlayTimestamp: number;
  canCallUno: boolean; // True if local player has 1 card and hasn't called UNO
  canCatchUnoTarget: { targetPlayerId: string; targetPlayerName: string } | null;
  roundWinner: {
    playerId: string;
    playerName: string;
    pointsEarned: number;
    breakdown: { opponentName: string; points: number }[];
  } | null;
  gameWinner: {
    playerId: string;
    playerName: string;
    finalScore: number;
  } | null;
  abortInfo?: {
    abortedBy: string;
    reason: string;
  } | null;
  disconnectedPlayer?: {
    id: string;
    name: string;
    disconnectedAt: number;
    isTurnPlayer: boolean;
  } | null;
  isPaused: boolean;
  pausedBy?: string | null;
  turnStartedAt: number;
  turnTimeoutMs: number;
  onlyOnePlayerLeft?: boolean;
  logs: GameLogEntry[];
}
