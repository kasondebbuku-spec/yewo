import { Server } from 'socket.io';
import { verifyToken } from './auth.js';

// Each logged-in app connects with its token and joins a private room "user:<id>".
// The server pushes job offers, job status changes and worker locations to those rooms.
let io = null;

export function attachRealtime(httpServer) {
  io = new Server(httpServer, { cors: { origin: '*' } });

  io.use((socket, next) => {
    try {
      const payload = verifyToken(socket.handshake.auth?.token);
      if (payload.typ || !payload.sub) throw new Error('not a login token');
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => socket.join(`user:${socket.data.userId}`));
  return io;
}

export function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function closeRealtime() {
  io?.close();
  io = null;
}
