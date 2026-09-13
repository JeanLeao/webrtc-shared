import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('only negotiates a new peer when a local screen stream exists', () => {
  assert.match(code, /if \(message\.type === 'peer-joined'\) \{ state\.peerIds\.add\(message\.peerId\); if \(state\.stream\) await offer\(message\.peerId\); \}/);
  assert.match(code, /if \(!state\.stream \|\| peer\.pc\.signalingState !== 'stable'\) \{ debug\('offer-skip'/);
  assert.match(code, /for \(const peerId of state\.peerIds\) offer\(peerId\)/);
});

test('remote stream is attached to a real video element in its card', () => {
  assert.match(code, /function within\(root, selector\)/);
  assert.match(code, /const video = within\(card, 'video'\)/);
  assert.match(code, /video\.srcObject = stream/);
});

test('client reports the actual screen sharing failure cause', () => {
  assert.match(code, /function sharingErrorMessage\(error\)/);
  assert.match(code, /NotAllowedError/);
  assert.match(code, /NotReadableError/);
});
