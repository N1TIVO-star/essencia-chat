(() => {
  'use strict';

  let installedSocket = null;
  let attachTimer = null;
  let audioCtx = null;
  let notificationsRequested = false;

  function ensureAudio() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtx) audioCtx = new AudioCtx({ latencyHint: 'interactive' });
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function ping() {
    const ctx = ensureAudio();
    if (!ctx) return;
    const start = ctx.currentTime + 0.01;

    const play = (freq, at, duration, gain) => {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, at);
      amp.gain.setValueAtTime(0.0001, at);
      amp.gain.exponentialRampToValueAtTime(gain, at + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      osc.connect(amp);
      amp.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + duration + 0.03);
    };

    play(880, start, 0.08, 0.035);
    play(1175, start + 0.08, 0.11, 0.03);
  }

  function armNotifications() {
    if (notificationsRequested) return;
    notificationsRequested = true;
    ensureAudio();
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }

  document.addEventListener('pointerdown', armNotifications, { once: true, capture: true });
  document.addEventListener('keydown', armNotifications, { once: true, capture: true });

  function browserNotify(title, body, avatar = '') {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!document.hidden) return;
    try {
      const icon = avatar ? new URL(avatar, location.origin).href : undefined;
      const n = new Notification(title, {
        body,
        icon,
        tag: `essencia-message-${Date.now()}`,
        silent: true
      });
      setTimeout(() => n.close(), 6000);
    } catch {}
  }

  function messageBody(payload) {
    const text = String(payload?.message?.text || '').trim();
    if (text) return text.slice(0, 140);
    if (payload?.message?.attachment) return 'Enviou um arquivo.';
    return 'Nova mensagem.';
  }

  function shouldNotifyDm(payload) {
    const from = payload?.from;
    if (!from || from.id === state.me?.id) return false;
    return !state.currentDM || state.currentDM.id !== from.id || document.hidden;
  }

  function shouldNotifyServer(payload) {
    const from = payload?.from;
    if (!from || from.id === state.me?.id) return false;
    const currentlyOpen = state.chatMode === 'server' &&
      state.currentServer?.id === payload.serverId &&
      state.currentChannel?.id === payload.channelId &&
      !document.hidden;
    return !currentlyOpen;
  }

  function attachSocket() {
    const socket = state.socket;
    if (!socket || socket === installedSocket) return !!installedSocket;
    installedSocket = socket;

    socket.on('dm:notify', payload => {
      if (!shouldNotifyDm(payload)) return;
      ping();
      const from = payload?.from;
      browserNotify(
        from?.nick || from?.username || 'Nova mensagem',
        messageBody(payload),
        from?.avatar || ''
      );
    });

    socket.on('message:notify', payload => {
      if (!shouldNotifyServer(payload)) return;
      ping();
      const from = payload?.from;
      const channel = payload?.channelName ? `#${payload.channelName}` : 'servidor';
      browserNotify(
        `${from?.nick || from?.username || 'Alguém'} em ${channel}`,
        messageBody(payload),
        from?.avatar || ''
      );
      if (!document.hidden) {
        toast(`Nova mensagem de ${from?.nick || from?.username || 'alguém'} em ${channel}.`);
      }
    });

    return true;
  }

  attachTimer = setInterval(() => {
    if (attachSocket()) {
      clearInterval(attachTimer);
      attachTimer = null;
    }
  }, 250);

  window.addEventListener('beforeunload', () => {
    if (attachTimer) clearInterval(attachTimer);
  }, { once: true });
})();
