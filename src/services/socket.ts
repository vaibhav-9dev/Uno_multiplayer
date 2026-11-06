import { io, Socket } from 'socket.io-client';
import { ActiveColor } from '../types/uno.ts';

// Get or create unique persistent session token per browser tab
export function getSessionToken(): string {
  if (typeof sessionStorage === 'undefined') return 'usr_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  let token = sessionStorage.getItem('uno_session_token');
  if (!token) {
    // Generate fresh session token for this browser tab
    token = 'usr_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    sessionStorage.setItem('uno_session_token', token);
  }
  return token;
}

// Track active room for current tab
export function getActiveRoom(): string | null {
  return typeof sessionStorage === 'undefined'
    ? null
    : sessionStorage.getItem('uno_active_room');
}

export function setActiveRoom(roomCode: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  if (roomCode) {
    sessionStorage.setItem('uno_active_room', roomCode);
  } else {
    sessionStorage.removeItem('uno_active_room');
  }
}

// Determine backend URL (supports Vercel frontend pointing to persistent server)
export const BACKEND_URL =
  (import.meta as any).env?.VITE_BACKEND_URL ||
  (typeof window !== 'undefined' ? window.location.origin : '');

// Single instance socket
let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(BACKEND_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });
  }
  return socketInstance;
}

export const socketClient = {
  get socket() {
    return getSocket();
  },

  createRoom: (name: string, avatar: string, settings?: any): Promise<{ success: boolean; roomCode?: string; message?: string }> => {
    return new Promise((resolve) => {
      getSocket().emit(
        'room:create',
        {
          name,
          avatar,
          sessionToken: getSessionToken(),
          settings,
        },
        (res: any) => {
          if (res.success && res.roomCode) {
            setActiveRoom(res.roomCode);
          }
          resolve(res);
        }
      );
    });
  },

  joinRoom: (roomCode: string, name: string, avatar: string): Promise<{ success: boolean; roomCode?: string; message?: string }> => {
    return new Promise((resolve) => {
      getSocket().emit(
        'room:join',
        {
          roomCode,
          name,
          avatar,
          sessionToken: getSessionToken(),
        },
        (res: any) => {
          if (res.success && res.roomCode) {
            setActiveRoom(res.roomCode);
          }
          resolve(res);
        }
      );
    });