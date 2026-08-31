(() => {
  'use strict';

  const QUALITY_KEY = 'essencia_stream_quality';
  const MODAL_ID = 'v31ShareSetup';

  const PRESETS = {
    high: { label: '1080p · 60 FPS', width: 1920, height: 1080, frameRate: 60, bitrate: 8500000 },
    low: { label: '720p · 30 FPS', width: 1280, height: 720, frameRate: 30, bitrate: 2500000 }
  };

  function currentQuality() {
    const q = state?.quality || PRESETS.low;
    return {
      width: Number(q.width || 1280),
      height: Number(q.height || 720),
      frameRate: Number(q.frameRate || 30),
      bitrate: Number(q.bitrate || 2500000),
      label: q.label || `${Number(q.height || 720)}p · ${Number(q.frameRate || 30)} FPS`
    };
  }

  function saveQuality(q) {
    state.quality = { ...q };
    localStorage.setItem(QUALITY_KEY, JSON.stringify(state.quality));
  }

  function closeShareSetup() {
    document.getElementById(MODAL_ID)?.remove();
  }

  function qualityFromMode(mode, resolution, fps) {
    if (mode === 'high') return { ...PRESETS.high };
    if (mode === 'low') return { ...PRESETS.low };

    const height = Number(resolution || 720);
    const frameRate = Number(fps || 30);
    const width = height >= 1080 ? 1920 : 1280;
    const bitrateMap = {
      '720-30': 2500000,
      '720-60': 4500000,
      '1080-30': 5500000,
      '1080-60': 8500000
    };
    const bitrate = bitrateMap[`${height}-${frameRate}`] || 2500000;
    return {
      label: `${height}p · ${frameRate} FPS`,
      width,
      height,
      frameRate,
      bitrate
    };
  }

  async function beginScreenShare(q) {
    if (!state.inVoice) {
      toast('Entre em uma chamada primeiro.');
      return;
    }

    saveQuality(q);

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: q.width, max: q.width },
          height: { ideal: q.height, max: q.height },
          frameRate: { ideal: q.frameRate, max: q.frameRate },
          resizeMode: 'crop-and-scale'
        },
        audio: true,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        systemAudio: 'include'
      });

      state.screenStream = stream;

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try { videoTrack.contentHint = q.frameRate >= 60 ? 'motion' : 'detail'; } catch {}
        try {
          await videoTrack.applyConstraints({
            width: { ideal: q.width, max: q.width },
            height: { ideal: q.height, max: q.height },
            frameRate: { ideal: q.frameRate, max: q.frameRate },
            resizeMode: 'crop-and-scale'
          });
        } catch {}
        videoTrack.onended = () => stopScreen();
      }

      const screenAudio = stream.getAudioTracks()[0];

      for (const pc of state.peerConnections.values()) {
        if (videoTrack) {
          const emptyVideoTransceiver = pc.getTransceivers().find(t =>
            t.receiver?.track?.kind === 'video' && !t.sender.track
          );
          if (emptyVideoTransceiver) {
            emptyVideoTransceiver.direction = 'sendrecv';
            await emptyVideoTransceiver.sender.replaceTrack(videoTrack);
          } else {
            pc.addTrack(videoTrack, stream);
          }
        }
        if (screenAudio) pc.addTrack(screenAudio, stream);
        await setScreenSenderQuality(pc, q);
      }

      await renegotiateAll();
      try { await applyQualityToActiveShare(q, false); } catch {}
      document.querySelector('#screenBtn')?.classList.add('active');
      broadcastMediaState();
      renderVideoGrid();
      refreshOpenStreamOverlay();

      const settings = videoTrack?.getSettings?.() || {};
      const actual = settings.width && settings.height
        ? ` Captura: ${settings.width}×${settings.height}${settings.frameRate ? ` a ~${Math.round(settings.frameRate)} FPS` : ''}.`
        : '';
      toast(`Transmissão iniciada em ${q.label}.${actual}`);
    } catch (err) {
      console.error(err);
      toast('Compartilhamento cancelado ou bloqueado pelo navegador.');
    }
  }

  function openShareSetup() {
    closeShareSetup();

    const current = currentQuality();
    const currentMode = current.height === 1080 && current.frameRate === 60
      ? 'high'
      : (current.height === 720 && current.frameRate === 30 ? 'low' : 'custom');

    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'v31-share-backdrop';
    modal.innerHTML = `
      <section class="v31-share-card" role="dialog" aria-modal="true" aria-label="Compartilhamento de tela">
        <button class="v31-share-close" type="button" aria-label="Fechar">×</button>
        <div class="v31-share-hero">
          <div class="v31-share-hero-icon">🖥️</div>
          <div><h2>Compartilhamento de tela</h2><p>Escolha a qualidade antes de selecionar o que você quer transmitir.</p></div>
        </div>

        <section class="v31-share-section">
          <span class="v31-share-label">QUALIDADE DA TRANSMISSÃO</span>
          <div class="v31-share-presets">
            <button type="button" data-mode="high" class="${currentMode === 'high' ? 'active' : ''}"><strong>Maior qualidade</strong><small>1080p · 60 FPS</small></button>
            <button type="button" data-mode="low" class="${currentMode === 'low' ? 'active' : ''}"><strong>Baixa qualidade</strong><small>720p · 30 FPS</small></button>
            <button type="button" data-mode="custom" class="${currentMode === 'custom' ? 'active' : ''}"><strong>Personalizado</strong><small>Escolha resolução e FPS</small></button>
          </div>
        </section>

        <section id="v31ShareCustom" class="v31-share-section v31-share-custom ${currentMode === 'custom' ? '' : 'hidden'}">
          <div class="v31-share-custom-grid">
            <label><span>RESOLUÇÃO</span><select id="v31ShareResolution"><option value="720" ${current.height === 720 ? 'selected' : ''}>720p</option><option value="1080" ${current.height === 1080 ? 'selected' : ''}>1080p</option></select></label>
            <label><span>TAXA DE QUADROS</span><select id="v31ShareFps"><option value="30" ${current.frameRate === 30 ? 'selected' : ''}>30 FPS</option><option value="60" ${current.frameRate === 60 ? 'selected' : ''}>60 FPS</option></select></label>
          </div>
        </section>

        <section class="v31-share-audio-note">
          <span>🔊</span><div><strong>Áudio da transmissão</strong><small>O navegador mostrará a opção de compartilhar áudio quando a origem escolhida permitir.</small></div>
        </section>

        <div class="v31-share-actions"><button type="button" class="secondary" data-cancel>Cancelar</button><button type="button" class="primary" id="v31StartShare">Escolher tela e transmitir</button></div>
      </section>`;
    document.body.appendChild(modal);

    let selectedMode = currentMode;
    const custom = modal.querySelector('#v31ShareCustom');
    const syncMode = mode => {
      selectedMode = mode;
      modal.querySelectorAll('[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
      custom.classList.toggle('hidden', mode !== 'custom');
    };

    modal.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => syncMode(button.dataset.mode));
    modal.querySelector('.v31-share-close').onclick = closeShareSetup;
    modal.querySelector('[data-cancel]').onclick = closeShareSetup;
    modal.onclick = event => { if (event.target === modal) closeShareSetup(); };

    modal.querySelector('#v31StartShare').onclick = async () => {
      const resolution = Number(modal.querySelector('#v31ShareResolution')?.value || 720);
      const fps = Number(modal.querySelector('#v31ShareFps')?.value || 30);
      const q = qualityFromMode(selectedMode, resolution, fps);
      closeShareSetup();
      await beginScreenShare(q);
    };
  }

  function wireScreenButton() {
    const button = document.querySelector('#screenBtn');
    if (!button || button.__v31Stage3) return;
    button.__v31Stage3 = true;
    button.onclick = async () => {
      if (!state.inVoice) return;
      if (window.__essenciaStage2Camera) {
        toast('Desligue a webcam antes de transmitir a tela.');
        return;
      }
      if (state.screenStream) {
        await stopScreen();
        return;
      }
      openShareSetup();
    };
  }

  wireScreenButton();
  const timer = setInterval(wireScreenButton, 700);
  window.addEventListener('beforeunload', () => clearInterval(timer), { once: true });
})();
