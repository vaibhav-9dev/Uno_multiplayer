import { io, Socket } from 'socket.io-client';
import { ActiveColor } from '../types/uno.ts';

// Get or create unique persistent session token
export function getSessionToken(): string {
  let token = localStorage.getItem('uno_session_token');
  if (!token) {
    token = 'usr_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem('uno_session_token', token);
  }
  return token;
}

// Single instance socket
let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(window.location.origin, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
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
        (res: any) => resolve(res)
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
        (res: any) => resolve(res)
      );
    });
  },

  quickMatch: (name: string, avatar: string): Promise<{ success: boolean; roomCode?: string; isNew?: boolean; message?: string }> => {
    return new Promise((resolve) => {
      getSocket().emit(
        'room:quick-match',
        {
          name,
          avatar,
          sessionToken: getSessionToken(),
        },
        (res: any) => resolve(res)
      );
    });
  },

  reconnect: (playerName?: string, avatar?: string): Promise<{ success: boolean; roomCode?: string }> => {
    return new Promise((resolve) => {
      getSocket().emit(
        'room:reconnect',
        {
          sessionToken: getSessionToken(),
          playerName,
          avatar,
        },
        (res: any) => resolve(res)
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

  playCard: (cardId: string, chosenColor?: ActiveColor): Promise<{ success: boolean; message?: string }> => {
    return new Promise((resolve) => {
      getSocket().emit('game:play-card', { cardId, chosenColor }, (res: any) => resolve(res));
    });
  },

  drawCard: (): Promise<{ success: boolean; drawnCard?: any; canPlay?: boolean; message?: string }> => {
    return new Promise((resolve) => {
      getSocket().emit('game:draw-card', (res: any) => resolve(res));
    });
  },

  passTurn: (): Promise<{ success: boolean; message?: string }> => {
    return new Promise((resolve) => {
      getSocket().emit('game:pass-turn', (res: any) => resolve(res));
    });
  },

  resolveChallenge: (didChallenge: boolean): Promise<{ success: boolean; message?: string }> => {
    return new Promise((resolve) => {
      getSocket().emit('game:resolve-challenge', { didChallenge }, (res: any) => resolve(res));
    });
  },

  callUno: (): Promise<{ success: boolean; message?: string }> => {
    return new Promise((resolve) => {
      getSocket().emit('game:call-uno', (res: any) => resolve(res));
    });
  },

  catchUno: (): Promise<{ success: boolean; message?: string }> => {
    return new Promise((resolve) => {
      getSocket().emit('game:catch-uno', (res: any) => resolve(res));
    });
  },

  sendChat: (message?: string, emote?: string) => {
    getSocket().emit('game:send-chat', { message, emote });
  },

  leaveRoom: () => {
    getSocket().emit('room:leave');
  },
};
