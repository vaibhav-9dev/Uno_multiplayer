import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'accounts.json');

export interface UserAccount {
  username: string;
  displayName: string;
  passwordHash: string;
  salt: string;
  avatar: string;
  totalScore: number;
  matchesPlayed: number;
  matchesWon: number;
  roundsWon: number;
  unoShouts: number;
  createdAt: number;
  lastActiveAt: number;
}

export type SafeUser = Omit<UserAccount, 'passwordHash' | 'salt'>;

class AccountStore {
  private accounts: Map<string, UserAccount> = new Map();
  // Map token -> username
  private authTokens: Map<string, { username: string; expiresAt: number }> = new Map();

  constructor() {
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const list: UserAccount[] = JSON.parse(raw);
        for (const acc of list) {
          this.accounts.set(acc.username.toLowerCase(), acc);
        }
      } else {
        // Seed some initial demo players so leaderboard is engaging immediately
        const seedUsers: SafeUser[] = [
          {
            username: 'ace_player',
            displayName: 'AcePlayer',
            avatar: 'dragon',
            totalScore: 1420,
            matchesPlayed: 18,
            matchesWon: 9,
            roundsWon: 24,
            unoShouts: 19,
            createdAt: Date.now() - 86400000 * 7,
            lastActiveAt: Date.now() - 3600000,
          },
          {
            username: 'wild_card_99',
            displayName: 'WildCard99',
            avatar: 'tiger',
            totalScore: 980,
            matchesPlayed: 14,
            matchesWon: 6,
            roundsWon: 16,
            unoShouts: 12,
            createdAt: Date.now() - 86400000 * 5,
            lastActiveAt: Date.now() - 7200000,
          },
          {
            username: 'uno_master',
            displayName: 'UnoMaster',
            avatar: 'lion',
            totalScore: 650,
            matchesPlayed: 10,
            matchesWon: 4,
            roundsWon: 11,
            unoShouts: 8,
            createdAt: Date.now() - 86400000 * 3,
            lastActiveAt: Date.now() - 14400000,
          },
        ];

        for (const s of seedUsers) {
          const salt = crypto.randomBytes(16).toString('hex');
          const hash = this.hashPassword('uno123', salt);
          this.accounts.set(s.username.toLowerCase(), {
            ...s,
            salt,
            passwordHash: hash,
          });
        }
        this.save();
      }
    } catch (err) {
      console.error('Failed to initialize account store:', err);
    }
  }

  private save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = Array.from(this.accounts.values());
      const tempPath = `${DATA_FILE}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DATA_FILE);
    } catch (err) {
      console.error('Failed to persist accounts:', err);
    }
  }

  private hashPassword(password: string, salt: string): string {
    return crypto.scryptSync(password, salt, 32).toString('hex');
  }

  public register(
    usernameInput: string,
    password: string,
    avatar: string = 'fox'
  ): { success: boolean; token?: string; user?: SafeUser; message?: string } {
    const rawName = usernameInput.trim();
    if (!rawName || rawName.length < 2 || rawName.length > 20) {
      return { success: false, message: 'Username must be between 2 and 20 characters.' };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(rawName)) {
      return { success: false, message: 'Username can only contain letters, numbers, hyphens, and underscores.' };
    }
    if (!password || password.length < 4) {
      return { success: false, message: 'Password must be at least 4 characters long.' };
    }

    const key = rawName.toLowerCase();
    if (this.accounts.has(key)) {
      return { success: false, message: 'This username is already taken. Please choose another.' };
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = this.hashPassword(password, salt);

    const now = Date.now();
    const newAccount: UserAccount = {
      username: key,
      displayName: rawName,
      passwordHash: hash,
      salt,
      avatar: avatar || 'fox',
      totalScore: 0,
      matchesPlayed: 0,
      matchesWon: 0,
      roundsWon: 0,
      unoShouts: 0,
      createdAt: now,
      lastActiveAt: now,
    };

    this.accounts.set(key, newAccount);
    this.save();

    const token = crypto.randomBytes(24).toString('hex');
    this.authTokens.set(token, {
      username: key,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30, // 30 days
    });

    return {
      success: true,
      token,
      user: this.toSafeUser(newAccount),
    };
  }

  public login(
    usernameInput: string,
    password: string
  ): { success: boolean; token?: string; user?: SafeUser; message?: string } {
    const key = usernameInput.trim().toLowerCase();
    const account = this.accounts.get(key);

    if (!account) {
      return { success: false, message: 'Invalid username or password.' };
    }

    const hash = this.hashPassword(password, account.salt);
    if (hash !== account.passwordHash) {
      return { success: false, message: 'Invalid username or password.' };
    }

    account.lastActiveAt = Date.now();
    this.save();

    const token = crypto.randomBytes(24).toString('hex');
    this.authTokens.set(token, {
      username: key,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30,
    });

    return {
      success: true,
      token,
      user: this.toSafeUser(account),
    };
  }

  public getUserByToken(token: string): SafeUser | null {
    if (!token) return null;
    const session = this.authTokens.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.authTokens.delete(token);
      return null;
    }
    const acc = this.accounts.get(session.username);
    return acc ? this.toSafeUser(acc) : null;
  }

  public getUserByUsername(username: string): SafeUser | null {
    const acc = this.accounts.get(username.trim().toLowerCase());
    return acc ? this.toSafeUser(acc) : null;
  }

  public updateProfile(
    username: string,
    data: { avatar?: string; displayName?: string }
  ): SafeUser | null {
    const key = username.toLowerCase();
    const acc = this.accounts.get(key);
    if (!acc) return null;

    if (data.avatar) acc.avatar = data.avatar;
    if (data.displayName && data.displayName.trim().length >= 2) {
      acc.displayName = data.displayName.trim();
    }
    acc.lastActiveAt = Date.now();
    this.save();
    return this.toSafeUser(acc);
  }

  /**
   * Adds round victory score to user's persistent career score
   */
  public addRoundScore(username: string, points: number): SafeUser | null {
    if (!username) return null;
    const key = username.toLowerCase();
    const acc = this.accounts.get(key);
    if (!acc) return null;

    acc.totalScore += Math.max(0, points);
    acc.roundsWon += 1;
    acc.lastActiveAt = Date.now();
    this.save();
    return this.toSafeUser(acc);
  }

  /**
   * Records match outcome (cumulative games played, career wins, and final victory points)
   */
  public recordMatchOutcome(
    winnerUsername: string | undefined,
    allUsernames: string[],
    matchBonusPoints: number = 0
  ) {
    let changed = false;

    for (const name of allUsernames) {
      if (!name) continue;
      const key = name.toLowerCase();
      const acc = this.accounts.get(key);
      if (acc) {
        acc.matchesPlayed += 1;
        acc.lastActiveAt = Date.now();
        changed = true;
      }
    }

    if (winnerUsername) {
      const winKey = winnerUsername.toLowerCase();
      const winnerAcc = this.accounts.get(winKey);
      if (winnerAcc) {
        winnerAcc.matchesWon += 1;
        if (matchBonusPoints > 0) {
          winnerAcc.totalScore += matchBonusPoints;
        }
        winnerAcc.lastActiveAt = Date.now();
        changed = true;
      }
    }

    if (changed) {
      this.save();
    }
  }

  public recordUnoShout(username: string) {
    if (!username) return;
    const key = username.toLowerCase();
    const acc = this.accounts.get(key);
    if (acc) {
      acc.unoShouts += 1;
      this.save();
    }
  }

  public getLeaderboard(limit = 25): SafeUser[] {
    const list = Array.from(this.accounts.values()).map((a) => this.toSafeUser(a));
    // Sort descending by totalScore, then matchesWon
    list.sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      return b.matchesWon - a.matchesWon;
    });
    return list.slice(0, limit);
  }

  private toSafeUser(acc: UserAccount): SafeUser {
    return {
      username: acc.username,
      displayName: acc.displayName,
      avatar: acc.avatar,
      totalScore: acc.totalScore,
      matchesPlayed: acc.matchesPlayed,
      matchesWon: acc.matchesWon,
      roundsWon: acc.roundsWon,
      unoShouts: acc.unoShouts,
      createdAt: acc.createdAt,
      lastActiveAt: acc.lastActiveAt,
    };
  }
}

export const accountStore = new AccountStore();
