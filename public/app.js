const $ = (selector) => document.querySelector(selector);
function within(root, selector) { return root.querySelector(selector); }
const QUALITY_PROFILES = {
  economy: { label: 'Economia', maxBitrate: 800_000, maxFramerate: 15, width: 1280, height: 720 },
  balanced: { label: 'Equilibrado', maxBitrate: 1_500_000, maxFramerate: 20, width: 1280, height: 720 },
  high: { label: 'Alta qualidade', maxBitrate: 3_000_000, maxFramerate: 20, width: 1920, height: 1080 }
};
const state = { socket: null, roomId: null, peerId: null, peerIds: new Set(), peers: new Map(), participantCount: 1, stream: null, cards: new Map(), signalChain: Promise.resolve(), quality: 'balanced', streamMuted: false, statsTimer: null, statsByPeer: new Map(), lastAutoDowngrade: 0 };
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] };

function randomRoom() { return `sala-${crypto.randomUUID().slice(0, 8)}`; }
function validRoom(value) { return value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 64); }
function displayName() { return $('#displayName').value.trim() || 'Participante'; }
function status(online, text) { $('#connectionStatus').dataset.state = online ? 'online' : 'offline'; $('#connectionStatus b').textContent = text; }
function toast(message) { const target = $('#toast'); target.textContent = message; target.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => target.classList.remove('show'), 2800); }
function debug(event, details = {}) {
  const line = `${new Date().toLocaleTimeString()} ${event} ${Object.entries(details).map(([key, value]) => `${key}=${String(value)}`).join(' ')}`.trim();
  console.info('[screen-room]', line);
  const output = $('#debugLog');
  if (output) output.textContent = `${line}\n${output.textContent}`.split('\n').slice(0, 50).join('\n');
}
function signal(message) {
  if (state.socket?.readyState !== WebSocket.OPEN) { debug('signal-skip', { type: message.type, reason: 'socket-not-open' }); return; }
  debug('signal-send', { type: message.data?.type || message.type, target: message.target || '-' });
  state.socket.send(JSON.stringify(message));
}
async function loadIceServers() {
  try {
    const response = await fetch('/turn-credentials', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const config = await response.json();
    if (!Array.isArray(config.iceServers) || config.iceServers.length === 0) throw new Error('Resposta TURN inválida');
    rtcConfig.iceServers = config.iceServers;
    debug('turn-config', { servers: config.iceServers.length, relay: config.iceServers.some((entry) => String(entry.urls).includes('turn:')) });
  } catch (error) {
    debug('turn-config-fallback', { message: error?.message || '-' });
  }
}
function updateQualityStatus(note = '') {
  const profile = QUALITY_PROFILES[state.quality];
  $('#qualityStatus').textContent = `${profile.label} · ${profile.maxFramerate} FPS · ${Math.round(profile.maxBitrate / 1_000_000 * 10) / 10} Mbps${note ? ` · ${note}` : ''}`;
}
async function applyQualityToSenders() {
  const profile = QUALITY_PROFILES[state.quality];
  for (const peer of state.peers.values()) {
    const sender = peer.pc.getSenders().find((item) => item.track?.kind === 'video');
    if (!sender?.getParameters || !sender.setParameters) continue;
    const parameters = sender.getParameters();
    parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
    parameters.encodings[0].maxBitrate = profile.maxBitrate;
    parameters.encodings[0].maxFramerate = profile.maxFramerate;
    try { await sender.setParameters(parameters); } catch (error) { debug('quality-apply-skip', { peer: peer.name, message: error?.message || '-' }); }
  }
  updateQualityStatus();
  debug('quality-applied', { profile: state.quality, bitrate: profile.maxBitrate, fps: profile.maxFramerate });
}
function setStreamMuted(muted) {
  state.streamMuted = Boolean(muted);
  for (const track of state.stream?.getAudioTracks() || []) track.enabled = !state.streamMuted;
  const button = $('#muteStream');
  button.setAttribute('aria-pressed', String(state.streamMuted));
  button.textContent = state.streamMuted ? 'Ativar áudio da tela' : 'Mutar áudio da tela';
  debug('screen-audio', { muted: state.streamMuted });
}
function maybeAdaptQuality(lossPercent) {
  if (lossPercent < 5 || state.quality === 'economy' || Date.now() - state.lastAutoDowngrade < 20_000) return;
  state.quality = state.quality === 'high' ? 'balanced' : 'economy';
  $('#qualityProfile').value = state.quality;
  state.lastAutoDowngrade = Date.now();
  applyQualityToSenders();
  updateQualityStatus('reduzido automaticamente por perda');
  toast('Rede instável: qualidade reduzida para manter a transmissão.');
}
async function collectConnectionStats() {
  const samples = [];
  for (const [peerId, peer] of state.peers) {
    const reports = await peer.pc.getStats();
    let outbound; let remoteInbound; let pair;
    reports.forEach((report) => { if (report.type === 'outbound-rtp' && report.kind === 'video' && !report.isRemote) outbound = report; if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) pair = report; });
    reports.forEach((report) => { if (report.type === 'remote-inbound-rtp' && report.kind === 'video' && report.localId === outbound?.id) remoteInbound = report; });
    if (!outbound) continue;
    const previous = state.statsByPeer.get(peerId);
    const now = performance.now();
    const sent = remoteInbound?.packetsReceived || outbound.packetsSent || 0; const lost = remoteInbound?.packetsLost || 0; const bytes = outbound.bytesSent || 0;
    const elapsed = previous ? Math.max(1, now - previous.now) : 0;
    const bitrate = previous ? Math.round(((bytes - previous.bytes) * 8_000) / elapsed) : 0;
    const loss = sent + lost ? (lost / (sent + lost)) * 100 : 0;
    state.statsByPeer.set(peerId, { now, bytes });
    samples.push({ bitrate, loss, rtt: pair?.currentRoundTripTime ? Math.round(pair.currentRoundTripTime * 1000) : 0 });
  }
  if (!samples.length) { $('#networkStats').textContent = state.stream ? 'Rede: aguardando métricas do espectador…' : 'Rede: aguardando transmissão'; return; }
  const bitrate = Math.round(samples.reduce((sum, item) => sum + item.bitrate, 0) / samples.length / 1000);
  const loss = samples.reduce((sum, item) => sum + item.loss, 0) / samples.length;
  const rtt = Math.round(samples.reduce((sum, item) => sum + item.rtt, 0) / samples.length);
  $('#networkStats').textContent = `Rede: ${bitrate} kbps · perda ${loss.toFixed(1)}% · RTT ${rtt || '–'} ms · ${samples.length} conexão(ões)`;
  debug('network-stats', { bitrateKbps: bitrate, loss: loss.toFixed(1), rtt });
  maybeAdaptQuality(loss);
}
function startStats() { clearInterval(state.statsTimer); state.statsTimer = setInterval(() => collectConnectionStats().catch((error) => debug('stats-error', { message: error?.message || '-' })), 3_000); }
function stopStats() { clearInterval(state.statsTimer); state.statsTimer = null; state.statsByPeer.clear(); $('#networkStats').textContent = 'Rede: aguardando transmissão'; }
function updateEmpty() { $('#emptyState').classList.toggle('hidden', state.cards.size > 0); }
function updatePresence(count = state.participantCount) {
  state.participantCount = Math.max(1, Number(count) || 1);
  const viewers = state.participantCount - 1;
  $('#participantCount').textContent = viewers === 0 ? 'Nenhum outro usuário está visualizando agora' : `${viewers} ${viewers === 1 ? 'usuário está' : 'usuários estão'} visualizando agora`;
}
function updateParticipants() { updatePresence(Math.max(state.participantCount, state.peers.size + 1)); }
function canShareScreen() {
  return Boolean(navigator.mediaDevices?.getDisplayMedia);
}
function shareSupportMessage() {
  if (!window.isSecureContext) return 'O compartilhamento exige HTTPS. Abra pelo endereço https:// ou use http://localhost:3000.';
  if (!navigator.mediaDevices) return 'Este navegador não disponibilizou os recursos de mídia. Teste no Chrome ou Edge para computador.';
  return 'Este navegador não oferece compartilhamento de tela. Teste no Chrome ou Edge atualizado.';
}
function sharingErrorMessage(error) {
  const messages = {
    NotAllowedError: 'Permissão recusada ou compartilhamento cancelado. Clique novamente e escolha uma tela/aba.',
    AbortError: 'O seletor de tela foi fechado antes de escolher uma fonte.',
    NotFoundError: 'Nenhuma tela ou janela disponível para compartilhar.',
    NotReadableError: 'O sistema não permitiu ler a tela. Feche outro gravador de tela e tente novamente.',
    InvalidStateError: 'A página perdeu o foco. Clique na página e tente compartilhar novamente.',
    SecurityError: 'O navegador bloqueou a captura. Use o endereço HTTPS público e não um iframe.',
    TypeError: 'O navegador rejeitou as opções de captura. Teste Chrome/Edge atualizado no computador.'
  };
  return messages[error?.name] || `Falha ${error?.name || 'desconhecida'}: ${error?.message || 'o navegador não informou o motivo.'}`;
}
function addCard(id, label, stream, local = false) {
  removeCard(id);
  const card = $('#streamTemplate').content.firstElementChild.cloneNode(true);
  const video = within(card, 'video');
  if (!video) throw new Error('Template de transmissão sem elemento video.');
  video.srcObject = stream; video.muted = local; video.play().catch(() => {});
  within(card, 'strong').textContent = local ? 'Você' : label;
  if (local) within(card, '.stream-label').textContent = 'sua tela';
  $('#streams').append(card); state.cards.set(id, card); updateEmpty();
}
function removeCard(id) { state.cards.get(id)?.remove(); state.cards.delete(id); updateEmpty(); }
function closePeer(peerId, expectedPeer) {
  const peer = state.peers.get(peerId);
  if (!peer || (expectedPeer && peer !== expectedPeer)) return;
  peer.pc.close(); state.peers.delete(peerId); removeCard(peerId); updateParticipants();
}
function addLocalTracks(pc) { if (!state.stream) return; for (const track of state.stream.getTracks()) pc.addTrack(track, state.stream); }
function createPeer(peerId) {
  const existing = state.peers.get(peerId);
  if (existing?.pc && existing.pc.connectionState !== 'closed') return existing;
  if (!existing?.pc) state.peers.delete(peerId);
  if (existing?.pc) state.peers.delete(peerId);
  if (typeof RTCPeerConnection !== 'function') {
    debug('pc-unavailable', { peer: peerId });
    return null;
  }
  const pc = new RTCPeerConnection(rtcConfig);
  const peer = { pc, name: peerId, pendingCandidates: [] };
  debug('pc-created', { peer: peerId, hasStream: Boolean(state.stream) });
  state.peers.set(peerId, peer); updateParticipants();
  addLocalTracks(pc);
  pc.onicecandidate = ({ candidate }) => { if (candidate) { debug('ice-local', { peer: peerId, type: candidate.type || '-' }); signal({ type: 'signal', target: peerId, data: { type: 'ice', candidate } }); } };
  pc.ontrack = ({ streams }) => { debug('remote-track', { peer: peerId, streams: streams.length }); if (streams[0]) addCard(peerId, peer.name, streams[0]); };
  pc.onsignalingstatechange = () => debug('pc-signaling', { peer: peerId, state: pc.signalingState });
  pc.oniceconnectionstatechange = () => debug('pc-ice', { peer: peerId, state: pc.iceConnectionState });
  pc.onconnectionstatechange = () => { debug('pc-connection', { peer: peerId, state: pc.connectionState }); if (['failed', 'closed'].includes(pc.connectionState)) closePeer(peerId, peer); };
  return peer;
}
async function offer(peerId) {
  let peer = createPeer(peerId);
  if (!peer?.pc && typeof RTCPeerConnection === 'function') peer = createPeer(peerId);
  if (!peer?.pc) { debug('offer-abort', { peer: peerId, reason: 'peer-connection-unavailable' }); return; }
  if (!state.stream || peer.pc.signalingState !== 'stable') { debug('offer-skip', { peer: peerId, hasPc: true, hasStream: Boolean(state.stream), signaling: peer.pc.signalingState }); return; }
  const offer = await peer.pc.createOffer();
  await peer.pc.setLocalDescription(offer);
  await applyQualityToSenders();
  debug('offer-created', { peer: peerId });
  signal({ type: 'signal', target: peerId, data: { type: 'offer', sdp: peer.pc.localDescription } });
}
async function handleSignal(from, data) {
  debug('signal-receive', { from, type: data?.type || '-' });
  const peer = createPeer(from);
  if (!peer?.pc) return;
  if (data.type === 'offer') {
    await peer.pc.setRemoteDescription(data.sdp); debug('offer-received', { from });
    await flushRemoteIce(peer, from);
    const answer = await peer.pc.createAnswer(); await peer.pc.setLocalDescription(answer); debug('answer-created', { to: from });
    signal({ type: 'signal', target: from, data: { type: 'answer', sdp: peer.pc.localDescription } });
  }
  if (data.type === 'answer') { await peer.pc.setRemoteDescription(data.sdp); await flushRemoteIce(peer, from); debug('answer-received', { from }); }
  if (data.type === 'ice') await addRemoteIce(peer, from, data.candidate);
}
async function addRemoteIce(peer, from, candidate) {
  if (!peer.pc.remoteDescription) { peer.pendingCandidates.push(candidate); debug('ice-queued', { from, queued: peer.pendingCandidates.length }); return; }
  await peer.pc.addIceCandidate(candidate); debug('ice-remote', { from });
}
async function flushRemoteIce(peer, from) {
  const candidates = peer.pendingCandidates.splice(0);
  for (const candidate of candidates) await peer.pc.addIceCandidate(candidate);
  if (candidates.length) debug('ice-flushed', { from, count: candidates.length });
}
async function connect(roomId) {
  state.roomId = roomId; state.peerId = `p_${crypto.randomUUID().replaceAll('-', '')}`;
  await loadIceServers();
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  state.socket = new WebSocket(`${scheme}://${location.host}/signal`);
  state.socket.onopen = () => { status(true, 'Conectado'); debug('signal-open', { room: roomId }); signal({ type: 'join', roomId, peerId: state.peerId }); };
  state.socket.onclose = () => { status(false, 'Desconectado'); debug('signal-close'); };
  state.socket.onerror = () => { debug('signal-error'); toast('Não foi possível conectar à sala.'); };
  state.socket.onmessage = ({ data }) => {
    state.signalChain = state.signalChain.then(async () => {
      const message = JSON.parse(data);
      debug('signal-message', { type: message.type, count: message.count ?? '-' });
      try {
      if (message.type === 'peers') { message.peers.forEach((peerId) => state.peerIds.add(peerId)); updatePresence(message.count); }
      if (message.type === 'peer-joined') { state.peerIds.add(message.peerId); if (state.stream) await offer(message.peerId); }
      if (message.type === 'peer-joined') updatePresence(message.count);
      if (message.type === 'peer-left') { state.peerIds.delete(message.peerId); closePeer(message.peerId); }
      if (message.type === 'peer-left') updatePresence(message.count);
      if (message.type === 'signal') await handleSignal(message.from, message.data);
      if (message.type === 'error') toast(message.message);
      } catch (error) { debug('signal-handle-error', { name: error?.name || '-', message: error?.message || '-' }); console.error(error); toast('Falha ao negociar a conexão WebRTC.'); }
    });
  };
}
async function startSharing() {
  if (!canShareScreen()) { toast(shareSupportMessage()); return; }
  try {
    const profile = QUALITY_PROFILES[state.quality];
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: profile.maxFramerate, max: profile.maxFramerate }, width: { ideal: profile.width, max: profile.width }, height: { ideal: profile.height, max: profile.height } }, audio: true });
    state.stream = stream; state.streamMuted = false; addCard('local', displayName(), stream, true);
    $('#muteStream').disabled = stream.getAudioTracks().length === 0;
    setStreamMuted(false);
    debug('screen-captured', { videoTracks: stream.getVideoTracks().length, audioTracks: stream.getAudioTracks().length, peers: state.peerIds.size });
    const audioAvailable = stream.getAudioTracks().length > 0;
    $('#shareTitle').textContent = audioAvailable ? 'Você está compartilhando tela e áudio' : 'Você está compartilhando somente a tela';
    $('#shareDescription').textContent = audioAvailable ? 'Para interromper, use o botão do navegador ou pare abaixo.' : 'Para compartilhar áudio, selecione uma aba e marque “Compartilhar áudio” no navegador.';
    $('#shareScreen').textContent = 'Parar compartilhamento';
    for (const peer of state.peers.values()) {
      const senders = peer.pc.getSenders();
      const video = stream.getVideoTracks()[0];
      const audio = stream.getAudioTracks()[0];
      const videoSender = senders.find((sender) => sender.track?.kind === 'video');
      const audioSender = senders.find((sender) => sender.track?.kind === 'audio');
      if (videoSender) await videoSender.replaceTrack(video); else if (video) peer.pc.addTrack(video, stream);
      if (audioSender) await audioSender.replaceTrack(audio); else if (audio) peer.pc.addTrack(audio, stream);
    }
    await applyQualityToSenders();
    startStats();
    for (const peerId of state.peerIds) offer(peerId).catch((error) => debug('offer-error', { peer: peerId, message: error?.message || '-' }));
    stream.getVideoTracks()[0]?.addEventListener('ended', stopSharing);
  } catch (error) {
    console.error('[screen-room] getDisplayMedia falhou', { name: error?.name, message: error?.message, secureContext: window.isSecureContext, userAgent: navigator.userAgent });
    const message = sharingErrorMessage(error);
    $('#shareDescription').textContent = message;
    toast(message);
  }
}
function stopSharing() {
  for (const peer of state.peers.values()) {
    for (const sender of peer.pc.getSenders()) if (sender.track?.kind === 'video' || sender.track?.kind === 'audio') sender.replaceTrack(null).catch(console.error);
  }
  state.stream?.getTracks().forEach((track) => track.stop()); state.stream = null; state.streamMuted = false; removeCard('local');
  $('#muteStream').disabled = true; $('#muteStream').setAttribute('aria-pressed', 'false'); $('#muteStream').textContent = 'Mutar áudio da tela'; stopStats();
  $('#shareTitle').textContent = 'Pronto para compartilhar?'; $('#shareDescription').textContent = 'Sua tela e o áudio da tela serão enviados para todos na sala.'; $('#shareScreen').textContent = 'Compartilhar tela ↗';
}
function enterRoom(roomId) {
  history.replaceState({}, '', `/?room=${encodeURIComponent(roomId)}`); $('#lobby').classList.add('hidden'); $('#room').classList.remove('hidden'); $('#roomTitle').textContent = roomId;
  connect(roomId).catch((error) => { debug('connect-error', { message: error?.message || '-' }); toast('Não foi possível preparar a conexão.'); });
}
$('#randomRoom').addEventListener('click', () => { $('#roomId').value = randomRoom(); });
$('#joinForm').addEventListener('submit', (event) => { event.preventDefault(); const roomId = validRoom($('#roomId').value); if (!roomId) { toast('Informe um nome de sala válido.'); return; } enterRoom(roomId); });
$('#shareScreen').addEventListener('click', () => state.stream ? stopSharing() : startSharing());
$('#muteStream').addEventListener('click', () => setStreamMuted(!state.streamMuted));
$('#qualityProfile').addEventListener('change', async (event) => { state.quality = event.target.value; await applyQualityToSenders(); toast(`Qualidade alterada para ${QUALITY_PROFILES[state.quality].label}.`); });
updateQualityStatus();
$('#copyLink').addEventListener('click', async () => { await navigator.clipboard.writeText(location.href); toast('Link da sala copiado.'); });
$('#leaveRoom').addEventListener('click', () => location.href = '/');
const linkedRoom = validRoom(new URLSearchParams(location.search).get('room') || '');
if (linkedRoom) { $('#roomId').value = linkedRoom; enterRoom(linkedRoom); } else { $('#roomId').value = randomRoom(); }
