import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('offer recreates a missing peer connection rather than skipping it', () => {
  assert.match(client, /function createPeer\(peerId\)[\s\S]*?if \(!existing\?\.pc\) state\.peers\.delete\(peerId\)/);
  assert.match(client, /if \(typeof RTCPeerConnection !== 'function'\)/);
  assert.match(client, /peer = createPeer\(peerId\);/);
  assert.match(client, /offer-abort.*reason: 'peer-connection-unavailable'/);
});

test('client exposes a live diagnostics log for signaling and WebRTC states', () => {
  assert.match(client, /function debug\(event, details/);
  assert.match(client, /debug\('signal-send'/);
  assert.match(client, /debug\('signal-receive'/);
  assert.match(client, /pc\.onsignalingstatechange/);
  assert.match(client, /#debugLog/);
});
