(() => {
  'use strict';

  const socketFeatures = new WeakSet();
  const speakingAnalysers = new Map();
  let presenceTimer = null;
  let notificationContext = null;
  let ringtoneTimer = null;
  let ringtoneStopTimer = null;
  let incomingCallerId = null;
  let outgoingFriendId = null;
  let notificationPermissionArmed = false;

  function notificationAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!notificationContext) notificationContext = new AudioCtx({ latencyHint: 'interactive' });
    if (notificationContext.state === 'suspended') notificationContext.resume().catch(() => {});
    return notificationContext;
  }

  function tone(freq, when, duration, gain = 0.055, type = 'sine') {
    const ctx = notificationAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(gain, when + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + duration + 0.03);
  }

  function playMessagePing() {
    const ctx = notificationAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    tone(880, t, 0.09, 0.045, 'sine');
    tone(1175, t + 0.09, 0.12, 0.04, 'sine');
  }

  function playRingPhrase(mode = 'incoming') {
    const ctx = notificationAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    if (mode === 'incoming') {
      tone(659, t, 0.18, 0.05, 'triangle');
      tone(784, t + 0.20, 0.18, 0.05, 'triangle');
      tone(988, t + 0.40, 0.26, 0.045, 'triangle');
    } else {
      tone(523, t, 0.16, 0.042, 'sine');
      tone(659, t + 0.18, 0.16, 0.042, 'sine');
      tone(784, t + 0.36, 0.22, 0.042, 'sine');
    }
  }

  function updateRingingIndicator(text = '') {
    let el = document.querySelector('#v13RingingIndicator');
    if (!text) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'v13RingingIndicator';
      el.className = 'call-ringing-indicator';
      document.body.appendChild(el);
    }
    el.textContent = text;
  }

  function startRingtone(mode, label) {
    stopRingtone();
    playRingPhrase(mode);
    ringtoneTimer = setInterval(() => playRingPhrase(mode), 1650);
    ringtoneStopTimer = setTimeout(stopRingtone, 30000);
    updateRingingIndicator(label || (mode === 'incoming' ? 'Chamada recebida…' : 'Chamando…'));
  }

  function stopRingtone() {
    if (ringtoneTimer) clearInterval(ringtoneTimer);
    if (ringtoneStopTimer) clearTimeout(ringtoneStopTimer);
    ringtoneTimer = null;
    ringtoneStopTimer = null;
    updateRingingIndicator('');
  }

  function requestNotificationsOnGesture() {
    if (notificationPermissionArmed) return;
    notificationPermissionArmed = true;
    notificationAudioContext();
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }
  document.addEventListener('pointerdown', requestNotificationsOnGesture, { once: true, capture: true });
  document.addEventListener('keydown', requestNotificationsOnGesture, { once: true, capture: true });

  function desktopNotify(title, body, avatar = '') {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!document.hidden) return;
    try {
      const icon = avatar ? new URL(avatar, location.origin).href : undefined;
      const n = new Notification(title, { body, icon, tag: `essencia-${Date.now()}` });
      setTimeout(() => n.close(), 6500);
    } catch {}
  }

  function friendPresenceLabel(friend) {
    return friend?.online ? 'Online' : 'Offline';
  }

  function applyFriendPresence() {
    if (!state.friends) return;

    const activeHome = document.querySelector('.nav-item.active')?.dataset.home;
    if (activeHome === 'friends' && !document.querySelector('#homeView')?.classList.contains('hidden')) {
      const rows = [...document.querySelectorAll('#homeContent .person-row')];
      (state.friends.friends || []).forEach((friend, index) => {
        const row = rows[index];
        if (!row) return;
        row.dataset.userId = friend.id;
        row.classList.toggle('friend-online', !!friend.online);
        row.classList.toggle('friend-offline', !friend.online);
        const dot = row.querySelector('.status-dot');
        dot?.classList.toggle('offline', !friend.online);
        const meta = row.querySelector('.person-meta small');
        if (meta) {
          meta.querySelector('.presence-text')?.remove();
          const status = document.createElement('span');
          status.className = `presence-text ${friend.online ? 'online' : 'offline'}`;
          status.textContent = `• ${friendPresenceLabel(friend)}`;
          meta.appendChild(status);
        }
      });
    }

    const dmButtons = [...document.querySelectorAll('#dmFriends .dm-item')];
    (state.friends.friends || []).forEach((friend, index) => {
      const button = dmButtons[index];
      if (!button) return;
      button.dataset.userId = friend.id;
      button.classList.toggle('friend-offline', !friend.online);
      let dot = button.querySelector('.dm-presence');
      if (!dot) {
        dot = document.createElement('i');
        dot.className = 'dm-presence';
        button.appendChild(dot);
      }
      dot.classList.toggle('offline', !friend.online);
      button.title = `${friend.nick} • ${friendPresenceLabel(friend)}`;
    });
  }

  function applyMemberPresence() {
    for (const member of state.serverMembers || []) {
      const row = document.querySelector(`#membersList .member-row[data-member-id="${CSS.escape(member.id)}"]`);
      if (!row) continue;
      row.classList.toggle('member-online', !!member.online);
      row.classList.toggle('member-offline', !member.online);
      const dot = row.querySelector('.member-presence');
      dot?.classList.toggle('offline', !member.online);
      row.title = `${member.nick || member.username} • ${member.online ? 'Online' : 'Offline'}`;
    }
  }

  function schedulePresenceRefresh() {
    clearTimeout(presenceTimer);
    presenceTimer = setTimeout(async () => {
      try { await loadFriends(); } catch {}
      if (state.currentServer) {
        try { await loadMembers(); } catch {}
      }
      applyFriendPresence();
      applyMemberPresence();
    }, 180);
  }

  const originalRenderHomeContent = renderHomeContent;
  renderHomeContent = function(...args) {
    const result = originalRenderHomeContent.apply(this, args);
    queueMicrotask(applyFriendPresence);
    return result;
  };

  const originalRenderDmFriends = renderDmFriends;
  renderDmFriends = function(...args) {
    const result = originalRenderDmFriends.apply(this, args);
    queueMicrotask(applyFriendPresence);
    return result;
  };

  const originalRenderMembersList = renderMembersList;
  renderMembersList = function(...args) {
    const result = originalRenderMembersList.apply(this, args);
    queueMicrotask(applyMemberPresence);
    return result;
  };

  function decorateSpeakingTargets() {
    const voiceChannels = (state.currentServer?.channels || []).filter(ch => ch.type === 'voice');
    const wraps = [...document.querySelectorAll('#voiceChannels .voice-channel-wrap')];
    wraps.forEach((wrap, index) => {
      const members = state.voiceStates[voiceChannels[index]?.id] || [];
      const items = [...wrap.querySelectorAll('.voice-participant')];
      items.forEach((item, i) => {
        const user = members[i]?.user;
        if (user?.id) item.dataset.speakingUser = user.id;
        if (members[i]?.socketId) item.dataset.speakingSocket = members[i].socketId;
      });
    });

    const streamItems = [...document.querySelectorAll('#streamParticipants .stream-participant')];
    const streamPeople = [{ id: 'local', user: state.me }, ...[...state.peerUsers].map(([id, user]) => ({ id, user }))];
    streamItems.forEach((item, i) => {
      const person = streamPeople[i];
      if (person?.user?.id) item.dataset.speakingUser = person.user.id;
      if (person?.id) item.dataset.speakingSocket = person.id;
    });

    for (const item of document.querySelectorAll('#activeCallParticipants .active-call-person')) {
      const name = item.querySelector('span')?.textContent?.trim();
      const peer = [...state.peerUsers].find(([, user]) => (user?.nick || user?.username) === name);
      if (peer) {
        item.dataset.speakingSocket = peer[0];
        item.dataset.speakingUser = peer[1]?.id || '';
      } else if ((state.me?.nick || state.me?.username) === name) {
        item.dataset.speakingSocket = 'local';
        item.dataset.speakingUser = state.me.id;
      }
    }
  }

  const originalRenderChannels = renderChannels;
  renderChannels = function(...args) {
    const result = originalRenderChannels.apply(this, args);
    queueMicrotask(decorateSpeakingTargets);
    return result;
  };

  const originalRenderStreamOverlayParticipants = renderStreamOverlayParticipants;
  renderStreamOverlayParticipants = function(...args) {
    const result = originalRenderStreamOverlayParticipants.apply(this, args);
    queueMicrotask(decorateSpeakingTargets);
    return result;
  };

  if (typeof renderActiveCallParticipants === 'function') {
    const originalRenderActiveCallParticipants = renderActiveCallParticipants;
    renderActiveCallParticipants = function(...args) {
      const result = originalRenderActiveCallParticipants.apply(this, args);
      queueMicrotask(decorateSpeakingTargets);
      return result;
    };
  }

  function cleanupAnalyser(key) {
    const entry = speakingAnalysers.get(key);
    if (!entry) return;
    try { entry.source.disconnect(); } catch {}
    try { entry.analyser.disconnect(); } catch {}
    speakingAnalysers.delete(key);
  }

  function ensureSpeakingAnalyser(key, stream, meta) {
    const track = stream?.getAudioTracks?.()[0];
    if (!track || track.readyState === 'ended' || !state.audioContext) {
      cleanupAnalyser(key);
      return null;
    }
    const current = speakingAnalysers.get(key);
    if (current?.trackId === track.id) {
      current.meta = meta;
      return current;
    }
    cleanupAnalyser(key);
    try {
      const holder = new MediaStream([track]);
      const source = state.audioContext.createMediaStreamSource(holder);
      const analyser = state.audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.55;
      source.connect(analyser);
      const entry = {
        trackId: track.id,
        holder,
        source,
        analyser,
        data: new Uint8Array(analyser.fftSize),
        lastActive: 0,
        meta
      };
      speakingAnalysers.set(key, entry);
      return entry;
    } catch {
      return null;
    }
  }

  function analyserSpeaking(entry, muted = false) {
    if (!entry || muted) return false;
    entry.analyser.getByteTimeDomainData(entry.data);
    let sum = 0;
    for (const value of entry.data) {
      const n = (value - 128) / 128;
      sum += n * n;
    }
    const rms = Math.sqrt(sum / entry.data.length);
    const now = performance.now();
    if (rms > 0.028) entry.lastActive = now;
    return now - entry.lastActive < 260;
  }

  function applySpeakingState(socketId, userId, speaking) {
    if (socketId === 'local') {
      document.querySelector('.video-tile[data-peer="local"]')?.classList.toggle('speaking', speaking);
    } else if (socketId) {
      document.querySelector(`.video-tile[data-peer="${CSS.escape(socketId)}"]`)?.classList.toggle('speaking', speaking);
    }
    const selectors = [];
    if (socketId) selectors.push(`[data-speaking-socket="${CSS.escape(socketId)}"]`);
    if (userId) selectors.push(`[data-speaking-user="${CSS.escape(userId)}"]`);
    if (selectors.length) {
      for (const node of document.querySelectorAll(selectors.join(','))) node.classList.toggle('speaking', speaking);
    }
  }

  async function monitorSpeaking() {
    if (!state.inVoice) {
      for (const key of [...speakingAnalysers.keys()]) cleanupAnalyser(key);
      document.querySelectorAll('.speaking').forEach(el => el.classList.remove('speaking'));
      return;
    }

    if (!state.audioContext) {
      try { await ensureAudioEngine(); } catch {}
      if (!state.audioContext) return;
    }

    const liveKeys = new Set();
    if (state.localStream?.getAudioTracks?.().length) {
      liveKeys.add('local');
      const entry = ensureSpeakingAnalyser('local', state.localStream, { socketId: 'local', userId: state.me?.id });
      applySpeakingState('local', state.me?.id, analyserSpeaking(entry, state.muted || !state.micAvailable));
    }

    for (const [socketId, media] of state.remoteMedia) {
      const key = `remote:${socketId}`;
      liveKeys.add(key);
      const user = state.peerUsers.get(socketId);
      const entry = ensureSpeakingAnalyser(key, media.voiceAudio, { socketId, userId: user?.id });
      applySpeakingState(socketId, user?.id, analyserSpeaking(entry, media.muted));
    }

    for (const key of [...speakingAnalysers.keys()]) {
      if (!liveKeys.has(key)) cleanupAnalyser(key);
    }
    decorateSpeakingTargets();
  }
  setInterval(() => monitorSpeaking().catch(() => {}), 95);

  const originalStartDmCall = startDmCall;
  startDmCall = async function(friend, ring = true) {
    if (ring && friend) {
      outgoingFriendId = friend.id;
      startRingtone('outgoing', `Chamando ${friend.nick || friend.username}…`);
    }
    try {
      return await originalStartDmCall.call(this, friend, ring);
    } catch (err) {
      stopRingtone();
      throw err;
    }
  };

  const originalLeaveVoice = leaveVoice;
  leaveVoice = async function(...args) {
    stopRingtone();
    outgoingFriendId = null;
    return originalLeaveVoice.apply(this, args);
  };

  function attachSocketFeatures() {
    const socket = state.socket;
    if (!socket || socketFeatures.has(socket)) return;
    socketFeatures.add(socket);

    socket.on('presence:update', schedulePresenceRefresh);

    socket.on('dm:notify', payload => {
      const from = payload?.from;
      if (!from || from.id === state.me?.id) return;
      playMessagePing();
      const body = payload.message?.text || (payload.message?.attachment ? 'Enviou um arquivo.' : 'Nova mensagem.');
      desktopNotify(`Mensagem de ${from.nick || from.username}`, body, from.avatar);
    });

    socket.on('message:notify', payload => {
      const from = payload?.from;
      if (!from || from.id === state.me?.id) return;
      playMessagePing();
      const bodyText = payload.message?.text || (payload.message?.attachment ? 'Enviou um arquivo.' : 'Nova mensagem.');
      desktopNotify(`${from.nick || from.username} em #${payload.channelName || 'canal'}`, bodyText, from.avatar);
      const currentlyThere = state.currentServer?.id === payload.serverId && state.currentChannel?.id === payload.channelId;
      if (!currentlyThere) toast(`${from.nick || from.username}: nova mensagem em #${payload.channelName || 'canal'}.`);
    });

    socket.on('dmcall:incoming', ({ from }) => {
      if (!from) return;
      incomingCallerId = from.id;
      startRingtone('incoming', `${from.nick || from.username} está chamando…`);
      desktopNotify('Chamada recebida', `${from.nick || from.username} está chamando você.`, from.avatar);
    });

    socket.on('dmcall:declined', ({ from }) => {
      stopRingtone();
      outgoingFriendId = null;
      toast(`${from?.nick || 'A pessoa'} recusou a chamada.`);
    });

    socket.on('voice:user-joined', () => {
      stopRingtone();
      outgoingFriendId = null;
    });
    socket.on('voice:peers', peers => {
      if (peers?.length) {
        stopRingtone();
        outgoingFriendId = null;
      }
    });
    socket.on('webrtc:answer', () => {
      stopRingtone();
      outgoingFriendId = null;
    });
  }

  setInterval(attachSocketFeatures, 250);
  attachSocketFeatures();

  const modalConfirm = document.querySelector('#modalConfirm');
  const modalCancel = document.querySelector('#modalCancel');
  const modalClose = document.querySelector('#modalClose');

  modalConfirm?.addEventListener('click', () => {
    if (incomingCallerId) {
      stopRingtone();
      incomingCallerId = null;
    }
  }, true);

  const declineIncoming = () => {
    if (incomingCallerId && state.socket) {
      state.socket.emit('dmcall:decline', { friendId: incomingCallerId });
    }
    incomingCallerId = null;
    stopRingtone();
  };
  modalCancel?.addEventListener('click', declineIncoming, true);
  modalClose?.addEventListener('click', declineIncoming, true);

  const observer = new MutationObserver(() => {
    applyFriendPresence();
    applyMemberPresence();
    decorateSpeakingTargets();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
