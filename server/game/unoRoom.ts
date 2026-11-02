import {
  Card,
  ActiveColor,
  TurnDirection,
  GameStatus,
  PlayerPrivateInfo,
  PlayerPublicInfo,
  ClientGameState,
  WildChallengeState,
  GameLogEntry,
  RoomSettings,
} from '../../src/types/uno.ts';
import {
  createUnoDeck,
  shuffleCards,
  isCardPlayable,
  hasColorMatch,
  calculateHandScore,
} from './deck.ts';

export class UnoRoom {
  public roomCode: string;
  public hostId: string;
  public status: GameStatus = 'waiting';
  public settings: RoomSettings;
  public players: PlayerPrivateInfo[] = [];

  public drawPile: Card[] = [];
  public discardPile: Card[] = [];
  public activeColor: ActiveColor = 'red';
  public currentTurnIndex: number = 0;
  public turnDirection: TurnDirection = 1;

  public activeChallenge: WildChallengeState | null = null;
  public pendingDrawnCard: { playerId: string; card: Card } | null = null;
  public unoVulnerablePlayerId: string | null = null; // Player with 1 card who didn't call UNO

  public roundWinner: ClientGameState['roundWinner'] = null;
  public gameWinner: ClientGameState['gameWinner'] = null;
  public abortInfo: ClientGameState['abortInfo'] = null;
  public disconnectedPlayer: ClientGameState['disconnectedPlayer'] = null;
  public isPaused: boolean = false;
  public pausedBy: string | null = null;
  public turnStartedAt: number = Date.now();
  public turnTimeoutMs: number = 180000; // 3 minutes timeout
  public logs: GameLogEntry[] = [];
  public lastPlayTimestamp: number = Date.now();
  public createdAt: number = Date.now();

  constructor(roomCode: string, hostId: string, settings?: Partial<RoomSettings>) {
    this.roomCode = roomCode;
    this.hostId = hostId;
    this.settings = {
      maxPlayers: settings?.maxPlayers || 4,
      targetScore: settings?.targetScore || 500,
      isSingleRound: settings?.isSingleRound ?? false,
      isPrivate: settings?.isPrivate ?? false,
    };
  }

