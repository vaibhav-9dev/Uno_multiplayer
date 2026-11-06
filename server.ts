import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { roomManager } from './server/game/roomManager.ts';
import { UnoRoom } from './server/game/unoRoom.ts';
import { accountStore } from './server/db/accountStore.ts';
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
      // If player has linked account, send updated user account info
      if (player.accountUsername) {
        const safeUser = accountStore.getUserByUsername(player.accountUsername);
        if (safeUser) {
          socket.emit('auth:user-update', { user: safeUser });
        }
      }
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

// Authentication and Accounts REST API
app.post('/api/auth/register', (req, res) => {
  const { username, password, avatar } = req.body || {};
  const result = accountStore.register(username, password, avatar);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  return res.json({ token: result.token, user: result.user });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const result = accountStore.login(username, password);
  if (!result.success) {
    return res.status(401).json({ error: result.message });
  }
  return res.json({ token: result.token, user: result.user });
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }
  const user = accountStore.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  return res.json({ user });
});

app.put('/api/auth/profile', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const user = accountStore.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid session' });

  const updated = accountStore.updateProfile(user.username, req.body || {});
  return res.json({ user: updated });
});

app.get('/api/leaderboard', (_req, res) => {
  const leaderboard = accountStore.getLeaderboard(30);
  res.json({ leaderboard });
});

// Socket.io real-time connection handling
// Map roomCode -> Set of socket IDs active in voice chat
const voiceRooms = new Map<string, Set<string>>();

function removeSocketFromVoice(socketId: string, roomCode?: string) {
  if (roomCode) {
    const vSet = voiceRooms.get(roomCode);
    if (vSet) {
      vSet.delete(socketId);
      if (vSet.size === 0) {
        voiceRooms.delete(roomCode);
      }
      io.to(roomCode).emit('voice:user-left', { socketId });
    }
  } else {
    for (const [code, vSet] of voiceRooms.entries()) {
      if (vSet.has(socketId)) {
        vSet.delete(socketId);
        if (vSet.size === 0) {
          voiceRooms.delete(code);
        }
        io.to(code).emit('voice:user-left', { socketId });
      }
    }
  }
}

