(() => {
  'use strict';

  const DEVICE_KEY = 'essencia_media_devices_v31';
  let devices = { audioinput:'', audiooutput:'' };
  try { devices = { ...devices, ...(JSON.parse(localStorage.getItem(DEVICE_KEY) || '{}') || {}) }; } catch {}

  function saveDevices() {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(devices));
  }

  function stripNavEmoji() {
    const map = new Map([
      ['Minha conta','Minha conta'],
      ['Perfil','Perfil'],
      ['Aparência','Aparência'],
      ['Sair','Sair'],
      ['Servidor','Servidor'],
      ['Moderação','Moderação'],
      ['Banimentos','Banimentos'],
      ['Cargos','Cargos'],
      ['Convites','Convites'],
      ['Canais','Canais']
    ]);
    document.querySelectorAll('.v17-settings-nav button,.v21-admin-nav button,.v19-admin-nav button').forEach(btn => {
      const raw = (btn.textContent || '').trim();
      const clean = raw.replace(/^[^\p{L}\p{N}#]+/u,'').trim();
      if (clean && btn.textContent !== clean) btn.textContent = map.get(clean) || clean;
    });
  }

  function markCallMode() {
    const voice = document.querySelector('#voiceView');
    if (!voice) return;
    voice.classList.toggle('v31-dm-call', state?.mediaContext?.kind === 'dm');
  }

  function syncMuteVisual() {
    document.querySelector('#globalMuteBtn')?.classList.toggle('v31-muted', !!state?.muted);
    document.querySelector('#micBtn')?.classList.toggle('v31-muted', !!state?.muted);
  }

  function forceMicMuted(muted) {
    if (!state?.inVoice) return;
    if (!state.micAvailable) return;
    state.muted = !!muted;
    state.localStream?.getAudioTracks?.().forEach(track => { track.enabled = !state.muted; });
    try { updateMicButton(); } catch {}
    try { renderVideoGrid(); } catch {}
    try { broadcastMediaState(); } catch {}
    syncMuteVisual();
  }

  // O botão de áudio (deafen) também muta o microfone; ao reativar áudio, mantém o mic mutado
  // até o usuário decidir desmutar, evitando transmissão acidental.
  function wireDeafenSync() {
    const btn = document.querySelector('#v21DeafenBtn');
    if (!btn || btn.__v31Sync) return;
    btn.__v31Sync = true;
    btn.addEventListener('click', () => {
      setTimeout(() => {
        if (btn.classList.contains('active')) forceMicMuted(true);
        syncMuteVisual();
      }, 0);
    });
  }

  async function enumerateMedia() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      return list.filter(d => d.kind === 'audioinput' || d.kind === 'audiooutput');
    } catch { return []; }
  }

  async function switchMicrophone(deviceId) {
    if (!deviceId || !navigator.mediaDevices?.getUserMedia) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId:{ exact:deviceId },
        echoCancellation:true,
        noiseSuppression:true,
        autoGainControl:true
      },
      video:false
    });
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error('Microfone indisponível.');

    if (state.inVoice) {
      const oldTracks = state.localStream?.getAudioTracks?.() || [];
      for (const pc of state.peerConnections?.values?.() || []) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'audio' && oldTracks.includes(s.track));
        if (sender) await sender.replaceTrack(track);
      }
      oldTracks.forEach(t => { try { t.stop(); } catch {} });
      state.localStream = new MediaStream([track]);
      state.micAvailable = true;
      track.enabled = !state.muted;
      try { updateMicButton(); } catch {}
      try { broadcastMediaState(); } catch {}
    } else {
      stream.getTracks().forEach(t => t.stop());
    }
  }

  async function applyOutputDevice(deviceId) {
    if (!deviceId) return;
    const media = [...document.querySelectorAll('audio,video')];
    let applied = 0;
    for (const el of media) {
      if (typeof el.setSinkId !== 'function') continue;
      try { await el.setSinkId(deviceId); applied++; } catch {}
    }
    return applied;
  }

  async function renderDeviceSettings() {
    const box = document.querySelector('#v17SettingsContent');
    if (!box) return;
    let list = await enumerateMedia();
    if (!list.length) {
      try {
        const tmp = await navigator.mediaDevices.getUserMedia({audio:true,video:false});
        tmp.getTracks().forEach(t=>t.stop());
        list = await enumerateMedia();
      } catch {}
    }

    const mics = list.filter(d=>d.kind==='audioinput');
    const outs = list.filter(d=>d.kind==='audiooutput');
    const opts = (rows, selected, fallback) => [`<option value="">${fallback}</option>`, ...rows.map((d,i)=>`<option value="${escapeHtml(d.deviceId)}" ${d.deviceId===selected?'selected':''}>${escapeHtml(d.label || `${fallback} ${i+1}`)}</option>`)].join('');

    box.innerHTML = `
      <div class="v31-device-settings">
        <h2>Voz e áudio</h2>
        <p>Escolha o microfone e a saída de áudio que o Essência deve usar neste dispositivo.</p>
        <div class="v31-device-grid">
          <div class="v31-device-card">
            <label>MICROFONE</label>
            <select id="v31MicSelect">${opts(mics,devices.audioinput,'Padrão do sistema')}</select>
            <small class="v31-device-note">A troca pode ser feita durante a chamada.</small>
          </div>
          <div class="v31-device-card">
            <label>SAÍDA DE ÁUDIO</label>
            <select id="v31OutputSelect">${opts(outs,devices.audiooutput,'Padrão do sistema')}</select>
            <small class="v31-device-note">A seleção de saída depende do suporte do navegador. Chrome/Edge normalmente suportam.</small>
          </div>
        </div>
        <div class="v31-device-actions">
          <button id="v31RefreshDevices" class="v17-ghost-btn" type="button">Atualizar dispositivos</button>
          <button id="v31SaveDevices" class="v17-save-btn" type="button">Aplicar</button>
        </div>
      </div>`;

    document.querySelector('#v31RefreshDevices').onclick = renderDeviceSettings;
    document.querySelector('#v31SaveDevices').onclick = async () => {
      const mic = document.querySelector('#v31MicSelect')?.value || '';
      const out = document.querySelector('#v31OutputSelect')?.value || '';
      try {
        if (mic && mic !== devices.audioinput) await switchMicrophone(mic);
        if (out) await applyOutputDevice(out);
        devices.audioinput = mic;
        devices.audiooutput = out;
        saveDevices();
        toast('Dispositivos de voz atualizados.');
      } catch (err) { toast(err.message || 'Não foi possível trocar o dispositivo.'); }
    };
  }

  function installDeviceTab() {
    const nav = document.querySelector('.v17-settings-nav');
    if (!nav || nav.querySelector('[data-tab="voice-devices"]')) return;
    const appearance = nav.querySelector('[data-tab="appearance"]');
    const btn = document.createElement('button');
    btn.className = 'v17-settings-tab';
    btn.dataset.tab = 'voice-devices';
    btn.textContent = 'Voz e áudio';
    btn.onclick = () => {
      nav.querySelectorAll('.v17-settings-tab').forEach(x=>x.classList.toggle('active',x===btn));
      renderDeviceSettings();
    };
    nav.insertBefore(btn, appearance || nav.querySelector('[data-tab="logout"]'));
  }

  // Se houver saída escolhida, aplica aos elementos que forem criados depois.
  const mediaObserver = new MutationObserver(mutations => {
    if (!devices.audiooutput) return;
    for (const m of mutations) for (const n of m.addedNodes || []) {
      if (!(n instanceof Element)) continue;
      const list = n.matches?.('audio,video') ? [n] : [...n.querySelectorAll?.('audio,video') || []];
      list.forEach(el => { if (typeof el.setSinkId === 'function') el.setSinkId(devices.audiooutput).catch(()=>{}); });
    }
  });
  mediaObserver.observe(document.body,{childList:true,subtree:true});

  // Mantém integração sem substituir funções centrais do app.
  const timer = setInterval(() => {
    installDeviceTab();
    wireDeafenSync();
    stripNavEmoji();
    markCallMode();
    syncMuteVisual();
  }, 700);

  window.addEventListener('beforeunload',()=>{clearInterval(timer);mediaObserver.disconnect();},{once:true});
})();
