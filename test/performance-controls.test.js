import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('application exposes quality profiles and a screen-audio mute control', () => {
  assert.match(html, /id="qualityProfile"/);
  assert.match(html, /id="muteStream"/);
  assert.match(client, /const QUALITY_PROFILES/);
  assert.match(client, /function setStreamMuted\(muted\)/);
  assert.match(client, /function applyQualityToSenders\(\)/);
});

test('application measures WebRTC quality and adapts conservatively on loss', () => {
  assert.match(html, /id="networkStats"/);
  assert.match(client, /async function collectConnectionStats\(\)/);
  assert.match(client, /getStats\(\)/);
  assert.match(client, /packetsLost/);
  assert.match(client, /function maybeAdaptQuality\(/);
});
