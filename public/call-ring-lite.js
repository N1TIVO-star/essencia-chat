(() => {
  'use strict';

  let installedSocket = null;
  let attachTimer = null;
  let audioCtx = null;
  let ringTimer = null;
  let stopTimer = null;

  function ensureAudio() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtx) audioCtx = new AudioCtx({ latencyHint: 'interactive' });
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function playTone(freq, at, duration, gain = 0.04) {
    const ctx = ensureAudio();
    if (!ctx) return;
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
  }

  function playRing(kind = 'incoming') {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    if (kind === 'incoming') {
      playTone(660, t, 0.16, 0.045);
      playTone(880, t + 0.18, 0.18, 0.04);
      playTone(1046, t + 0.40, 0.22, 0.038);
    } else {
      playTone(523, t, 0.13, 0.032);
      playTone(659, t + 0.16, 0.13, 0.032);
      playTone(784, t + 0.32, 0.17, 0.03);
    }
  }

  function stopRinging() {
    if (ringTimer) clearInterval(ringTimer);
    if (stopTimer) clearTimeout(stopTimer);
    ringTimer = null;
    stopTimer = null;
  }

  function startRinging(kind) {
    stopRinging();
    playRing(kind);
    ringTimer = setInterval(() => playRing(kind), 1800);
    stopTimer = setTimeout(stopRinging, 30000);
  }

  document.addEventListener('pointerdown', ensureAudio, { once: true, capture: true });
  document.addEventListener('keydown', ensureAudio, { once: true, capture: true });

  const originalStartDmCall = startDmCall;
  startDmCall = async function(friend, ring = true) {
    if (ring) startRinging('outgoing');
    try {
      const result = await originalStartDmCall.apply(this, arguments);
      return result;
    } catch (err) {
      stopRinging();
      throw err;
    }
  };

  const originalEnterMediaRoom = enterMediaRoom;
  enterMediaRoom = async function(...args) {
    const result = await originalEnterMediaRoom.apply(this, args);
    stopRinging();
    return result;
  };

  const originalLeaveVoice = leaveVoice;
  leaveVoice = async function(...args) {
    stopRinging();
    return originalLeaveVoice.apply(this, args);
  };

  const originalCloseModal = closeModal;
  closeModal = function(...args) {
    stopRinging();
    return originalCloseModal.apply(this, args);
  };

  function attachSocket() {
    const socket = state.socket;
    if (!socket || socket === installedSocket) return !!installedSocket;
    installedSocket = socket;

    socket.on('dmcall:incoming', () => {
      startRinging('incoming');
    });

    socket.on('voice:peers', () => {
      if (state.mediaContext?.kind === 'dm') stopRinging();
    });

    socket.on('voice:user-joined', () => {
      if (state.mediaContext?.kind === 'dm') stopRinging();
    });

    socket.on('disconnect', stopRinging);
    return true;
  }

  attachTimer = setInterval(() => {
    if (attachSocket()) {
      clearInterval(attachTimer);
      attachTimer = null;
    }
  }, 250);

  window.addEventListener('beforeunload', () => {
    stopRinging();
    if (attachTimer) clearInterval(attachTimer);
  }, { once: true });
})();
