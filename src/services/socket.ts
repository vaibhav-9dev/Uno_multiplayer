import { io, Socket } from 'socket.io-client';
import { ActiveColor } from '../types/uno.ts';

// Get or create a persistent session token for this browser tab.
export function getSessionToken(): string {
  let token = sessionStorage.getItem('uno_session_token');

  if (!token) {
    token =
      'usr_' +
      Math.random().toString(36).substring(2, 10) +
      Date.now().toString(36);

    sessionStorage.setItem('uno_session_token', token);
  }

  return token;
}

// Track the active room for this tab.
export function getActiveRoom(): string | null {
  return sessionStorage.getItem('uno_active_room');
}

export function setActiveRoom(roomCode: string | null): void {
  if (roomCode) {
    sessionStorage.setItem('uno_active_room', roomCode);
  } else {
    sessionStorage.removeItem('uno_active_room');
  }
}

// Determine backend URL.
export const BACKEND_URL =
  (import.meta as any).env?.VITE_BACKEND_URL ||
  (typeof window !== 'undefined' ? window.location.origin : '');

// Single Socket.IO instance.
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
      transports: ['websocket', 'polling'],
    });
  }

  return socketInstance;
}

export const socketClient = {
  get socket() {
    return getSocket();
  },

  createRoom: (
    name: string,
    avatar: string,
    settings?: any,
    accountUsername?: string
  ): Promise<{
    success: boolean;
    roomCode?: string;
    message?: string;
  }> => {
    return new Promise((resolve) => {
      getSocket().emit(
        'room:create',
        {
          name,
          avatar,
          sessionToken: getSessionToken(),
          settings,
          accountUsername,
        },
        (response: any) => {
          if (response?.success && response.roomCode) {
            setActiveRoom(response.roomCode);
          }

          resolve(response);
        }
      );
    });
  },

  joinRoom: (
    roomCode: string,
    name: string,
    avatar: string,
    accountUsername?: string
  ): Promise<{
    success: boolean;
    roomCode?: string;
    message?: string;
  }> => {
    return new Promise((resolve) => {
      getSocket().emit(
        'room:join',
        {
          roomCode,
          name,
          avatar,
          sessionToken: getSessionToken(),
          accountUsername,
        },
        (response: any) => {
          if (response?.success && response.roomCode) {
            setActiveRoom(response.roomCode);
          }

          resolve(response);
        }
      );
    });
  },

  quickMatch: (
    name: string,
    avatar: string,
    accountUsername?: string
  ): Promise<{
    success: boolean;
    roomCode?: string;
    isNew?: boolean;
    message?: string;
  }> => {
    return new Promise((resolve) => {
      getSocket().emit(
        'room:quick-match',
        {
          name,
          avatar,
          sessionToken: getSessionToken(),
          accountUsername,
        },
        (response: any) => {
          if (response?.success && response.roomCode) {
            setActiveRoom(response.roomCode);
          }

          resolve(response);
        }
      );
    });
  },

  reconnect: (
    roomCode?: string,
    playerName?: string,
    avatar?: string,
    accountUsername?: string
  ): Promise<{
    success: boolean;
    roomCode?: string;
  }> => {
    return new Promise((resolve) => {
      getSocket().emit(
        'room:reconnect',
        {
          sessionToken: getSessionToken(),
          roomCode: roomCode || getActiveRoom() || undefined,
          playerName,
          avatar,
          accountUsername,
        },
        (response: any) => {
          if (!response?.success) {
            setActiveRoom(null);
          }

          resolve(response);
        }
      );
    });
  },

  setReady: (isReady: boolean) => {
    getSocket().emit('room:set-ready', { isReady });
  },

  startGame: () => {
    getSocket().emit('game:start');
  },

  nextRound: () => {
    getSocket().emit('game:next-round');
  },

  playCard: (
    cardId: string,
    chosenColor?: ActiveColor
  ): Promise<{
    success: boolean;
    message?: string;
  }> => {
    return new Promise((resolve) => {
      getSocket().emit(
        'game:play-card',
        { cardId, chosenColor },
        (response: any) => resolve(response)
      );
    });
  },

  drawCard: (): Promise<{
    success: boolean;
    drawnCard?: any;
    canPlay?: boolean;
    message?: string;
  }> => {
    return new Promise((resolve) => {
      getSocket().emit(
        'game:draw-card',
        (response: any) => resolve(response)
      );
    });
  },

  passTurn: (): Promise<{
    success: boolean;
    message?: string;
  }> => {
    return new Promise((resolve) => {
      getSocket().emit(
        'game:pass-turn',
        (response: any) => resolve(response)
      );
    });
  },

  resolveChallenge: (
    didChallenge: boolean
  ): Promise<{
    success: boolean;
    message?: string;
  }> => {
    return new Promise((resolve) => {
      getSocket().emit(
        'game:resolve-challenge',
        { didChallenge },
        (response: any) => resolve(response)
      );
    });
  },

  callUno: (): Promise<{
    success: boolean;
    message?: string;
  }> => {
    return new Promise((resolve) => {
      getSocket().emit(
        'game:call-uno',
        (response: any) => resolve(response)
      );
    });
  },

  catchUno: (): Promise<{
    success: boolean;
    message?: string;
  }> => {
    return new Promise((resolve) => {
      getSocket().emit(
        'game:catch-uno',
        (response: any) => resolve(response)
      );
    });
  },

  sendChat: (message?: string, emote?: string) => {
    getSocket().emit('game:send-chat', { message, emote });
  },

  abortMatch: (reason?: string) => {
    getSocket().emit('game:abort', { reason });
  },

  pauseMatch: () => {
    getSocket().emit('game:pause');
  },

  resumeMatch: () => {
    getSocket().emit('game:resume');
  },

  skipTurn: () => {
    getSocket().emit('game:skip-turn');
  },

  leaveRoom: () => {
    setActiveRoom(null);
    getSocket().emit('room:leave');
  },
};