import { UnoRoom } from './unoRoom.ts';
import { RoomSettings, PublicRoomSummary } from '../../src/types/uno.ts';

export class RoomManager {
  private rooms: Map<string, UnoRoom> = new Map();
  // Map sessionToken -> roomCode for quick reconnections
  private sessionToRoom: Map<string, string> = new Map();

  constructor() {
    // Periodic cleanup of abandoned rooms every 30 minutes
    setInterval(() => {
      this.cleanupAbandonedRooms();
    }, 1000 * 60 * 30);
  }

  public generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous characters like 0/O, 1/I
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(code));
    return code;
  }

  public createRoom(
    hostId: string,
    sessionToken: string,
    hostName: string,
    hostAvatar: string,
    settings?: Partial<RoomSettings>,
    accountUsername?: string
  ): UnoRoom {
    const code = this.generateRoomCode();
    const room = new UnoRoom(code, hostId, settings);
    room.addPlayer(hostId, sessionToken, hostName, hostAvatar, accountUsername);
    this.rooms.set(code, room);
    this.sessionToRoom.set(sessionToken, code);
    return room;
  }

  public getRoom(roomCode: string): UnoRoom | undefined {
    return this.rooms.get(roomCode.toUpperCase().trim());
  }

  public getAllRooms(): UnoRoom[] {
    return Array.from(this.rooms.values());
  }

  public getRoomBySession(sessionToken: string): UnoRoom | undefined {
    const code = this.sessionToRoom.get(sessionToken);
    if (!code) return undefined;
    const room = this.rooms.get(code);
    if (!room || room.status === 'game_over' || room.status === 'aborted') {
      this.sessionToRoom.delete(sessionToken);
      return undefined;
    }
    return room;
  }

  public removeSession(sessionToken: string): void {
    this.sessionToRoom.delete(sessionToken);
  }

  public joinRoom(
    roomCode: string,
    playerId: string,
    sessionToken: string,
    name: string,
    avatar: string,
    accountUsername?: string
  ): { success: boolean; room?: UnoRoom; message?: string } {
    const code = roomCode.toUpperCase().trim();
    const room = this.rooms.get(code);

    if (!room) {
      return { success: false, message: 'Room not found. Check your room code.' };
    }

    const added = room.addPlayer(playerId, sessionToken, name, avatar, accountUsername);
    if (!added) {
      return {
        success: false,
        message: room.status !== 'waiting'
          ? 'Game is already in progress in this room.'
          : 'Room is full (max players reached).',
      };
    }

    this.sessionToRoom.set(sessionToken, code);
    return { success: true, room };
  }

  public findQuickMatch(
    playerId: string,
    sessionToken: string,
    name: string,
    avatar: string,
    accountUsername?: string
  ): { room: UnoRoom; isNew: boolean } {
    // Check if player already in an active room
    const existing = this.getRoomBySession(sessionToken);
    if (existing && existing.players.some((p) => p.sessionToken === sessionToken)) {
      existing.addPlayer(playerId, sessionToken, name, avatar, accountUsername);
      return { room: existing, isNew: false };
    }

    // Look for public waiting room with available seats
    for (const room of this.rooms.values()) {
      if (!room.settings.isPrivate && room.status === 'waiting' && room.players.length < room.settings.maxPlayers) {
        room.addPlayer(playerId, sessionToken, name, avatar, accountUsername);
        this.sessionToRoom.set(sessionToken, room.roomCode);
        return { room, isNew: false };
      }
    }

    // Create a new public room
    const newRoom = this.createRoom(
      playerId,
      sessionToken,
      name,
      avatar,
      {
        isPrivate: false,
        maxPlayers: 4,
        targetScore: 500,
        isSingleRound: false,
      },
      accountUsername
    );
    return { room: newRoom, isNew: true };
  }

  public getPublicRooms(): PublicRoomSummary[] {
    const list: PublicRoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (!room.settings.isPrivate && room.status === 'waiting' && room.players.length < room.settings.maxPlayers) {
        const host = room.players.find((p) => p.id === room.hostId) || room.players[0];
        list.push({
          roomCode: room.roomCode,
          hostName: host ? host.name : 'Unknown',
          playerCount: room.players.length,
          maxPlayers: room.settings.maxPlayers,
          status: room.status,
          targetScore: room.settings.targetScore,
          isSingleRound: room.settings.isSingleRound,
        });
      }
    }
    return list;
  }

  public deleteRoom(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (room) {
      for (const p of room.players) {
        this.sessionToRoom.delete(p.sessionToken);
      }
      this.rooms.delete(roomCode);
    }
  }

  private cleanupAbandonedRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms.entries()) {
      const allDisconnected = room.players.every((p) => !p.isConnected);
      const isStale = now - room.lastPlayTimestamp > 1000 * 60 * 60 * 2; // 2 hours
      if ((allDisconnected && now - room.createdAt > 1000 * 60 * 30) || isStale) {
        this.deleteRoom(code);
      }
    }
  }
}

export const roomManager = new RoomManager();
