(() => {
  'use strict';

  let installedSocket = null;
  let socketAttachTimer = null;
  let socketDroppedDuringCall = false;
  let mediaReconnectTimer = null;
  let reconnectingMedia = false;
  const disconnectedSince = new Map();

  function canSendImageNow() {
    if (!state?.me || !state?.socket?.connected) return false;
    if (state.chatMode === 'dm' && state.currentDM) return true;
    return state.chatMode === 'server' && state.currentServer && state.currentChannel?.type === 'text';
  }

  async function uploadPastedImage(file) {
    if (!file || !canSendImageNow()) return;
    if (file.size > 20 * 1024 * 1024) {
      toast('A imagem deve ter no máximo 20 MB.');
      return;
    }

    try {
      toast('Colando imagem…');
      const form = new FormData();
      const extension = (file.type || '').includes('png') ? 'png' : (file.type || '').includes('webp') ? 'webp' : (file.type || '').includes('gif') ? 'gif' : 'jpg';
      const name = file.name && file.name !== 'image.png' ? file.name : `imagem-colada-${Date.now()}.${extension}`;
      const normalized = file.name === name ? file : new File([file], name, { type:file.type || 'image/png' });
      form.append('file', normalized);
      const data = await API('/api/upload', { method:'POST', body:form });
      sendCurrentMessage('', data.attachment);
    } catch (err) {
      toast(err.message || 'Não foi possível colar a imagem.');
    }
  }

  document.addEventListener('paste', event => {
    if (!canSendImageNow()) return;
    const items = [...(event.clipboardData?.items || [])];
    const imageItem = items.find(item => item.kind === 'file' && String(item.type || '').startsWith('image/'));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    event.preventDefault();
    uploadPastedImage(file);
  }, true);

  // Mantém a captura na resolução nativa o máximo possível e prioriza detalhes/texto.
  try {
    const mediaDevices = navigator.mediaDevices;
    if (mediaDevices?.getDisplayMedia && !mediaDevices.getDisplayMedia.__essenciaV26) {
      const originalGetDisplayMedia = mediaDevices.getDisplayMedia.bind(mediaDevices);
      const wrapped = async constraints => {
        let next = constraints;
        try {
          next = { ...(constraints || {}) };
          if (next.video && typeof next.video === 'object') {
            const video = { ...next.video };
            if (video.width && typeof video.width === 'object') video.width = { ideal:video.width.ideal || video.width.max || 1920 };
            if (video.height && typeof video.height === 'object') video.height = { ideal:video.height.ideal || video.height.max || 1080 };
            delete video.resizeMode;
            next.video = video;
          }
        } catch {}

        const stream = await originalGetDisplayMedia(next);
        const track = stream.getVideoTracks?.()[0];
        if (track) {
          try { track.contentHint = 'detail'; } catch {}
        }
        return stream;
      };
      wrapped.__essenciaV26 = true;
      mediaDevices.getDisplayMedia = wrapped;
    }
  } catch {}

  function sharpBitrate(quality = {}) {
    const width = Number(quality.width || 1280);
    const fps = Number(quality.frameRate || 30);
    if (width >= 1900 && fps >= 50) return 12000000;
    if (width >= 1900) return 9000000;
    if (fps >= 50) return 6500000;
    return 4000000;
  }

  try {
    const originalSetScreenSenderQuality = setScreenSenderQuality;
    setScreenSenderQuality = async function(pc, quality) {
      const videoSender = pc?.getSenders?.().find(sender => sender.track?.kind === 'video');
      if (!videoSender) return;
      try {
        if (videoSender.track) videoSender.track.contentHint = 'detail';
        const params = videoSender.getParameters();
        params.degradationPreference = 'maintain-resolution';
        params.encodings ||= [{}];
        if (!params.encodings.length) params.encodings = [{}];
        params.encodings[0].maxBitrate = Math.max(Number(quality?.bitrate || 0), sharpBitrate(quality));
        params.encodings[0].maxFramerate = Number(quality?.frameRate || 30);
        params.encodings[0].scaleResolutionDownBy = 1;
        await videoSender.setParameters(params);
      } catch {
        try { await originalSetScreenSenderQuality(pc, quality); } catch {}
      }
    };
  } catch {}

  function clearStaleRemotePeers() {
    for (const socketId of [...(state.peerConnections?.keys?.() || [])]) {
      try { removePeer(socketId); } catch {
        try { state.peerConnections.get(socketId)?.close?.(); } catch {}
        state.peerConnections?.delete?.(socketId);
        state.peerUsers?.delete?.(socketId);
        state.remoteMedia?.delete?.(socketId);
      }
    }
  }

  function joinServerRoomAgain(ctx) {
    return new Promise(resolve => {
      let finished = false;
      const timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        resolve({ ok:false, timeout:true });
      }, 3500);
      state.socket.emit('voice:join', { serverId:ctx.serverId, channelId:ctx.channelId }, ack => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve(ack || { ok:true });
      });
    });
  }

  async function rejoinMediaRoom() {
    if (!state.inVoice || !state.mediaContext || !state.socket?.connected || reconnectingMedia) return;
    reconnectingMedia = true;
    const ctx = { ...state.mediaContext };
    try {
      clearStaleRemotePeers();
      state.activeCallMembers = [];
      try { updateActiveCallBar(); } catch {}

      let result = { ok:true };
      if (ctx.kind === 'server' && ctx.serverId && ctx.channelId) {
        result = await joinServerRoomAgain(ctx);
      } else if (ctx.kind === 'dm' && ctx.friendId) {
        state.socket.emit('dmvoice:join', { friendId:ctx.friendId });
      }

      if (result?.ok === false && !result?.timeout) {
        toast(result.error || 'Não foi possível reconectar a chamada.');
        return;
      }

      setTimeout(() => {
        try { broadcastMediaState(); } catch {}
        try { renderVideoGrid(); } catch {}
      }, 450);
      if (!result?.timeout) toast('Chamada reconectada.');
    } finally {
      reconnectingMedia = false;
    }
  }

  function scheduleMediaRejoin(delay = 650) {
    clearTimeout(mediaReconnectTimer);
    mediaReconnectTimer = setTimeout(rejoinMediaRoom, delay);
  }

  function attachSocket() {
    const socket = state.socket;
    if (!socket || socket === installedSocket) return !!installedSocket;
    installedSocket = socket;

    socket.on('disconnect', () => {
      if (!state.inVoice) return;
      socketDroppedDuringCall = true;
      toast('Reconectando a chamada…');
    });

    socket.on('connect', () => {
      if (socketDroppedDuringCall && state.inVoice) {
        socketDroppedDuringCall = false;
        scheduleMediaRejoin(700);
      }
    });

    return true;
  }

  socketAttachTimer = setInterval(() => {
    if (attachSocket()) {
      clearInterval(socketAttachTimer);
      socketAttachTimer = null;
    }
  }, 250);

  // Recupera ICE/WebRTC quando só um caminho P2P falha, sem derrubar a sala inteira.
  const peerHealthTimer = setInterval(() => {
    if (!state.inVoice) {
      disconnectedSince.clear();
      return;
    }

    const now = Date.now();
    for (const [socketId, pc] of state.peerConnections || []) {
      const status = pc?.connectionState;
      if (status === 'connected') {
        disconnectedSince.delete(socketId);
        continue;
      }
      if (status === 'disconnected') {
        if (!disconnectedSince.has(socketId)) disconnectedSince.set(socketId, now);
        if (now - disconnectedSince.get(socketId) < 8000) continue;
      }
      if (status !== 'failed' && status !== 'disconnected') continue;
      disconnectedSince.set(socketId, now);
      try { pc.restartIce?.(); } catch {}
      try { renegotiateAll(); } catch {}
      break;
    }
  }, 3000);

  window.addEventListener('online', () => {
    if (state.inVoice && state.socket?.connected) scheduleMediaRejoin(400);
  });

  window.addEventListener('beforeunload', () => {
    if (socketAttachTimer) clearInterval(socketAttachTimer);
    clearInterval(peerHealthTimer);
    clearTimeout(mediaReconnectTimer);
  }, { once:true });
})();
