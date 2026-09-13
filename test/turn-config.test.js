import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const client = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('server provides short-lived TURN credentials and client loads them before WebSocket join', () => {
  assert.match(server, /function turnCredentials\(\)/);
  assert.match(server, /createHmac\('sha1', secret\)/);
  assert.match(server, /url\.pathname === '\/turn-credentials'/);
  assert.match(server, /turn:\$\{host\}:3478\?transport=udp/);
  assert.match(client, /async function loadIceServers\(\)/);
  assert.match(client, /fetch\('\/turn-credentials'/);
  assert.match(client, /await loadIceServers\(\)/);
});