io.on('connection', (socket: Socket) => {
  let currentRoomCode: string | null = null;
  let sessionToken: string | null = null;

  // Voice Chat Signaling
  socket.on('voice:join', (data: { roomCode: string }, callback) => {
    const code = data?.roomCode || currentRoomCode;
    if (!code) return callback?.({ users: [] });

    if (!currentRoomCode) {
      currentRoomCode = code;
    }

    if (!voiceRooms.has(code)) {
      voiceRooms.set(code, new Set());
    }
    const vSet = voiceRooms.get(code)!;
    const existingUsers = Array.from(vSet);

    vSet.add(socket.id);
    socket.join(code);

    // Notify others in room that a voice peer joined
    socket.to(code).emit('voice:user-joined', { socketId: socket.id });

    // Return other active voice peers to the joining socket
    callback?.({ users: existingUsers });
  });

  socket.on('voice:signal', (data: { to: string; signal: any }) => {
    if (data.to && data.signal) {
      io.to(data.to).emit('voice:signal', {
        from: socket.id,
        signal: data.signal,
      });
    }
  });

  socket.on('voice:mute-status', (data: { isMuted: boolean }) => {
    if (currentRoomCode) {
      socket.to(currentRoomCode).emit('voice:mute-status', {
        socketId: socket.id,
        isMuted: data.isMuted,
      });
    }
  });

  socket.on('voice:speaking', (data: { isSpeaking: boolean }) => {
    if (currentRoomCode) {
      socket.to(currentRoomCode).emit('voice:speaking', {
        socketId: socket.id,
        isSpeaking: data.isSpeaking,
      });
    }
  });

  // Direct socket-relayed voice audio packet
  // Guaranteed fallback that bypasses P2P NAT/firewall blocks entirely
  socket.on('voice:audio-chunk', (data: { audio: any; roomCode?: string; sampleRate?: number }) => {
    const code = data?.roomCode || currentRoomCode;
    if (code && data?.audio) {
      socket.to(code).emit('voice:audio-chunk', {
        socketId: socket.id,
        audio: data.audio,
        sampleRate: data.sampleRate,
      });
    }
  });

  socket.on('voice:leave', () => {
    removeSocketFromVoice(socket.id, currentRoomCode || undefined);
  });

  // Reconnection or initial session check
  socket.on('room:reconnect', (data: { sessionToken: string; roomCode?: string; playerName?: string; avatar?: string; accountUsername?: string }, callback) => {
    sessionToken = data.sessionToken;
    let room: UnoRoom | undefined;

    if (data.roomCode) {
      room = roomManager.getRoom(data.roomCode);
    } else {
      room = roomManager.getRoomBySession(sessionToken);
    }

    if (!room) {
      if (sessionToken) roomManager.removeSession(sessionToken);
      return callback?.({ success: false, message: 'No active room found' });
    }

    const player = room.players.find((p) => p.sessionToken === sessionToken);
    if (!player) {
      if (sessionToken) roomManager.removeSession(sessionToken);
      return callback?.({ success: false, message: 'Player session expired' });
    }

    // Do not trap players in aborted or finished games on reload
    if (room.status === 'aborted' || room.status === 'game_over') {
      if (sessionToken) roomManager.removeSession(sessionToken);
      return callback?.({ success: false, message: 'Previous game has finished' });
    }

    // Rebind player id to new socket id
    player.id = socket.id;
    player.isConnected = true;
    if (data.playerName) player.name = data.playerName;
    if (data.avatar) player.avatar = data.avatar;
    if (data.accountUsername) player.accountUsername = data.accountUsername;

    currentRoomCode = room.roomCode;
    socket.join(room.roomCode);

    if (room.disconnectedPlayer && room.disconnectedPlayer.id === player.id) {
      room.disconnectedPlayer = null;
    }

    room.addLog('system', `✅ ${player.name} reconnected to their seat.`);
    broadcastRoomState(room);

    // Notify all players that this player returned
    io.to(room.roomCode).emit('game:player-reconnected', {
      playerId: player.id,
      playerName: player.name,
    });

    callback?.({ success: true, roomCode: room.roomCode });
  });

  // Create room
  socket.on('room:create', (data: { name: string; avatar: string; sessionToken: string; settings?: any; accountUsername?: string }, callback) => {
    sessionToken = data.sessionToken;
    const room = roomManager.createRoom(
      socket.id,
      sessionToken,
      data.name || 'Host',
      data.avatar || 'fox',
      data.settings,
      data.accountUsername
    );

    currentRoomCode = room.roomCode;
    socket.join(room.roomCode);

    callback?.({ success: true, roomCode: room.roomCode });
    socket.emit('game:state', room.getClientState(socket.id));
  });

  // Join room
  socket.on('room:join', (data: { roomCode: string; name: string; avatar: string; sessionToken: string; accountUsername?: string }, callback) => {
    sessionToken = data.sessionToken;
    const res = roomManager.joinRoom(
      data.roomCode,
      socket.id,
      sessionToken,
      data.name || 'Player',
      data.avatar || 'bear',
      data.accountUsername
    );
    if (!res.success || !res.room) {
      return callback?.({ success: false, message: res.message });
    }

    currentRoomCode = res.room.roomCode;
    socket.join(res.room.roomCode);

    callback?.({ success: true, roomCode: res.room.roomCode });
    broadcastRoomState(res.room);
  });

  // Quick match
  socket.on('room:quick-match', (data: { name: string; avatar: string; sessionToken: string; accountUsername?: string }, callback) => {
    sessionToken = data.sessionToken;
    const { room, isNew } = roomManager.findQuickMatch(
      socket.id,
      sessionToken,
      data.name || 'Player',
      data.avatar || 'panda',
      data.accountUsername
    );

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

  // Abort match
  socket.on('game:abort', (data: { reason?: string }) => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    room.abortGame(socket.id, data?.reason);
    broadcastRoomState(room);
    io.to(room.roomCode).emit('game:sound', { sound: 'penalty' });
    io.to(room.roomCode).emit('game:aborted', {
      abortedBy: player.name,
      reason: data?.reason || 'Player requested to abort the match.',
    });
  });

  // Pause match
  socket.on('game:pause', () => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room) return;
    const success = room.pauseGame(socket.id);
    if (success) {
      broadcastRoomState(room);
      io.to(room.roomCode).emit('game:sound', { sound: 'click' });
    }
  });

  // Resume match
  socket.on('game:resume', () => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room) return;
    const success = room.resumeGame(socket.id);
    if (success) {
      broadcastRoomState(room);
      io.to(room.roomCode).emit('game:sound', { sound: 'round_start' });
    }
  });

  // Skip turn for disconnected player
  socket.on('game:skip-turn', () => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room) return;

    const success = room.skipDisconnectedTurn(socket.id);
    if (success) {
      broadcastRoomState(room);
      io.to(room.roomCode).emit('game:sound', { sound: 'skip' });
    }
  });

  // Leave room
  socket.on('room:leave', () => {
    removeSocketFromVoice(socket.id, currentRoomCode || undefined);
    if (sessionToken) {
      roomManager.removeSession(sessionToken);
    }
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (room) {
      const player = room.players.find((p) => p.id === socket.id);
      room.removePlayer(socket.id);
      socket.leave(room.roomCode);
      broadcastRoomState(room);
      if (player) {
        io.to(room.roomCode).emit('game:player-dropped', {
          playerId: player.id,
          playerName: player.name,
        });
      }
    }
    currentRoomCode = null;
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    removeSocketFromVoice(socket.id, currentRoomCode || undefined);
    if (currentRoomCode) {
      const room = roomManager.getRoom(currentRoomCode);
      if (room) {
        const player = room.players.find((p) => p.id === socket.id);
        room.removePlayer(socket.id);
        broadcastRoomState(room);
        if (player) {
          io.to(room.roomCode).emit('game:player-dropped', {
            playerId: player.id,
            playerName: player.name,
          });
          io.to(room.roomCode).emit('game:sound', { sound: 'penalty' });
        }
      }
    }
  });
});

// Periodic check for 3-minute turn timeouts and abandoned single-player matches
setInterval(() => {
  for (const room of roomManager.getAllRooms()) {
    if (room.status === 'in_progress' && !room.isPaused) {
      const result = room.checkTurnTimeout();
      if (result.updated) {
        broadcastRoomState(room);
        if (result.aborted) {
          io.to(room.roomCode).emit('game:aborted', {
            abortedBy: 'System',
            reason: result.reason || 'Match aborted due to player inactivity.',
          });
          io.to(room.roomCode).emit('game:sound', { sound: 'penalty' });
        } else {
          io.to(room.roomCode).emit('game:sound', { sound: 'skip' });
        }
      }
    }
  }
}, 3000);

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
