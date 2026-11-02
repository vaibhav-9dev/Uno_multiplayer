import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { roomManager } from './server/game/roomManager.ts';
import { UnoRoom } from './server/game/unoRoom.ts';
import { ActiveColor } from './src/types/uno.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(express.json());

// Broadcast personalized client states to all players in a room
function broadcastRoomState(room: UnoRoom) {
  for (const player of room.players) {
    const socket = io.sockets.sockets.get(player.id);
    if (socket) {
      socket.emit('game:state', room.getClientState(player.id));
    }
  }
}

// REST API routes
app.get('/api/public-rooms', (_req, res) => {
  res.json({ rooms: roomManager.getPublicRooms() });
});

app.get('/api/room/:code', (req, res) => {
  const room = roomManager.getRoom(req.params.code);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  return res.json({
    roomCode: room.roomCode,
    status: room.status,
    playerCount: room.players.length,
    maxPlayers: room.settings.maxPlayers,
    isPrivate: room.settings.isPrivate,
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Socket.io real-time connection handling
io.on('connection', (socket: Socket) => {
  let currentRoomCode: string | null = null;
  let sessionToken: string | null = null;

  // Reconnection or initial session check
  socket.on('room:reconnect', (data: { sessionToken: string; playerName?: string; avatar?: string }, callback) => {
    sessionToken = data.sessionToken;
    const room = roomManager.getRoomBySession(sessionToken);
    if (!room) {
      return callback?.({ success: false, message: 'No active session found' });
    }

    const player = room.players.find((p) => p.sessionToken === sessionToken);
    if (!player) {
      return callback?.({ success: false, message: 'Player session expired' });
    }

    // Rebind player id to new socket id
    player.id = socket.id;
    player.isConnected = true;
    if (data.playerName) player.name = data.playerName;
    if (data.avatar) player.avatar = data.avatar;

    currentRoomCode = room.roomCode;
    socket.join(room.roomCode);

    room.addLog('system', `${player.name} reconnected to seat.`);
    broadcastRoomState(room);

    callback?.({ success: true, roomCode: room.roomCode });
  });

  // Create room
  socket.on('room:create', (data: { name: string; avatar: string; sessionToken: string; settings?: any }, callback) => {
    sessionToken = data.sessionToken;
    const room = roomManager.createRoom(
      socket.id,
      sessionToken,
      data.name || 'Host',
      data.avatar || 'fox',
      data.settings
    );

    currentRoomCode = room.roomCode;
    socket.join(room.roomCode);

    callback?.({ success: true, roomCode: room.roomCode });
    socket.emit('game:state', room.getClientState(socket.id));
  });

  // Join room
  socket.on('room:join', (data: { roomCode: string; name: string; avatar: string; sessionToken: string }, callback) => {
    sessionToken = data.sessionToken;
    const res = roomManager.joinRoom(data.roomCode, socket.id, sessionToken, data.name || 'Player', data.avatar || 'bear');
    if (!res.success || !res.room) {
      return callback?.({ success: false, message: res.message });
    }

    currentRoomCode = res.room.roomCode;
    socket.join(res.room.roomCode);

    callback?.({ success: true, roomCode: res.room.roomCode });
    broadcastRoomState(res.room);
  });

  // Quick match
  socket.on('room:quick-match', (data: { name: string; avatar: string; sessionToken: string }, callback) => {
    sessionToken = data.sessionToken;
    const { room, isNew } = roomManager.findQuickMatch(socket.id, sessionToken, data.name || 'Player', data.avatar || 'panda');

    currentRoomCode = room.roomCode;
    socket.join(room.roomCode);

    callback?.({ success: true, roomCode: room.roomCode, isNew });
    broadcastRoomState(room);
  });

  // Set ready status
  socket.on('room:set-ready', (data: { isReady: boolean }) => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room) return;

    room.setReady(socket.id, data.isReady);
    broadcastRoomState(room);
  });

  // Start game / Start next round
  socket.on('game:start', () => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || room.hostId !== socket.id) return;

    if (room.players.length < 2) {
      socket.emit('game:error', { message: 'Need at least 2 players to start UNO!' });
      return;
    }

    const started = room.startRound();
    if (started) {
      broadcastRoomState(room);
      io.to(room.roomCode).emit('game:sound', { sound: 'round_start' });
    }
  });

  socket.on('game:next-round', () => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || room.hostId !== socket.id) return;

    const started = room.startRound();
    if (started) {
      broadcastRoomState(room);
      io.to(room.roomCode).emit('game:sound', { sound: 'round_start' });
    }
  });

  // Play card
  socket.on('game:play-card', (data: { cardId: string; chosenColor?: ActiveColor }, callback) => {
    if (!currentRoomCode) return callback?.({ success: false, message: 'No active room' });
    const room = roomManager.getRoom(currentRoomCode);
    if (!room) return callback?.({ success: false, message: 'Room not found' });

    const result = room.playCard(socket.id, data.cardId, data.chosenColor);
    if (!result.success) {
      return callback?.(result);
    }

    callback?.({ success: true });
    broadcastRoomState(room);

    // Play action sound to room
    const topCard = room.discardPile[room.discardPile.length - 1];
    if (room.status === 'round_over' || room.status === 'game_over') {
      io.to(room.roomCode).emit('game:sound', { sound: 'win' });
    } else if (topCard?.value === 'skip') {
      io.to(room.roomCode).emit('game:sound', { sound: 'skip' });
    } else if (topCard?.value === 'reverse') {
      io.to(room.roomCode).emit('game:sound', { sound: 'reverse' });
    } else if (topCard?.value === 'draw2' || topCard?.value === 'wild4') {
      io.to(room.roomCode).emit('game:sound', { sound: 'draw_cards' });
    } else {
      io.to(room.roomCode).emit('game:sound', { sound: 'card_play' });
    }
  });

  // Draw card
  socket.on('game:draw-card', (callback) => {
    if (!currentRoomCode) return callback?.({ success: false, message: 'No active room' });
    const room = roomManager.getRoom(currentRoomCode);
    if (!room) return callback?.({ success: false, message: 'Room not found' });

    const result = room.drawCard(socket.id);
    if (!result.success) {
      return callback?.(result);
    }

    callback?.(result);
    broadcastRoomState(room);
    socket.emit('game:sound', { sound: 'card_draw' });
  });

  // Pass turn after drawing
  socket.on('game:pass-turn', (callback) => {
    if (!currentRoomCode) return callback?.({ success: false, message: 'No active room' });
    const room = roomManager.getRoom(currentRoomCode);
    if (!room) return callback?.({ success: false, message: 'Room not found' });

    const result = room.passTurn(socket.id);
    callback?.(result);
    if (result.success) {
      broadcastRoomState(room);
    }
  });

  // Resolve Wild Draw Four challenge
  socket.on('game:resolve-challenge', (data: { didChallenge: boolean }, callback) => {
    if (!currentRoomCode) return callback?.({ success: false, message: 'No active room' });
    const room = roomManager.getRoom(currentRoomCode);
    if (!room) return callback?.({ success: false, message: 'Room not found' });

    const result = room.resolveChallenge(socket.id, data.didChallenge);
    callback?.(result);
    if (result.success) {
      broadcastRoomState(room);
      io.to(room.roomCode).emit('game:sound', { sound: data.didChallenge ? 'challenge' : 'draw_cards' });
    }
  });

  // Call UNO
  socket.on('game:call-uno', (callback) => {
    if (!currentRoomCode) return callback?.({ success: false, message: 'No active room' });
    const room = roomManager.getRoom(currentRoomCode);
    if (!room) return callback?.({ success: false, message: 'Room not found' });

    const result = room.callUno(socket.id);
    callback?.(result);
    if (result.success) {
      broadcastRoomState(room);
      io.to(room.roomCode).emit('game:sound', { sound: 'uno_shout' });
      io.to(room.roomCode).emit('game:uno-alert', {
        playerName: room.players.find((p) => p.id === socket.id)?.name || 'Player',
      });
    }
  });

  // Catch someone who failed to call UNO
  socket.on('game:catch-uno', (callback) => {
    if (!currentRoomCode) return callback?.({ success: false, message: 'No active room' });
    const room = roomManager.getRoom(currentRoomCode);
    if (!room) return callback?.({ success: false, message: 'Room not found' });

    const result = room.catchUno(socket.id);
    callback?.(result);
    if (result.success) {
      broadcastRoomState(room);
      io.to(room.roomCode).emit('game:sound', { sound: 'penalty' });
    }
  });

  // Live quick emote / chat
  socket.on('game:send-chat', (data: { message?: string; emote?: string }) => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    io.to(room.roomCode).emit('game:chat-message', {
      playerId: player.id,
      playerName: player.name,
      avatar: player.avatar,
      message: data.message,
      emote: data.emote,
      timestamp: Date.now(),
    });
  });

  // Leave room
  socket.on('room:leave', () => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (room) {
      room.removePlayer(socket.id);
      socket.leave(room.roomCode);
      broadcastRoomState(room);
    }
    currentRoomCode = null;
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    if (currentRoomCode) {
      const room = roomManager.getRoom(currentRoomCode);
      if (room) {
        room.removePlayer(socket.id);
        broadcastRoomState(room);
      }
    }
  });
});

// Setup Vite development middleware or static production serving
async function startServer() {
  const PORT = parseInt(process.env.PORT || '3000', 10);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`UNO Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
