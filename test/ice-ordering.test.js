import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('ICE candidates are serialized and queued until a remote description exists', () => {
  assert.match(client, /signalChain: Promise\.resolve\(\)/);
  assert.match(client, /state\.signalChain = state\.signalChain\.then/);
  assert.match(client, /pendingCandidates: \[\]/);
  assert.match(client, /function addRemoteIce\(/);
  assert.match(client, /ice-queued/);
  assert.match(client, /function flushRemoteIce\(/);
  assert.match(client, /ice-flushed/);
});