  public addLog(
    type: GameLogEntry['type'],
    message: string,
    extra?: { playerId?: string; playerName?: string; card?: Card; color?: ActiveColor }
  ) {
    const entry: GameLogEntry = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      type,
      message,
      ...extra,
    };
    this.logs.push(entry);
    if (this.logs.length > 80) {
      this.logs.shift();
    }
  }

  public addPlayer(id: string, sessionToken: string, name: string, avatar: string): boolean {
    if (this.players.length >= this.settings.maxPlayers && !this.players.some((p) => p.sessionToken === sessionToken)) {
      return false;
    }

    // Check if re-joining
    const existing = this.players.find((p) => p.sessionToken === sessionToken);
    if (existing) {
      existing.id = id;
      existing.isConnected = true;
      existing.name = name || existing.name;
      existing.avatar = avatar || existing.avatar;
      if (this.disconnectedPlayer && this.disconnectedPlayer.id === existing.id) {
        this.disconnectedPlayer = null;
      }
      this.addLog('system', `✅ ${existing.name} reconnected!`);
      return true;
    }

    if (this.status !== 'waiting') {
      return false; // Cannot join mid-game as a new player
    }

    const newPlayer: PlayerPrivateInfo = {
      id,
      sessionToken,
      name,
      avatar,
      hand: [],
      cardCount: 0,
      isReady: this.players.length === 0, // Host is ready by default
      isConnected: true,
      calledUno: false,
      score: 0,
      totalScore: 0,
      roundWins: 0,
    };

    this.players.push(newPlayer);
    this.addLog('info', `${name} joined the room.`);
    return true;
  }

  public removePlayer(playerId: string): void {
    const playerIndex = this.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) return;

    const player = this.players[playerIndex];
    player.isConnected = false;

    if (this.status === 'waiting') {
      this.players.splice(playerIndex, 1);
      this.addLog('info', `${player.name} left the room.`);
      if (this.hostId === playerId && this.players.length > 0) {
        this.hostId = this.players[0].id;
        this.addLog('system', `${this.players[0].name} is now the host.`);
      }
    } else {
      const isTurn = this.players[this.currentTurnIndex]?.id === playerId;
      this.disconnectedPlayer = {
        id: player.id,
        name: player.name,
        disconnectedAt: Date.now(),
        isTurnPlayer: isTurn,
      };
      this.addLog('system', `⚠️ ${player.name} lost connection. Waiting for reconnection...`);
    }
  }

  public abortGame(abortedById: string, reason?: string): boolean {
    const player = this.players.find((p) => p.id === abortedById);
    this.status = 'aborted';
    this.abortInfo = {
      abortedBy: player?.name || 'Host',
      reason: reason || 'Match was aborted by player request',
    };
    this.addLog('system', `🛑 MATCH ABORTED by ${this.abortInfo.abortedBy}. (${this.abortInfo.reason})`);
    return true;
  }

  public skipDisconnectedTurn(requesterId: string): boolean {
    const currentTurnPlayer = this.players[this.currentTurnIndex];
    if (!currentTurnPlayer || currentTurnPlayer.isConnected) {
      return false;
    }
    const requester = this.players.find((p) => p.id === requesterId);
    this.addLog('system', `⏩ ${requester?.name || 'Player'} skipped turn for disconnected ${currentTurnPlayer.name}.`);
    this.advanceTurn(1);
    return true;
  }

  public pauseGame(requesterId: string): boolean {
    if (this.status !== 'in_progress' || this.isPaused) return false;
    const player = this.players.find((p) => p.id === requesterId);
    this.isPaused = true;
    this.pausedBy = player?.name || 'Player';
    this.addLog('pause', `⏸️ Game PAUSED by ${this.pausedBy}.`);
    return true;
  }

  public resumeGame(requesterId: string): boolean {
    if (!this.isPaused) return false;
    const player = this.players.find((p) => p.id === requesterId);
    this.isPaused = false;
    this.pausedBy = null;
    this.turnStartedAt = Date.now();
    this.addLog('resume', `▶️ Game RESUMED by ${player?.name || 'Player'}.`);
    return true;
  }

  public checkTurnTimeout(): { updated: boolean; aborted: boolean; reason?: string } {
    if (this.status !== 'in_progress' || this.isPaused) {
      return { updated: false, aborted: false };
    }

    const connectedPlayers = this.players.filter((p) => p.isConnected);
    // If only one player is connected in an in-progress multiplayer match:
    if (connectedPlayers.length <= 1 && this.players.length > 1) {
      const dropTime = this.disconnectedPlayer?.disconnectedAt || this.lastPlayTimestamp;
      // If others have been disconnected for > 45s, auto-abort and release remaining player
      if (Date.now() - dropTime > 45000) {
        this.abortGame(connectedPlayers[0]?.id || '', 'Match ended: Opponents disconnected.');
        return { updated: true, aborted: true, reason: 'Opponents disconnected.' };
      }
    }

    // Check turn duration (3 minutes)
    const elapsed = Date.now() - this.turnStartedAt;
    if (elapsed >= this.turnTimeoutMs) {
      const current = this.players[this.currentTurnIndex];
      if (connectedPlayers.length <= 1) {
        this.abortGame(connectedPlayers[0]?.id || '', 'Match aborted: Player inactive for more than 3 minutes.');
        return { updated: true, aborted: true, reason: 'Player inactive for more than 3 minutes.' };
      }

      this.addLog('timeout', `⏰ ${current?.name}'s turn timed out (3 min inactivity). Auto-drawn card & turn passed.`);
      const drawn = this.drawCardsFromPile(1);
      if (current) {
        current.hand.push(...drawn);
        current.cardCount = current.hand.length;
      }
      this.advanceTurn(1);
      return { updated: true, aborted: false };
    }

    return { updated: false, aborted: false };
  }

  public setReady(playerId: string, isReady: boolean): void {
    const player = this.players.find((p) => p.id === playerId);
    if (player) {
      player.isReady = isReady;
    }
  }

  public startRound(): boolean {
    if (this.players.length < 2) return false;

    // Reset round states
    this.status = 'in_progress';
    this.roundWinner = null;
    this.activeChallenge = null;
    this.pendingDrawnCard = null;
    this.unoVulnerablePlayerId = null;
    this.turnDirection = 1;

    // Build and shuffle 108 cards
    const deck = shuffleCards(createUnoDeck());
    this.drawPile = deck;
    this.discardPile = [];

    // Deal 7 cards to each player
    for (const player of this.players) {
      player.hand = this.drawPile.splice(0, 7);
      player.cardCount = player.hand.length;
      player.calledUno = false;
      player.score = 0;
    }

    // Flip starting card from draw pile
    let startingCard = this.drawPile.pop()!;
    // If Wild Draw Four is starting card, official rule: reshuffle and pick again
    while (startingCard.value === 'wild4') {
      this.drawPile.unshift(startingCard);
      this.drawPile = shuffleCards(this.drawPile);
      startingCard = this.drawPile.pop()!;
    }

    this.discardPile.push(startingCard);
    this.currentTurnIndex = 0;

    // Apply starting card effects
    const colors: ActiveColor[] = ['red', 'blue', 'green', 'yellow'];
    if (startingCard.color === 'wild') {
      // Wild starts: random color chosen for table
      this.activeColor = colors[Math.floor(Math.random() * colors.length)];
      this.addLog('play', `Round started with Wild! Active color set to ${this.activeColor.toUpperCase()}.`, {
        card: startingCard,
        color: this.activeColor,
      });
    } else {
      this.activeColor = startingCard.color as ActiveColor;
      this.addLog('play', `Round started! Top card is ${startingCard.color.toUpperCase()} ${startingCard.value.toUpperCase()}.`, {
        card: startingCard,
        color: this.activeColor,
      });
    }

    // If starting card is Action Card:
    if (startingCard.value === 'draw2') {
      const firstPlayer = this.players[this.currentTurnIndex];
      const drawn = this.drawCardsFromPile(2);
      firstPlayer.hand.push(...drawn);
      firstPlayer.cardCount = firstPlayer.hand.length;
      this.addLog('play', `Starting card was Draw Two! ${firstPlayer.name} drew 2 cards and was skipped.`);
      this.advanceTurn(1);
    } else if (startingCard.value === 'skip') {
      const firstPlayer = this.players[this.currentTurnIndex];
      this.addLog('play', `Starting card was Skip! ${firstPlayer.name} was skipped.`);
      this.advanceTurn(1);
    } else if (startingCard.value === 'reverse') {
      if (this.players.length === 2) {
        // In 2 player, reverse acts as skip
        const firstPlayer = this.players[this.currentTurnIndex];
        this.addLog('play', `Starting card was Reverse (2-player skip)! ${firstPlayer.name} was skipped.`);
        this.advanceTurn(1);
      } else {
        this.turnDirection = -1;
        this.addLog('play', `Starting card was Reverse! Turn direction is now Counter-Clockwise.`);
      }
    }

    this.lastPlayTimestamp = Date.now();
    return true;
  }

  private drawCardsFromPile(count: number): Card[] {
    const drawn: Card[] = [];
    for (let i = 0; i < count; i++) {
      if (this.drawPile.length === 0) {
        if (this.discardPile.length <= 1) {
          break; // No cards left to reshuffle
        }
        // Reshuffle discard pile except top card
        const top = this.discardPile.pop()!;
        this.drawPile = shuffleCards(this.discardPile);
        this.discardPile = [top];
        this.addLog('info', 'Draw pile exhausted. Reshuffled discard pile into draw pile.');
      }
      if (this.drawPile.length > 0) {
        drawn.push(this.drawPile.pop()!);
      }
    }
    return drawn;
  }

  public advanceTurn(steps: number = 1): void {
    const n = this.players.length;
    // Clear pending drawn card if turn advances
    this.pendingDrawnCard = null;

    let nextIndex = (this.currentTurnIndex + steps * this.turnDirection) % n;
    if (nextIndex < 0) {
      nextIndex += n;
    }
    this.currentTurnIndex = nextIndex;
    this.lastPlayTimestamp = Date.now();
    this.turnStartedAt = Date.now();
  }

  public playCard(playerId: string, cardId: string, chosenColor?: ActiveColor): { success: boolean; message?: string } {
    if (this.status !== 'in_progress') return { success: false, message: 'Game is not in progress' };
    if (this.isPaused) return { success: false, message: 'Game is currently paused' };
    if (this.activeChallenge) return { success: false, message: 'Must resolve pending Wild Draw Four challenge first' };

    const player = this.players[this.currentTurnIndex];
    if (player.id !== playerId) return { success: false, message: 'Not your turn' };

    const cardIndex = player.hand.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) return { success: false, message: 'Card not in your hand' };

    const card = player.hand[cardIndex];
    const topDiscard = this.discardPile[this.discardPile.length - 1];

    if (!isCardPlayable(card, topDiscard, this.activeColor)) {
      return { success: false, message: 'This card cannot be played on the current discard' };
    }

    if (card.color === 'wild' && !chosenColor) {
      return { success: false, message: 'You must select a color for this Wild card' };
    }

    // Check if player had matching color before playing Wild Draw 4 (for challenge rule)
    let hadMatchingColor = false;
    const previousActiveColor = this.activeColor;
    if (card.value === 'wild4') {
      hadMatchingColor = hasColorMatch(player.hand, previousActiveColor);
    }

    // Remove card from hand and push to discard pile
    player.hand.splice(cardIndex, 1);
    player.cardCount = player.hand.length;
    this.discardPile.push(card);

    // UNO check:
    // If player has 1 card remaining after playing:
    if (player.cardCount === 1) {
      if (!player.calledUno) {
        // Vulnerable to being caught!
        this.unoVulnerablePlayerId = player.id;
      }
    } else {
      // If they have 0 or more than 1, reset calledUno
      player.calledUno = false;
      if (this.unoVulnerablePlayerId === player.id) {
        this.unoVulnerablePlayerId = null;
      }
    }

    // If opponent was vulnerable and a new card is played by next player, penalty opportunity passes
    if (this.unoVulnerablePlayerId && this.unoVulnerablePlayerId !== player.id) {
      this.unoVulnerablePlayerId = null;
    }

    // Set new active color
    if (card.color === 'wild' && chosenColor) {
      this.activeColor = chosenColor;
    } else {
      this.activeColor = card.color as ActiveColor;
    }

    this.addLog('play', `${player.name} played ${card.color === 'wild' ? '' : card.color.toUpperCase() + ' '}${card.value.toUpperCase()}${chosenColor ? ` (Chose ${chosenColor.toUpperCase()})` : ''}.`, {
      playerId: player.id,
      playerName: player.name,
      card,
      color: this.activeColor,
    });

    // Check round win immediately
    if (player.hand.length === 0) {
      // Official rule: If last card was Draw Two or Wild Draw 4, next player still draws before scoring!
      if (card.value === 'draw2') {
        const nextPlayer = this.getNextPlayer();
        const penalty = this.drawCardsFromPile(2);
        nextPlayer.hand.push(...penalty);
        nextPlayer.cardCount = nextPlayer.hand.length;
        this.addLog('play', `${nextPlayer.name} drew 2 cards from ${player.name}'s final Draw Two.`);
      } else if (card.value === 'wild4') {
        const nextPlayer = this.getNextPlayer();
        const penalty = this.drawCardsFromPile(4);
        nextPlayer.hand.push(...penalty);
        nextPlayer.cardCount = nextPlayer.hand.length;
        this.addLog('play', `${nextPlayer.name} drew 4 cards from ${player.name}'s final Wild Draw Four.`);
      }
      this.handleRoundEnd(player);
      return { success: true };
    }

    // Action card effects
    if (card.value === 'skip') {
      const skippedPlayer = this.getNextPlayer();
      this.addLog('play', `${skippedPlayer.name} was skipped!`);
      this.advanceTurn(2);
    } else if (card.value === 'reverse') {
      if (this.players.length === 2) {
        // In 2-player UNO, Reverse card acts as a Skip!
        const skippedPlayer = this.getNextPlayer();
        this.addLog('play', `Reverse played! In 2-player UNO, ${skippedPlayer.name} is skipped!`);
        this.advanceTurn(2);
      } else {
        this.turnDirection = (this.turnDirection === 1 ? -1 : 1) as TurnDirection;
        this.addLog('play', `Turn direction reversed to ${this.turnDirection === 1 ? 'Clockwise' : 'Counter-Clockwise'}!`);
        this.advanceTurn(1);
      }
    } else if (card.value === 'draw2') {
      const targetPlayer = this.getNextPlayer();
      const drawn = this.drawCardsFromPile(2);
      targetPlayer.hand.push(...drawn);
      targetPlayer.cardCount = targetPlayer.hand.length;
      this.addLog('play', `${targetPlayer.name} drew 2 cards and was skipped!`);
      this.advanceTurn(2);
    } else if (card.value === 'wild4') {
      // Next player gets the option to challenge!
      const targetPlayer = this.getNextPlayer();
      this.activeChallenge = {
        offenderId: player.id,
        offenderName: player.name,
        targetPlayerId: targetPlayer.id,
        targetPlayerName: targetPlayer.name,
        colorBeforeWild: previousActiveColor,
        chosenColor: chosenColor!,
        wildCard: card,
        offenderHadMatchingColor: hadMatchingColor,
      };
      this.addLog('challenge', `${player.name} played Wild Draw Four! ${targetPlayer.name} may Challenge or Accept.`);
      // Turn does NOT advance yet; target player must resolve challenge
    } else {
      // Normal card or standard Wild
      this.advanceTurn(1);
    }

    return { success: true };
  }

  public drawCard(playerId: string): { success: boolean; drawnCard?: Card; canPlay?: boolean; message?: string } {
    if (this.status !== 'in_progress') return { success: false, message: 'Game is not in progress' };
    if (this.isPaused) return { success: false, message: 'Game is currently paused' };
    if (this.activeChallenge) return { success: false, message: 'Challenge pending' };

    const player = this.players[this.currentTurnIndex];
    if (player.id !== playerId) return { success: false, message: 'Not your turn' };

    if (this.pendingDrawnCard && this.pendingDrawnCard.playerId === playerId) {
      return { success: false, message: 'Already drew a card this turn' };
    }

    // Draw 1 card
    const drawn = this.drawCardsFromPile(1);
    if (drawn.length === 0) {
      return { success: false, message: 'No cards available to draw' };
    }

    const card = drawn[0];
    player.hand.push(card);
    player.cardCount = player.hand.length;

    // Reset vulnerable status if another action happens
    if (this.unoVulnerablePlayerId && this.unoVulnerablePlayerId !== player.id) {
      this.unoVulnerablePlayerId = null;
    }

    this.addLog('draw', `${player.name} drew a card.`, { playerId: player.id, playerName: player.name });

    const topDiscard = this.discardPile[this.discardPile.length - 1];
    const canPlay = isCardPlayable(card, topDiscard, this.activeColor);

    if (canPlay) {
      // Player has the choice to play it or pass!
      this.pendingDrawnCard = { playerId: player.id, card };
      return { success: true, drawnCard: card, canPlay: true };
    } else {
      // Cannot play drawn card -> turn automatically passes to next player
      this.advanceTurn(1);
      return { success: true, drawnCard: card, canPlay: false };
    }
  }

  public passTurn(playerId: string): { success: boolean; message?: string } {
    if (this.status !== 'in_progress') return { success: false, message: 'Game is not in progress' };
    if (this.isPaused) return { success: false, message: 'Game is currently paused' };
    const player = this.players[this.currentTurnIndex];
    if (player.id !== playerId) return { success: false, message: 'Not your turn' };
    if (!this.pendingDrawnCard || this.pendingDrawnCard.playerId !== playerId) {
      return { success: false, message: 'You must draw a card before passing' };
    }

    this.addLog('pass', `${player.name} chose to pass after drawing.`);
    this.pendingDrawnCard = null;
    this.advanceTurn(1);
    return { success: true };
  }

  public resolveChallenge(challengerId: string, didChallenge: boolean): { success: boolean; message?: string } {
    if (this.isPaused) return { success: false, message: 'Game is currently paused' };
    if (!this.activeChallenge) return { success: false, message: 'No active challenge' };
    if (this.activeChallenge.targetPlayerId !== challengerId) {
      return { success: false, message: 'You are not the challenged player' };
    }

    const { offenderId, offenderName, targetPlayerId, targetPlayerName, offenderHadMatchingColor, colorBeforeWild } = this.activeChallenge;
    const offender = this.players.find((p) => p.id === offenderId);
    const challenger = this.players.find((p) => p.id === targetPlayerId);

    if (!offender || !challenger) {
      this.activeChallenge = null;
      return { success: false, message: 'Player not found' };
    }

    if (didChallenge) {
      if (offenderHadMatchingColor) {
        // Challenge SUCCEEDED! Offender had matching color!
        const penalty = this.drawCardsFromPile(4);
        offender.hand.push(...penalty);
        offender.cardCount = offender.hand.length;

        this.addLog('challenge', `CHALLENGE SUCCESSFUL! ${offenderName} held a ${colorBeforeWild.toUpperCase()} card! ${offenderName} draws 4 penalty cards! ${challenger.name} takes their turn.`);
        // Challenger takes normal turn (does not draw, does not skip)
        this.currentTurnIndex = this.players.findIndex((p) => p.id === challengerId);
      } else {
        // Challenge FAILED! Offender was honest!
        // Challenger draws 6 cards (4 + 2 penalty) and loses their turn!
        const penalty = this.drawCardsFromPile(6);
        challenger.hand.push(...penalty);
        challenger.cardCount = challenger.hand.length;

        this.addLog('challenge', `CHALLENGE FAILED! ${offenderName} did NOT have any ${colorBeforeWild.toUpperCase()} cards! ${challenger.name} draws 6 cards and is skipped!`);
        // Advance turn past challenger
        this.advanceTurn(2);
      }
    } else {
      // Challenger accepted: draws 4 cards and loses turn
      const penalty = this.drawCardsFromPile(4);
      challenger.hand.push(...penalty);
      challenger.cardCount = challenger.hand.length;

      this.addLog('challenge', `${challenger.name} accepted the Wild Draw Four (+4 cards and skipped).`);
      this.advanceTurn(2);
    }

    this.activeChallenge = null;
    return { success: true };
  }

  public callUno(playerId: string): { success: boolean; message?: string } {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return { success: false, message: 'Player not found' };

    // Player can call UNO if they have 2 cards (anticipating their move) or 1 card
    if (player.hand.length > 2) {
      return { success: false, message: 'You can only call UNO when you have 1 or 2 cards remaining' };
    }

    player.calledUno = true;
    if (this.unoVulnerablePlayerId === player.id) {
      this.unoVulnerablePlayerId = null;
    }

    this.addLog('uno', `${player.name} SHOUTED "UNO!" 🔥`, { playerId: player.id, playerName: player.name });
    return { success: true };
  }

  public catchUno(catcherId: string): { success: boolean; message?: string } {
    const catcher = this.players.find((p) => p.id === catcherId);
    if (!catcher) return { success: false, message: 'Player not found' };

    if (!this.unoVulnerablePlayerId) {
      return { success: false, message: 'No one forgot to call UNO' };
    }

    const offender = this.players.find((p) => p.id === this.unoVulnerablePlayerId);
    if (!offender || offender.calledUno || offender.hand.length !== 1) {
      this.unoVulnerablePlayerId = null;
      return { success: false, message: 'Player is not vulnerable' };
    }

    // Offender draws 2 penalty cards
    const penalty = this.drawCardsFromPile(2);
    offender.hand.push(...penalty);
    offender.cardCount = offender.hand.length;
    offender.calledUno = false;
    this.unoVulnerablePlayerId = null;

    this.addLog('catch_uno', `🚨 ${catcher.name} CAUGHT ${offender.name} for not calling UNO! ${offender.name} draws 2 penalty cards!`, {
      playerId: catcher.id,
      playerName: catcher.name,
    });

    return { success: true };
  }

  private handleRoundEnd(winner: PlayerPrivateInfo): void {
    this.status = 'round_over';
    winner.roundWins += 1;

    // Calculate score from all opponents
    let roundPoints = 0;
    const breakdown: { opponentName: string; points: number }[] = [];

    for (const opponent of this.players) {
      if (opponent.id !== winner.id) {
        const pts = calculateHandScore(opponent.hand);
        roundPoints += pts;
        breakdown.push({
          opponentName: opponent.name,
          points: pts,
        });
      }
    }

    winner.score = roundPoints;
    winner.totalScore += roundPoints;

    this.roundWinner = {
      playerId: winner.id,
      playerName: winner.name,
      pointsEarned: roundPoints,
      breakdown,
    };

    this.addLog('round_win', `🏆 ${winner.name} WON THE ROUND! Earned +${roundPoints} points!`, {
      playerId: winner.id,
      playerName: winner.name,
    });

    // Check match victory condition:
    // If single round mode, first round win wins the match.
    // If targetScore mode, whoever reaches targetScore (standard 500) wins!
    if (this.settings.isSingleRound || winner.totalScore >= this.settings.targetScore) {
      this.status = 'game_over';
      this.gameWinner = {
        playerId: winner.id,
        playerName: winner.name,
        finalScore: winner.totalScore,
      };
      this.addLog('round_win', `👑 ${winner.name} HAS WON THE MATCH with ${winner.totalScore} total points!`, {
        playerId: winner.id,
        playerName: winner.name,
      });
    }
  }

  private getNextPlayer(steps: number = 1): PlayerPrivateInfo {
    const n = this.players.length;
    let index = (this.currentTurnIndex + steps * this.turnDirection) % n;
    if (index < 0) index += n;
    return this.players[index];
  }

  /**
   * Generates sanitized client game state tailored for a specific player:
   * Keeps opponents' cards private, sends full hand only to the requesting player!
   */
  public getClientState(playerId: string): ClientGameState {
    const player = this.players.find((p) => p.id === playerId);
    const activePlayer = this.players[this.currentTurnIndex] || null;

    const publicPlayers: PlayerPublicInfo[] = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      cardCount: p.hand.length,
      isReady: p.isReady,
      isConnected: p.isConnected,
      calledUno: p.calledUno,
      score: p.score,
      totalScore: p.totalScore,
      roundWins: p.roundWins,
    }));

    const topDiscard = this.discardPile.length > 0 ? this.discardPile[this.discardPile.length - 1] : null;

    let canCatchUnoTarget: { targetPlayerId: string; targetPlayerName: string } | null = null;
    if (this.unoVulnerablePlayerId && this.unoVulnerablePlayerId !== playerId) {
      const vuln = this.players.find((p) => p.id === this.unoVulnerablePlayerId);
      if (vuln) {
        canCatchUnoTarget = { targetPlayerId: vuln.id, targetPlayerName: vuln.name };
      }
    }

    const connectedCount = this.players.filter((p) => p.isConnected).length;
    const onlyOnePlayerLeft = this.status === 'in_progress' && connectedCount <= 1 && this.players.length > 1;

    return {
      roomCode: this.roomCode,
      hostId: this.hostId,
      status: this.status,
      settings: this.settings,
      players: publicPlayers,
      myPlayerId: playerId,
      myHand: player ? [...player.hand] : [],
      currentTurnIndex: this.currentTurnIndex,
      activePlayerId: activePlayer ? activePlayer.id : '',
      turnDirection: this.turnDirection,
      topDiscard,
      activeColor: this.activeColor,
      drawPileCount: this.drawPile.length,
      discardPileCount: this.discardPile.length,
      activeChallenge: this.activeChallenge,
      pendingDrawnCard: this.pendingDrawnCard && this.pendingDrawnCard.playerId === playerId ? this.pendingDrawnCard.card : null,
      lastPlayTimestamp: this.lastPlayTimestamp,
      canCallUno: !!(player && player.hand.length <= 2 && !player.calledUno),
      canCatchUnoTarget,
      roundWinner: this.roundWinner,
      gameWinner: this.gameWinner,
      abortInfo: this.abortInfo,
      disconnectedPlayer: this.disconnectedPlayer,
      isPaused: this.isPaused,
      pausedBy: this.pausedBy,
      turnStartedAt: this.turnStartedAt,
      turnTimeoutMs: this.turnTimeoutMs,
      onlyOnePlayerLeft,
      logs: [...this.logs],
    };
  }
}
