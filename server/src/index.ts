import express from 'express';
import type { Request, Response } from 'express';
import http from 'http';
import https from 'https';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

dotenv.config();

const PORT = Number(process.env.PORT) || 3001;
const ORIGIN = process.env.ORIGIN || '*';
const SSL_CERT_FILE = process.env.SSL_CERT_FILE;
const SSL_KEY_FILE = process.env.SSL_KEY_FILE;

const app = express();
app.use(helmet());
app.use(cors({ origin: ORIGIN, methods: ['GET', 'POST'], credentials: true }));
app.get('/', (_req: Request, res: Response) => {
  res.send({ status: 'ok', name: 'watchparty-signaling', version: '0.1.0' });
});

let server: http.Server | https.Server;
if (SSL_CERT_FILE && SSL_KEY_FILE) {
  try {
    const fs = require('fs');
    const cert = fs.readFileSync(SSL_CERT_FILE);
    const key = fs.readFileSync(SSL_KEY_FILE);
    server = https.createServer({ key, cert }, app);
    console.log('Starting HTTPS signaling server');
  } catch (e) {
    console.warn('Failed to load SSL cert/key, falling back to HTTP:', e);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}
const io = new Server(server, {
  cors: {
    origin: ORIGIN,
    methods: ['GET', 'POST']
  }
});

// Simple in-memory room tracking (not for large scale)
const rooms = new Map<string, Set<string>>();

io.on('connection', (socket: Socket) => {
  socket.on('room:join', (roomId: string) => {
    socket.join(roomId);
    let members = rooms.get(roomId);
    if (!members) {
      members = new Set();
      rooms.set(roomId, members);
    }
    members.add(socket.id);
    socket.to(roomId).emit('room:peer-joined', { peerId: socket.id });
    socket.emit('room:members', { members: Array.from(members).filter(id => id !== socket.id) });
  });

  socket.on('room:leave', (roomId: string) => {
    socket.leave(roomId);
    const members = rooms.get(roomId);
    if (members) {
      members.delete(socket.id);
      if (members.size === 0) rooms.delete(roomId);
    }
    socket.to(roomId).emit('room:peer-left', { peerId: socket.id });
  });

  // WebRTC signaling relays
  socket.on('webrtc:offer', ({ roomId, to, sdp }: { roomId?: string; to?: string; sdp: any }) => {
    if (to) {
      io.to(to).emit('webrtc:offer', { from: socket.id, sdp });
    } else {
      if (!roomId) return;
      socket.to(roomId).emit('webrtc:offer', { from: socket.id, sdp });
    }
  });

  socket.on('webrtc:answer', ({ roomId, to, sdp }: { roomId?: string; to?: string; sdp: any }) => {
    if (to) {
      io.to(to).emit('webrtc:answer', { from: socket.id, sdp });
    } else {
      if (!roomId) return;
      socket.to(roomId).emit('webrtc:answer', { from: socket.id, sdp });
    }
  });

  socket.on('webrtc:ice', ({ roomId, to, candidate }: { roomId?: string; to?: string; candidate: any }) => {
    if (to) {
      io.to(to).emit('webrtc:ice', { from: socket.id, candidate });
    } else {
      if (!roomId) return;
      socket.to(roomId).emit('webrtc:ice', { from: socket.id, candidate });
    }
  });

  socket.on('disconnecting', () => {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;
      socket.to(roomId).emit('room:peer-left', { peerId: socket.id });
      const members = rooms.get(roomId);
      if (members) {
        members.delete(socket.id);
        if (members.size === 0) rooms.delete(roomId);
      }
    }
  });
});

const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  const scheme = server instanceof https.Server ? 'https' : 'http';
  console.log(`Signaling server listening on ${scheme}://${HOST}:${PORT}`);
});
