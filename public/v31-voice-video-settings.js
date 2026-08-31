(() => {
  'use strict';

  const PREF_KEY = 'essencia_voice_video_settings_v31';
  const OLD_DEVICE_KEY = 'essencia_media_devices_v31';

  let prefs = {
    audioinput: '',
    audiooutput: '',
    videoinput: '',
    inputVolume: 100,
    outputVolume: 100
  };

  try {
    prefs = { ...prefs, ...(JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}) };
    const old = JSON.parse(localStorage.getItem(OLD_DEVICE_KEY) || '{}') || {};
    if (!prefs.audioinput && old.audioinput) prefs.audioinput = old.audioinput;
    if (!prefs.audiooutput && old.audiooutput) prefs.audiooutput = old.audiooutput;
  } catch {}

  let micTestStream = null;
  let micTestContext = null;
  let micTestFrame = 0;
  let cameraTestStream = null;

  const esc = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  function savePrefs() {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    localStorage.setItem(OLD_DEVICE_KEY, JSON.stringify({
      audioinput: prefs.audioinput,
      audiooutput: prefs.audiooutput
    }));
  }

  function stopMicTest() {
    cancelAnimationFrame(micTestFrame);
    micTestFrame = 0;
    micTestStream?.getTracks?.().forEach(track => { try { track.stop(); } catch {} });
    micTestStream = null;
    try { micTestContext?.close?.(); } catch {}
    micTestContext = null;
  }

  function stopCameraTest() {
    cameraTestStream?.getTracks?.().forEach(track => { try { track.stop(); } catch {} });
    cameraTestStream = null;
    const video = document.querySelector('#v31vvCameraPreview');
    if (video) video.srcObject = null;
  }

  function cleanupTests() {
    stopMicTest();
    stopCameraTest();
  }

  async function enumerateDevices(requestPermission = false) {
    if (!navigator.mediaDevices?.enumerateDevices) return [];

    if (requestPermission) {
      try {
        const audio = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        audio.getTracks().forEach(track => track.stop());
      } catch {}
      try {
        const video = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        video.getTracks().forEach(track => track.stop());
      } catch {}
    }

    try {
      return await navigator.mediaDevices.enumerateDevices();
    } catch {
      return [];
    }
  }

  function buildOptions(devices, kind, selected, fallback) {
    const rows = devices.filter(device => device.kind === kind);
    const html = [`<option value="">${esc(fallback)}</option>`];
    rows.forEach((device, index) => {
      const label = device.label || `${fallback} ${index + 1}`;
      html.push(`<option value="${esc(device.deviceId)}" ${device.deviceId === selected ? 'selected' : ''}>${esc(label)}</option>`);
    });
    return html.join('');
  }

  async function switchMicrophone(deviceId) {
    if (!deviceId || !navigator.mediaDevices?.getUserMedia) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });

    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error('Microfone indisponível.');

    if (window.state?.inVoice) {
      const oldTracks = window.state.localStream?.getAudioTracks?.() || [];
      for (const pc of window.state.peerConnections?.values?.() || []) {
        const sender = pc.getSenders().find(item => item.track?.kind === 'audio' && oldTracks.includes(item.track));
        if (sender) await sender.replaceTrack(track);
      }
      oldTracks.forEach(item => { try { item.stop(); } catch {} });
      window.state.localStream = new MediaStream([track]);
      window.state.micAvailable = true;
      track.enabled = !window.state.muted;
      try { window.updateMicButton?.(); } catch {}
      try { window.broadcastMediaState?.(); } catch {}
    } else {
      stream.getTracks().forEach(item => item.stop());
    }
  }

  async function applyOutputDevice(deviceId) {
    if (!deviceId) return 0;
    let applied = 0;
    for (const media of document.querySelectorAll('audio,video')) {
      if (typeof media.setSinkId !== 'function') continue;
      try {
        await media.setSinkId(deviceId);
        applied++;
      } catch {}
    }
    return applied;
  }

  function applyOutputVolume() {
    const volume = Math.max(0, Math.min(1, Number(prefs.outputVolume || 100) / 100));
    document.querySelectorAll('audio,video').forEach(media => {
      try { media.volume = volume; } catch {}
    });
  }

  async function startMicTest() {
    stopMicTest();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Teste de microfone não suportado neste dispositivo.');

    const audio = prefs.audioinput
      ? { deviceId: { exact: prefs.audioinput }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

    micTestStream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    micTestContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = micTestContext.createMediaStreamSource(micTestStream);
    const analyser = micTestContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const bars = [...document.querySelectorAll('.v31vv-meter span')];

    const draw = () => {
      if (!micTestStream || !bars.length) return;
      analyser.getByteFrequencyData(data);
      const average = data.reduce((sum, value) => sum + value, 0) / Math.max(1, data.length);
      const scaled = Math.min(1, (average / 92) * (Number(prefs.inputVolume || 100) / 100));
      const active = Math.round(scaled * bars.length);
      bars.forEach((bar, index) => bar.classList.toggle('active', index < active));
      micTestFrame = requestAnimationFrame(draw);
    };
    draw();
  }

  async function startCameraTest() {
    stopCameraTest();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Câmera não suportada neste dispositivo.');

    const video = prefs.videoinput
      ? { deviceId: { exact: prefs.videoinput }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 } };

    cameraTestStream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
    const preview = document.querySelector('#v31vvCameraPreview');
    if (preview) {
      preview.srcObject = cameraTestStream;
      preview.muted = true;
      preview.playsInline = true;
      await preview.play().catch(() => {});
    }
  }

  function setActiveTab(button) {
    const nav = document.querySelector('.v17-settings-nav');
    nav?.querySelectorAll('.v17-settings-tab').forEach(item => item.classList.toggle('active', item === button));
  }

  async function renderVoiceVideoSettings(requestPermission = false) {
    cleanupTests();
    const box = document.querySelector('#v17SettingsContent');
    if (!box) return;

    box.innerHTML = `
      <div class="v31vv-page">
        <h2>Voz e vídeo</h2>
        <p>Configure entrada, saída de áudio e câmera deste dispositivo.</p>
        <div class="v31vv-loading">Carregando dispositivos…</div>
      </div>`;

    const devices = await enumerateDevices(requestPermission);
    if (!document.body.contains(box)) return;

    box.innerHTML = `
      <div class="v31vv-page">
        <h2>Voz e vídeo</h2>
        <p>Configure seus dispositivos e faça testes antes de entrar em uma chamada.</p>

        <section class="v31vv-section">
          <h3>Configurações de voz</h3>
          <div class="v31vv-device-grid">
            <label class="v31vv-field">
              <span>DISPOSITIVO DE ENTRADA</span>
              <select id="v31vvInput">${buildOptions(devices, 'audioinput', prefs.audioinput, 'Microfone padrão')}</select>
            </label>
            <label class="v31vv-field">
              <span>DISPOSITIVO DE SAÍDA</span>
              <select id="v31vvOutput">${buildOptions(devices, 'audiooutput', prefs.audiooutput, 'Saída padrão')}</select>
            </label>
          </div>

          <div class="v31vv-device-grid v31vv-volume-grid">
            <label class="v31vv-field">
              <span>VOLUME DE ENTRADA</span>
              <div class="v31vv-range-row"><input id="v31vvInputVolume" type="range" min="0" max="100" value="${Number(prefs.inputVolume || 100)}"><b id="v31vvInputVolumeValue">${Number(prefs.inputVolume || 100)}%</b></div>
            </label>
            <label class="v31vv-field">
              <span>VOLUME DE SAÍDA</span>
              <div class="v31vv-range-row"><input id="v31vvOutputVolume" type="range" min="0" max="100" value="${Number(prefs.outputVolume || 100)}"><b id="v31vvOutputVolumeValue">${Number(prefs.outputVolume || 100)}%</b></div>
            </label>
          </div>

          <div class="v31vv-test-card">
            <div>
              <strong>Teste do microfone</strong>
              <small>Fale normalmente e confirme se o Essência está recebendo sua voz.</small>
            </div>
            <button id="v31vvMicTest" type="button">Testar microfone</button>
            <div class="v31vv-meter" aria-label="Nível do microfone">${'<span></span>'.repeat(28)}</div>
          </div>
        </section>

        <section class="v31vv-section">
          <h3>Configurações de vídeo</h3>
          <label class="v31vv-field v31vv-camera-field">
            <span>CÂMERA</span>
            <select id="v31vvCamera">${buildOptions(devices, 'videoinput', prefs.videoinput, 'Câmera padrão')}</select>
          </label>
          <div class="v31vv-camera-card">
            <video id="v31vvCameraPreview" autoplay muted playsinline></video>
            <div class="v31vv-camera-empty">Prévia da webcam</div>
            <button id="v31vvCameraTest" type="button">Testar câmera</button>
          </div>
        </section>

        <div class="v31vv-actions">
          <button id="v31vvRefresh" class="v17-ghost-btn" type="button">Atualizar / permitir dispositivos</button>
          <button id="v31vvApply" class="v17-save-btn" type="button">Aplicar</button>
        </div>
      </div>`;

    const input = box.querySelector('#v31vvInput');
    const output = box.querySelector('#v31vvOutput');
    const camera = box.querySelector('#v31vvCamera');
    const inputVolume = box.querySelector('#v31vvInputVolume');
    const outputVolume = box.querySelector('#v31vvOutputVolume');

    input.onchange = () => { prefs.audioinput = input.value; savePrefs(); };
    output.onchange = () => { prefs.audiooutput = output.value; savePrefs(); };
    camera.onchange = () => { prefs.videoinput = camera.value; savePrefs(); stopCameraTest(); };

    inputVolume.oninput = () => {
      prefs.inputVolume = Number(inputVolume.value);
      box.querySelector('#v31vvInputVolumeValue').textContent = `${prefs.inputVolume}%`;
      savePrefs();
    };

    outputVolume.oninput = () => {
      prefs.outputVolume = Number(outputVolume.value);
      box.querySelector('#v31vvOutputVolumeValue').textContent = `${prefs.outputVolume}%`;
      savePrefs();
      applyOutputVolume();
    };

    box.querySelector('#v31vvMicTest').onclick = async event => {
      const button = event.currentTarget;
      if (micTestStream) {
        stopMicTest();
        button.textContent = 'Testar microfone';
        box.querySelectorAll('.v31vv-meter span').forEach(bar => bar.classList.remove('active'));
        return;
      }
      try {
        button.textContent = 'Parar teste';
        await startMicTest();
      } catch (error) {
        button.textContent = 'Testar microfone';
        window.toast?.(error.message || 'Não foi possível testar o microfone.');
      }
    };

    box.querySelector('#v31vvCameraTest').onclick = async event => {
      const button = event.currentTarget;
      if (cameraTestStream) {
        stopCameraTest();
        button.textContent = 'Testar câmera';
        return;
      }
      try {
        button.textContent = 'Parar câmera';
        await startCameraTest();
      } catch (error) {
        button.textContent = 'Testar câmera';
        window.toast?.(error.message || 'Não foi possível abrir a câmera.');
      }
    };

    box.querySelector('#v31vvRefresh').onclick = () => renderVoiceVideoSettings(true);
    box.querySelector('#v31vvApply').onclick = async event => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = 'Aplicando…';
      try {
        prefs.audioinput = input.value;
        prefs.audiooutput = output.value;
        prefs.videoinput = camera.value;
        savePrefs();
        if (prefs.audioinput && window.state?.inVoice) await switchMicrophone(prefs.audioinput);
        if (prefs.audiooutput) await applyOutputDevice(prefs.audiooutput);
        applyOutputVolume();
        window.toast?.('Voz e vídeo atualizados.');
      } catch (error) {
        window.toast?.(error.message || 'Não foi possível aplicar os dispositivos.');
      } finally {
        button.disabled = false;
        button.textContent = 'Aplicar';
      }
    };
  }

  function installTab() {
    const nav = document.querySelector('.v17-settings-nav');
    if (!nav) return;

    let button = nav.querySelector('[data-tab="voice-devices"]');
    if (!button) {
      button = document.createElement('button');
      button.className = 'v17-settings-tab';
      button.dataset.tab = 'voice-devices';
      const appearance = nav.querySelector('[data-tab="appearance"]');
      nav.insertBefore(button, appearance || nav.querySelector('[data-tab="logout"]'));
    }

    button.textContent = 'Voz e vídeo';
    button.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      setActiveTab(button);
      renderVoiceVideoSettings(false).catch(error => {
        console.warn('Voz e vídeo:', error);
        window.toast?.('Não foi possível abrir Voz e vídeo.');
      });
    };
  }

  // Reinstala apenas o handler do nosso próprio item; não altera as outras abas.
  const timer = setInterval(installTab, 500);
  installTab();
  applyOutputVolume();

  const settingsObserver = new MutationObserver(() => {
    const backdrop = document.querySelector('#v17SettingsBackdrop');
    if (backdrop?.classList.contains('hidden')) cleanupTests();
  });
  settingsObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  window.addEventListener('beforeunload', () => {
    clearInterval(timer);
    cleanupTests();
    settingsObserver.disconnect();
  }, { once: true });
})();
