import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { RoomRegistry } from './room-state.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
function signalLog(event, fields = {}) { console.log(`[screen-room:signal] ${event}`, fields); }
function turnSecret() {
  try { return readFileSync(process.env.TURN_SECRET_FILE || '/etc/screen-room/turn-secret', 'utf8').trim(); } catch { return process.env.TURN_SECRET || ''; }
}
function turnCredentials() {
  const secret = turnSecret();
  if (!secret) return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  const username = `${Math.floor(Date.now() / 1000) + 3600}:${randomUUID()}`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');
  const host = process.env.TURN_HOST || '169.58.238.52';
  return { iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: [`turn:${host}:3478?transport=udp`, `turn:${host}:3478?transport=tcp`], username, credential }
  ] };
}

function send(socket, message) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

export function createSignalServer({ port = 3000, host = '0.0.0.0' } = {}) {
  const rooms = new RoomRegistry();
  const clients = new Map();
  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/turn-credentials') {
      const payload = JSON.stringify(turnCredentials());
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(payload);
      return;
    }
    let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    pathname = path.normalize(pathname).replace(/^([.][.][\\/])+/, '');
    const file = path.join(publicDir, pathname);
    if (!file.startsWith(publicDir)) { res.writeHead(403); res.end('Forbidden'); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  const wss = new WebSocketServer({ server: httpServer, path: '/signal' });

  function peerSocket(roomId, peerId) { return clients.get(`${roomId}:${peerId}`); }
  function broadcast(roomId, message, exceptPeer) {
    for (const peerId of rooms.peers(roomId)) if (peerId !== exceptPeer) send(peerSocket(roomId, peerId), message);
  }
  function depart(socket) {
    if (!socket.meta) return;
    const { roomId, peerId } = socket.meta;
    clients.delete(`${roomId}:${peerId}`);
    rooms.leave(roomId, peerId);
    const count = rooms.peers(roomId).length;
    signalLog('leave', { roomId, peerId, count });
    broadcast(roomId, { type: 'peer-left', peerId, count }, peerId);
    socket.meta = null;
  }

  wss.on('connection', (socket) => {
    socket.on('message', (raw) => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { send(socket, { type: 'error', message: 'Mensagem inválida.' }); return; }
      try {
        if (message.type === 'join') {
          depart(socket);
          const peers = rooms.join(message.roomId, message.peerId);
          socket.meta = { roomId: String(message.roomId).trim().toLowerCase(), peerId: String(message.peerId).trim() };
          clients.set(`${socket.meta.roomId}:${socket.meta.peerId}`, socket);
          const count = rooms.peers(socket.meta.roomId).length;
          signalLog('join', { roomId: socket.meta.roomId, peerId: socket.meta.peerId, count });
          send(socket, { type: 'peers', peers, count });
          broadcast(socket.meta.roomId, { type: 'peer-joined', peerId: socket.meta.peerId, count }, socket.meta.peerId);
          return;
        }
        if (message.type === 'signal' && socket.meta && typeof message.target === 'string') {
          const target = peerSocket(socket.meta.roomId, message.target);
          signalLog('relay', { roomId: socket.meta.roomId, from: socket.meta.peerId, to: message.target, type: message.data?.type, delivered: Boolean(target) });
          if (target) send(target, { type: 'signal', from: socket.meta.peerId, data: message.data });
          return;
        }
        send(socket, { type: 'error', message: 'Ação não permitida.' });
      } catch (error) { send(socket, { type: 'error', message: error.message }); }
    });
    socket.on('close', () => depart(socket));
  });

  const ready = new Promise((resolve) => httpServer.listen(port, host, resolve));
  return {
    ready,
    get port() { const address = httpServer.address(); return typeof address === 'object' && address ? address.port : port; },
    close: () => new Promise((resolve) => {
      for (const socket of wss.clients) socket.terminate();
      wss.close(() => httpServer.close(resolve));
    })
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createSignalServer({ port: Number(process.env.PORT || 3000) });
  await app.ready;
  console.log(`Screen Room disponível em http://localhost:${app.port}`);
}
