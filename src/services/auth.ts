import { UserAccountProfile } from '../types/uno.ts';
import { socketClient } from './socket.ts';

const TOKEN_KEY = 'uno_auth_token';
const USER_KEY = 'uno_auth_user';

type AuthListener = (user: UserAccountProfile | null) => void;

class AuthService {
  private currentUser: UserAccountProfile | null = null;
  private token: string | null = null;
  private listeners: Set<AuthListener> = new Set();

  constructor() {
    this.token = localStorage.getItem(TOKEN_KEY);
    const stored = localStorage.getItem(USER_KEY);
    if (stored) {
      try {
        this.currentUser = JSON.parse(stored);
      } catch {
        this.currentUser = null;
      }
    }

    // Auto verify/fetch fresh profile on load if token exists
    if (this.token) {
      this.fetchCurrentUser().catch(() => {});
    }

    // Listen to live socket score updates during/after games
    socketClient.socket.on('auth:user-update', (data: { user: UserAccountProfile }) => {
      if (data?.user) {
        this.setUser(data.user, this.token);
      }
    });
  }

  public subscribe(callback: AuthListener): () => void {
    this.listeners.add(callback);
    callback(this.currentUser);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.currentUser);
    }
  }

  public getUser(): UserAccountProfile | null {
    return this.currentUser;
  }

  public getToken(): string | null {
    return this.token;
  }

  public isLoggedIn(): boolean {
    return !!this.currentUser && !!this.token;
  }

  private setUser(user: UserAccountProfile | null, token: string | null) {
    this.currentUser = user;
    this.token = token;

    if (user && token) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem('uno_player_name', user.displayName || user.username);
      localStorage.setItem('uno_player_avatar', user.avatar || 'fox');
    } else {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(TOKEN_KEY);
    }

    this.notify();
  }

  public async register(
    username: string,
    password: string,
    avatar: string = 'fox'
  ): Promise<{ success: boolean; user?: UserAccountProfile; message?: string }> {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, avatar }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, message: data.error || 'Registration failed.' };
      }

      this.setUser(data.user, data.token);
      return { success: true, user: data.user };
    } catch {
      return { success: false, message: 'Network error connecting to auth server.' };
    }
  }

  public async login(
    username: string,
    password: string
  ): Promise<{ success: boolean; user?: UserAccountProfile; message?: string }> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, message: data.error || 'Invalid credentials.' };
      }

      this.setUser(data.user, data.token);
      return { success: true, user: data.user };
    } catch {
      return { success: false, message: 'Network error connecting to auth server.' };
    }
  }

  public async fetchCurrentUser(): Promise<UserAccountProfile | null> {
    if (!this.token) return null;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          this.setUser(data.user, this.token);
          return data.user;
        }
      } else {
        // Token expired
        this.logout();
      }
    } catch {
      // ignore offline
    }
    return null;
  }

  public async updateProfile(data: { avatar?: string; displayName?: string }): Promise<boolean> {
    if (!this.token) return false;
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.user) {
          this.setUser(result.user, this.token);
          return true;
        }
      }
    } catch {
      // ignore
    }
    return false;
  }

  public logout(): void {
    this.setUser(null, null);
  }

  public async getLeaderboard(): Promise<UserAccountProfile[]> {
    try {
      const res = await fetch('/api/leaderboard');
      if (res.ok) {
        const data = await res.json();
        return data.leaderboard || [];
      }
    } catch {
      // ignore
    }
    return [];
  }
}

export const authService = new AuthService();
