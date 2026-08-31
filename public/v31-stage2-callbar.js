(() => {
  'use strict';

  const CAMERA_PREF_KEY = 'essencia_voice_video_settings_v31';
  let cameraMode = false;
  let cameraStream = null;
  let syncing = false;

  function getCameraPreference() {
    try {
      const prefs = JSON.parse(localStorage.getItem(CAMERA_PREF_KEY) || '{}') || {};
      return prefs.videoinput || '';
    } catch {
      return '';
    }
  }

  function hasCameraDevice() {
    return navigator.mediaDevices?.enumerateDevices
      ? navigator.mediaDevices.enumerateDevices().then(list => list.some(device => device.kind === 'videoinput')).catch(() => false)
      : Promise.resolve(false);
  }

  async function addCameraTrackToPeers(track, stream) {
    for (const pc of state.peerConnections.values()) {
      const emptyVideoTransceiver = pc.getTransceivers().find(t =>
        t.receiver?.track?.kind === 'video' && !t.sender.track
      );

      if (emptyVideoTransceiver) {
        emptyVideoTransceiver.direction = 'sendrecv';
        await emptyVideoTransceiver.sender.replaceTrack(track);
      } else {
        pc.addTrack(track, stream);
      }
    }
    await renegotiateAll();
  }

  async function startCamera() {
    if (!state.inVoice) {
      toast('Entre em uma chamada primeiro.');
      return;
    }

    if (cameraMode) {
      await stopCamera();
      return;
    }

    if (state.screenStream) {
      toast('Encerre a transmissão da tela antes de ligar a webcam.');
      return;
    }

    const preferred = getCameraPreference();
    const video = preferred
      ? { deviceId: { exact: preferred }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } };

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
      const track = cameraStream.getVideoTracks()[0];
      if (!track) throw new Error('Webcam indisponível.');

      cameraMode = true;
      window.__essenciaStage2Camera = true;
      state.screenStream = cameraStream;
      track.onended = () => stopCamera();

      await addCameraTrackToPeers(track, cameraStream);
      broadcastMediaState();
      renderVideoGrid();
      syncStage2UI();
      toast('Webcam ligada.');
    } catch (error) {
      cameraMode = false;
      window.__essenciaStage2Camera = false;
      cameraStream?.getTracks?.().forEach(track => { try { track.stop(); } catch {} });
      cameraStream = null;
      if (state.screenStream === cameraStream) state.screenStream = null;
      toast(error.message || 'Não foi possível abrir a webcam.');
    }
  }

  async function stopCamera() {
    if (!cameraMode && !cameraStream) return;

    const stream = cameraStream || state.screenStream;
    const tracks = [...(stream?.getTracks?.() || [])];

    for (const pc of state.peerConnections.values()) {
      for (const transceiver of pc.getTransceivers()) {
        const senderTrack = transceiver.sender?.track;
        if (!senderTrack || !tracks.includes(senderTrack)) continue;
        try {
          await transceiver.sender.replaceTrack(null);
          if (senderTrack.kind === 'video') transceiver.direction = 'recvonly';
        } catch {}
      }
    }

    tracks.forEach(track => { try { track.stop(); } catch {} });
    if (state.screenStream === stream) state.screenStream = null;
    cameraStream = null;
    cameraMode = false;
    window.__essenciaStage2Camera = false;

    try { await renegotiateAll(); } catch {}
    broadcastMediaState();
    renderVideoGrid();
    syncStage2UI();
    toast('Webcam desligada.');
  }

  function installVoiceControls() {
    const controls = document.querySelector('#voiceView .voice-controls');
    const screen = document.querySelector('#screenBtn');
    const mic = document.querySelector('#micBtn');
    const leave = document.querySelector('#leaveVoiceBtn');
    const quality = document.querySelector('#qualityBtn');
    if (!controls || !screen || !mic || !leave) return;

    quality?.classList.add('v31-stage2-hidden');

    let camera = document.querySelector('#cameraBtn');
    if (!camera) {
      camera = document.createElement('button');
      camera.id = 'cameraBtn';
      camera.className = 'round-control v31-camera-control';
      camera.innerHTML = '📹<span>Webcam</span>';
      camera.title = 'Ligar webcam';
      camera.onclick = startCamera;
    }

    controls.append(camera, screen, mic, leave);

    if (!screen.__v31Stage2Wrapped) {
      const original = screen.onclick;
      screen.__v31Stage2Wrapped = true;
      screen.onclick = async event => {
        if (cameraMode) await stopCamera();
        return original?.call(screen, event);
      };
    }
  }

  function installActiveCallPanel() {
    const bar = document.querySelector('#activeCallBar');
    if (!bar) return;

    bar.classList.add('v31-call-panel');

    const info = bar.querySelector('.active-call-info');
    if (info && !info.querySelector('.v31-call-status')) {
      const dot = info.querySelector('.call-dot');
      const text = info.querySelector('div');
      if (text) {
        text.insertAdjacentHTML('afterbegin', '<span class="v31-call-status">Voz conectada</span>');
      }
      if (dot) dot.title = 'Conectado';
    }

    let streamStrip = bar.querySelector('#v31StreamStrip');
    if (!streamStrip) {
      streamStrip = document.createElement('div');
      streamStrip.id = 'v31StreamStrip';
      streamStrip.className = 'v31-stream-strip hidden';
      streamStrip.innerHTML = '<div><span class="v31-stream-dot"></span><strong>Transmitindo sua tela</strong></div><button id="v31StopStreamBtn" type="button">Encerrar</button>';
      bar.prepend(streamStrip);
      streamStrip.querySelector('#v31StopStreamBtn').onclick = () => {
        if (state.screenStream && !cameraMode) stopScreen();
      };
    }

    let quick = bar.querySelector('#v31CallQuickActions');
    if (!quick) {
      quick = document.createElement('div');
      quick.id = 'v31CallQuickActions';
      quick.className = 'v31-call-quick-actions';
      quick.innerHTML = `
        <button id="v31QuickCamera" type="button" title="Webcam"><span>📹</span><small>Webcam</small></button>
        <button id="v31QuickScreen" type="button" title="Transmitir"><span>🖥️</span><small>Transmitir</small></button>
        <button id="v31QuickMic" type="button" title="Microfone"><span>🎙️</span><small>Microfone</small></button>
        <button id="v31QuickLeave" class="danger" type="button" title="Sair"><span>☎️</span><small>Sair</small></button>`;
      bar.appendChild(quick);

      quick.querySelector('#v31QuickCamera').onclick = startCamera;
      quick.querySelector('#v31QuickScreen').onclick = () => document.querySelector('#screenBtn')?.click();
      quick.querySelector('#v31QuickMic').onclick = () => document.querySelector('#micBtn')?.click();
      quick.querySelector('#v31QuickLeave').onclick = () => document.querySelector('#leaveVoiceBtn')?.click();
    }
  }

  async function syncCameraAvailability() {
    const available = await hasCameraDevice();
    document.querySelectorAll('#cameraBtn,#v31QuickCamera').forEach(button => {
      button.disabled = !available;
      button.classList.toggle('device-unavailable', !available);
      button.title = available ? (cameraMode ? 'Desligar webcam' : 'Ligar webcam') : 'Nenhuma webcam encontrada';
    });
  }

  function syncStage2UI() {
    if (syncing) return;
    syncing = true;
    try {
      installVoiceControls();
      installActiveCallPanel();

      if (!state.inVoice && cameraMode) {
        cameraMode = false;
        cameraStream = null;
        window.__essenciaStage2Camera = false;
      }

      const isScreenSharing = !!state.screenStream?.getVideoTracks?.().length && !cameraMode;
      const muted = !!state.muted;

      document.querySelector('#cameraBtn')?.classList.toggle('active', cameraMode);
      document.querySelector('#v31QuickCamera')?.classList.toggle('active', cameraMode);
      document.querySelector('#v31QuickScreen')?.classList.toggle('active', isScreenSharing);
      document.querySelector('#v31QuickMic')?.classList.toggle('muted', muted);

      const strip = document.querySelector('#v31StreamStrip');
      strip?.classList.toggle('hidden', !isScreenSharing);

      const quality = document.querySelector('#qualityBtn');
      if (quality) quality.style.display = 'none';

      if (cameraMode) {
        const localBadge = document.querySelector('[data-peer="local"] .tile-badge');
        if (localBadge) localBadge.textContent = 'Webcam';
        const localNote = document.querySelector('[data-peer="local"] .local-share-note');
        if (localNote) localNote.textContent = 'Sua webcam está ligada.';
      }

      const title = document.querySelector('#activeCallTitle');
      const subtitle = document.querySelector('#activeCallSubtitle');
      if (state.inVoice && state.mediaContext) {
        if (title) title.textContent = state.mediaContext.title || 'Chamada';
        if (subtitle) subtitle.textContent = state.mediaContext.kind === 'server' ? 'Canal de voz' : 'Chamada privada';
      }
    } finally {
      syncing = false;
    }
  }

  installVoiceControls();
  installActiveCallPanel();
  syncStage2UI();
  syncCameraAvailability();

  const interval = setInterval(syncStage2UI, 650);
  const deviceInterval = setInterval(syncCameraAvailability, 8000);

  window.addEventListener('beforeunload', () => {
    clearInterval(interval);
    clearInterval(deviceInterval);
    cameraStream?.getTracks?.().forEach(track => { try { track.stop(); } catch {} });
  }, { once: true });
})();
