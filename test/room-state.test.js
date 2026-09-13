import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomRegistry } from '../room-state.js';

test('join creates a room and returns existing peers only', () => {
  const rooms = new RoomRegistry();
  const first = rooms.join('demo', 'host');
  const second = rooms.join('demo', 'viewer');

  assert.deepEqual(first, []);
  assert.deepEqual(second, ['host']);
  assert.deepEqual(rooms.peers('demo'), ['host', 'viewer']);
});

test('leave removes participant and deletes an empty room', () => {
  const rooms = new RoomRegistry();
  rooms.join('demo', 'host');
  rooms.join('demo', 'viewer');

  assert.deepEqual(rooms.leave('demo', 'host'), ['viewer']);
  assert.deepEqual(rooms.peers('demo'), ['viewer']);
  assert.deepEqual(rooms.leave('demo', 'viewer'), []);
  assert.equal(rooms.has('demo'), false);
});

test('room and peer identifiers are normalized and invalid values rejected', () => {
  const rooms = new RoomRegistry();
  assert.deepEqual(rooms.join('  Launch-2026 ', ' host_1 '), []);
  assert.deepEqual(rooms.peers('launch-2026'), ['host_1']);
  assert.throws(() => rooms.join('', 'host'), /sala/i);
  assert.throws(() => rooms.join('demo', '??'), /participante/i);
});
