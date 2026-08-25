(() => {
  'use strict';

  const analysers = new Map();
  let wasInVoice = false;
  let lastSync = 0;

  const escSel = value => {
    if (window.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/["\\]/g, '\\$&');
  };

  function clearSpeakingClasses() {
    document.querySelectorAll('.speaking-lite').forEach(el => el.classList.remove('speaking-lite'));
  }

  function destroyAnalyser(key) {
    const entry = analysers.get(key);
    if (!entry) return;
    try { entry.source.disconnect(); } catch {}
    try { entry.analyser.disconnect(); } catch {}
    try { entry.sink.disconnect(); } catch {}
    analysers.delete(key);
  }

  function clearAnalysers() {
    for (const key of [...analysers.keys()]) destroyAnalyser(key);
  }

  function makeAnalyser(key, track, socketId, userId) {
    const ctx = state.audioContext;
    if (!ctx || !track || track.readyState === 'ended') return null;

    const current = analysers.get(key);
    if (current?.trackId === track.id) {
      current.socketId = socketId;
      current.userId = userId;
      return current;
    }

    destroyAnalyser(key);

    try {
      const holder = new MediaStream([track]);
      const source = ctx.createMediaStreamSource(holder);
      const analyser = ctx.createAnalyser();
      const sink = ctx.createGain();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.45;
      sink.gain.value = 0;
      source.connect(analyser);
      analyser.connect(sink);
      sink.connect(ctx.destination);

      const entry = {
        key,
        trackId: track.id,
        holder,
        source,
        analyser,
        sink,
        data: new Uint8Array(analyser.fftSize),
        socketId,
        userId,
        lastVoiceAt: 0
      };
      analysers.set(key, entry);
      return entry;
    } catch {
      return null;
    }
  }

  function decorateVoiceLists() {
    const voiceChannels = (state.currentServer?.channels || []).filter(ch => ch.type === 'voice');
    const wraps = [...document.querySelectorAll('#voiceChannels .voice-channel-wrap')];

    wraps.forEach((wrap, channelIndex) => {
      const members = state.voiceStates?.[voiceChannels[channelIndex]?.id] || [];
      const items = [...wrap.querySelectorAll('.voice-participant')];
      items.forEach((item, index) => {
        const member = members[index];
        if (!member) return;
        if (member.socketId) item.dataset.speakingSocket = member.socketId;
        if (member.user?.id) item.dataset.speakingUser = member.user.id;
      });
    });
  }

  function uniqueActiveMembers() {
    let members = state.activeCallMembers || [];
    if (!members.length && state.inVoice) {
      members = [{ socketId: state.socket?.id || 'local', user: state.me }];
      for (const [socketId, user] of state.peerUsers || []) members.push({ socketId, user });
    }
    const seen = new Set();
    return members.filter(member => {
      const id = member?.user?.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function decorateActiveCall() {
    const items = [...document.querySelectorAll('#activeCallParticipants .active-call-person')];
    const members = uniqueActiveMembers().slice(0, items.length);
    items.forEach((item, index) => {
      const member = members[index];
      if (!member) return;
      if (member.socketId) item.dataset.speakingSocket = member.socketId;
      if (member.user?.id) item.dataset.speakingUser = member.user.id;
    });
  }

  function decorateStreamParticipants() {
    const people = [{ socketId: 'local', user: state.me }];
    for (const [socketId, user] of state.peerUsers || []) people.push({ socketId, user });
    const items = [...document.querySelectorAll('#streamParticipants .stream-participant')];
    items.forEach((item, index) => {
      const person = people[index];
      if (!person) return;
      item.dataset.speakingSocket = person.socketId;
      if (person.user?.id) item.dataset.speakingUser = person.user.id;
    });
  }

  function decorateAll() {
    decorateVoiceLists();
    decorateActiveCall();
    decorateStreamParticipants();
  }

  function wrapRenderer(name, decorateFn) {
    try {
      const original = globalThis[name];
      if (typeof original !== 'function' || original.__speakingLiteWrapped) return;
      const wrapped = function(...args) {
        const result = original.apply(this, args);
        queueMicrotask(decorateFn);
        return result;
      };
      wrapped.__speakingLiteWrapped = true;
      globalThis[name] = wrapped;
    } catch {}
  }

  // Em scripts clássicos algumas funções globais não ficam como propriedade de window.
  // As atribuições diretas abaixo cobrem esse caso sem alterar a lógica original.
  try {
    const original = renderChannels;
    renderChannels = function(...args) {
      const result = original.apply(this, args);
      queueMicrotask(decorateVoiceLists);
      return result;
    };
  } catch {}

  try {
    const original = renderActiveCallParticipants;
    renderActiveCallParticipants = function(...args) {
      const result = original.apply(this, args);
      queueMicrotask(decorateActiveCall);
      return result;
    };
  } catch {}

  try {
    const original = renderStreamOverlayParticipants;
    renderStreamOverlayParticipants = function(...args) {
      const result = original.apply(this, args);
      queueMicrotask(decorateStreamParticipants);
      return result;
    };
  } catch {}

  function syncAnalysers() {
    if (!state.inVoice || !state.audioContext) return;

    const live = new Set();
    const localTrack = state.localStream?.getAudioTracks?.()[0];
    if (localTrack && localTrack.readyState !== 'ended') {
      live.add('local');
      makeAnalyser('local', localTrack, 'local', state.me?.id);
    }

    for (const [socketId, media] of state.remoteMedia || []) {
      const track = media?.voiceAudio?.getAudioTracks?.()[0];
      if (!track || track.readyState === 'ended') continue;
      const key = `remote:${socketId}`;
      live.add(key);
      makeAnalyser(key, track, socketId, state.peerUsers?.get(socketId)?.id);
    }

    for (const key of [...analysers.keys()]) {
      if (!live.has(key)) destroyAnalyser(key);
    }

    decorateAll();
  }

  function isSpeaking(entry) {
    if (!entry) return false;
    entry.analyser.getByteTimeDomainData(entry.data);
    let sum = 0;
    for (let i = 0; i < entry.data.length; i++) {
      const value = (entry.data[i] - 128) / 128;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / entry.data.length);
    const now = performance.now();
    if (rms >= 0.022) entry.lastVoiceAt = now;
    return now - entry.lastVoiceAt < 320;
  }

  function setSpeaking(entry, speaking) {
    const socketId = entry.socketId;
    const userId = entry.userId;

    if (socketId === 'local') {
      document.querySelector('.video-tile[data-peer="local"]')?.classList.toggle('speaking-lite', speaking);
    } else if (socketId) {
      document.querySelector(`.video-tile[data-peer="${escSel(socketId)}"]`)?.classList.toggle('speaking-lite', speaking);
    }

    const nodes = [];
    if (socketId) nodes.push(...document.querySelectorAll(`[data-speaking-socket="${escSel(socketId)}"]`));
    if (userId) nodes.push(...document.querySelectorAll(`[data-speaking-user="${escSel(userId)}"]`));
    for (const node of nodes) node.classList.toggle('speaking-lite', speaking);
  }

  function tick() {
    if (!state.inVoice) {
      if (wasInVoice) {
        clearAnalysers();
        clearSpeakingClasses();
        wasInVoice = false;
      }
      return;
    }

    wasInVoice = true;
    const now = performance.now();
    if (now - lastSync > 850) {
      lastSync = now;
      syncAnalysers();
    }

    for (const entry of analysers.values()) {
      const isLocal = entry.key === 'local';
      const remoteMedia = isLocal ? null : state.remoteMedia?.get(entry.socketId);
      const muted = isLocal ? (state.muted || !state.micAvailable) : !!remoteMedia?.muted;
      setSpeaking(entry, !muted && isSpeaking(entry));
    }
  }

  const timer = setInterval(tick, 160);
  window.addEventListener('beforeunload', () => {
    clearInterval(timer);
    clearAnalysers();
  }, { once: true });
})();
