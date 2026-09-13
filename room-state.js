const ROOM_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PEER_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function normalizeRoom(roomId) {
  const normalized = String(roomId ?? '').trim().toLowerCase();
  if (!ROOM_PATTERN.test(normalized)) {
    throw new Error('Identificador de sala inválido. Use letras, números e hífens.');
  }
  return normalized;
}

function normalizePeer(peerId) {
  const normalized = String(peerId ?? '').trim();
  if (!PEER_PATTERN.test(normalized)) {
    throw new Error('Identificador de participante inválido.');
  }
  return normalized;
}

export class RoomRegistry {
  #rooms = new Map();

  join(roomId, peerId) {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    const peers = this.#rooms.get(room) ?? new Set();
    const existingPeers = [...peers];
    peers.add(peer);
    this.#rooms.set(room, peers);
    return existingPeers;
  }

  leave(roomId, peerId) {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    const peers = this.#rooms.get(room);
    if (!peers) return [];
    peers.delete(peer);
    const remaining = [...peers];
    if (peers.size === 0) this.#rooms.delete(room);
    return remaining;
  }

  peers(roomId) {
    const room = normalizeRoom(roomId);
    return [...(this.#rooms.get(room) ?? [])];
  }

  has(roomId) {
    return this.#rooms.has(normalizeRoom(roomId));
  }
}
