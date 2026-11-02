import { Card, CardColor, CardValue, ActiveColor } from '../../src/types/uno.ts';

/**
 * Creates the official classic 108-card UNO deck.
 */
export function createUnoDeck(): Card[] {
  const deck: Card[] = [];
  const colors: ActiveColor[] = ['red', 'blue', 'green', 'yellow'];

  colors.forEach((color) => {
    // Exactly one '0' card per color
    deck.push({
      id: `${color}_0_0`,
      color,
      value: '0',
      score: 0,
    });

    // Two of each number 1 to 9 per color
    for (let num = 1; num <= 9; num++) {
      const val = num.toString() as CardValue;
      deck.push({
        id: `${color}_${val}_1`,
        color,
        value: val,
        score: num,
      });
      deck.push({
        id: `${color}_${val}_2`,
        color,
        value: val,
        score: num,
      });
    }

    // Two Skip cards per color
    deck.push({ id: `${color}_skip_1`, color, value: 'skip', score: 20 });
    deck.push({ id: `${color}_skip_2`, color, value: 'skip', score: 20 });

    // Two Reverse cards per color
    deck.push({ id: `${color}_reverse_1`, color, value: 'reverse', score: 20 });
    deck.push({ id: `${color}_reverse_2`, color, value: 'reverse', score: 20 });

    // Two Draw Two cards per color
    deck.push({ id: `${color}_draw2_1`, color, value: 'draw2', score: 20 });
    deck.push({ id: `${color}_draw2_2`, color, value: 'draw2', score: 20 });
  });

  // Four Wild cards
  for (let i = 1; i <= 4; i++) {
    deck.push({
      id: `wild_${i}`,
      color: 'wild',
      value: 'wild',
      score: 50,
    });
  }

  // Four Wild Draw Four cards
  for (let i = 1; i <= 4; i++) {
    deck.push({
      id: `wild4_${i}`,
      color: 'wild',
      value: 'wild4',
      score: 50,
    });
  }

  return deck;
}

/**
 * Fisher-Yates cryptographically-clean shuffle
 */
export function shuffleCards(cards: Card[]): Card[] {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Checks if a card is legally playable onto topDiscard with the given activeColor.
 * Official UNO rules:
 * - A card matches if it has the active color
 * - Or if it has the same number/action value as the top discard
 * - A standard Wild card can be played anytime on a player's turn
 * - A Wild Draw Four card can technically be physically played on a turn,
 *   though official rules make it challengeable if the player held a card matching activeColor.
 */
export function isCardPlayable(card: Card, topDiscard: Card, activeColor: ActiveColor): boolean {
  if (card.color === 'wild') {
    return true; // Wild and Wild Draw Four can always be placed down
  }

  // Matches active color
  if (card.color === activeColor) {
    return true;
  }

  // Matches value (e.g. Red 7 on Blue 7, or Yellow Skip on Blue Skip)
  if (card.value === topDiscard.value) {
    return true;
  }

  return false;
}

/**
 * Checks if the player holds any card in their hand matching the specified color (excluding wilds).
 * Used for the official Wild Draw Four challenge!
 */
export function hasColorMatch(hand: Card[], color: ActiveColor): boolean {
  return hand.some((c) => c.color === color);
}

/**
 * Calculates official score total of a hand of cards
 */
export function calculateHandScore(hand: Card[]): number {
  return hand.reduce((total, card) => total + card.score, 0);
}
