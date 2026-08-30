const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const state = {
  token: localStorage.getItem("essencia_token") || "",
  me: null,
  servers: [],
  friends: null,
  currentServer: null,
  currentChannel: null,
  currentDM: null,
  chatMode: null,
  voiceStates: {},
  serverMembers: [],
  activeCallMembers: [],
  socket: null,
  peerConnections: new Map(),
  peerUsers: new Map(),
  remoteMedia: new Map(),
  localStream: null,
  screenStream: null,
  inVoice: false,
  streamOverlayPeer: null,
  streamVolumeContextPeer: null,
  mediaContext: null,
  muted: false,
  micAvailable: true,
  audioContext: null,
  volumePrefs: (() => {
    try {
      return JSON.parse(localStorage.getItem("essencia_volume_prefs") || "{}");
    } catch {
      return {};
    }
  })(),
  quality: (() => {
    const fallback = { width: 1280, height: 720, frameRate: 30, bitrate: 2500000, label: "720p · 30 FPS" };
    try {
      const saved = JSON.parse(localStorage.getItem("essencia_stream_quality"));
      if (!saved) return fallback;
      const bitrateByLabel = {
        "720p · 30 FPS": 2500000,
        "720p · 60 FPS": 4500000,
        "1080p · 30 FPS": 5500000,
        "1080p · 60 FPS": 8500000
      };
      return { ...fallback, ...saved, bitrate: saved.bitrate || bitrateByLabel[saved.label] || fallback.bitrate };
    } catch {
      return fallback;
    }
  })()
};

const API = async (url, opts = {}) => {
  opts.headers ||= {};
  if (state.token) opts.headers.Authorization = `Bearer ${state.token}`;

  if (!(opts.body instanceof FormData) && opts.body && typeof opts.body !== "string") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }

  const response = await fetch(url, opts);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Erro na operação.");
  return data;
};

const esc = v => {
  const d = document.createElement("div");
  d.textContent = String(v ?? "");
  return d.innerHTML;
};

function avatarUrl(user) {
  if (user?.avatar) return user.avatar;
  const initial = (user?.nick || user?.username || "?")[0]?.toUpperCase() || "?";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#745cff"/><stop offset="1" stop-color="#18a7c7"/></linearGradient></defs><rect width="80" height="80" rx="40" fill="url(#g)"/><text x="40" y="50" text-anchor="middle" fill="white" font-size="30" font-family="Arial" font-weight="700">${initial}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}


function isMobileLayout() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function syncMobileViewport() {
  const viewport = window.visualViewport;
  const height = Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight);
  document.documentElement.style.setProperty("--app-height", `${height}px`);
}

function updateMobileScrim() {
  const scrim = $("#mobileScrim");
  if (!scrim || !isMobileLayout()) {
    scrim?.classList.remove("show");
    scrim?.classList.add("hidden");
    return;
  }

  const navOpen = $(".server-rail")?.classList.contains("open") || $(".sidebar")?.classList.contains("open");
  const membersOpen = !$("#membersPanel")?.classList.contains("hidden");
  const shouldShow = navOpen || membersOpen;

  scrim.classList.toggle("hidden", !shouldShow);
  scrim.classList.toggle("show", shouldShow);
}

function openMobileNav() {
  if (!isMobileLayout()) return;
  $(".server-rail")?.classList.add("open");
  $(".sidebar")?.classList.add("open");
  updateMobileScrim();
}

function closeMobileNav() {
  $(".server-rail")?.classList.remove("open");
  $(".sidebar")?.classList.remove("open");
  updateMobileScrim();
}

function closeMobileMembers() {
  if (!isMobileLayout()) return;
  $("#membersPanel")?.classList.add("hidden");
  $("#membersPanel")?.classList.remove("server-visible");
  updateMobileScrim();
}

function closeMobilePanels() {
  closeMobileNav();
  closeMobileMembers();
}

function showAuth() {
  $("#authScreen").classList.remove("hidden");
  $("#app").classList.add("hidden");
}
function showApp() {
  $("#authScreen").classList.add("hidden");
  $("#app").classList.remove("hidden");
}

let authMode = "login";
$("#loginTab").onclick = () => setAuthMode("login");
$("#registerTab").onclick = () => setAuthMode("register");
$("#togglePasswordBtn").onclick = () => {
  const input = $("#authPassword");
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  $("#togglePasswordBtn").textContent = showing ? "👁" : "🙈";
  $("#togglePasswordBtn").title = showing ? "Mostrar senha" : "Ocultar senha";
  $("#togglePasswordBtn").setAttribute("aria-label", showing ? "Mostrar senha" : "Ocultar senha");
};

function setAuthMode(mode) {
  authMode = mode;
  $("#loginTab").classList.toggle("active", mode === "login");
  $("#registerTab").classList.toggle("active", mode === "register");
  $("#authSubmit").textContent = mode === "login" ? "Entrar" : "Criar conta";
  $("#authPassword").autocomplete = mode === "login" ? "current-password" : "new-password";
  $("#authError").textContent = "";
}

$("#authForm").onsubmit = async e => {
  e.preventDefault();
  $("#authError").textContent = "";
  try {
    const data = await API(`/api/${authMode}`, {
      method: "POST",
      body: {
        username: $("#authUsername").value,
        password: $("#authPassword").value
      }
    });
    state.token = data.token;
    state.me = data.user;
    localStorage.setItem("essencia_token", state.token);
    await boot({ userFromLogin: data.user });
  } catch (err) {
    $("#authError").textContent = err.message;
  }
};

async function boot(options = {}) {
  // Só uma sessão realmente inválida deve mandar o usuário de volta ao login.
  // Falhas em amigos/servidores/socket não podem mais derrubar a sessão inteira.
  try {
    if (options.userFromLogin) {
      state.me = options.userFromLogin;
    } else {
      const me = await API("/api/me");
      state.me = me.user;
    }
  } catch (err) {
    state.token = "";
    state.me = null;
    localStorage.removeItem("essencia_token");
    showAuth();
    const errorBox = $("#authError");
    if (errorBox && err?.message && err.message !== "Sessão inválida.") {
      errorBox.textContent = err.message;
    }
    return false;
  }

  showApp();
  updateMeUI();

  try { connectSocket(); } catch (err) {
    console.warn("Socket indisponível no boot:", err);
  }

  const results = await Promise.allSettled([
    loadServers(),
    loadFriends()
  ]);

  const failed = results.filter(item => item.status === "rejected");
  if (failed.length) {
    console.warn("Boot parcial do Essência:", failed.map(item => item.reason));
    toast("Conectado. Alguns dados ainda estão sincronizando.");
  }

  try { showHome("friends"); } catch (err) {
    console.warn("Não foi possível abrir Amigos automaticamente:", err);
  }

  return true;
}

function updateMeUI() {
  $("#meNick").textContent = state.me.nick;
  $("#meUsername").textContent = `@${state.me.username}`;
  $("#meAvatar").src = avatarUrl(state.me);
}

function connectSocket() {
  if (state.socket) state.socket.disconnect();

  state.socket = io({ auth: { token: state.token } });

  state.socket.on("connect_error", () => toast("Falha na conexão em tempo real."));

  state.socket.on("connect", () => {
    if (state.inVoice && state.mediaContext) {
      joinMediaSocketRoom().catch(() => {});
    }
  });

  state.socket.on("disconnect", () => {});
  state.socket.on("presence:update", () => {
    if (state.currentServer) loadMembers();
    if (state.currentChannel?.type === "voice") renderVoiceParticipants();
  });
  state.socket.on("voice:state", payload => {
    state.voiceStates[payload.channelId] = payload.members || [];
    if (state.inVoice && state.mediaContext?.kind === "server" && state.mediaContext.channelId === payload.channelId) {
      syncActiveCallMembers(payload.members || []);
    }
    renderChannels();
    if (state.currentChannel?.id === payload.channelId) renderVoiceParticipants();
  });
  state.socket.on("server:update", async serverId => {
    await loadServers();
    if (state.currentServer?.id === serverId) {
      const fresh = state.servers.find(s => s.id === serverId);
      if (fresh) state.currentServer = fresh;
      renderChannels();
      loadMembers();
    }
  });
  state.socket.on("friends:update", loadFriends);
  state.socket.on("friend:request", loadFriends);
  state.socket.on("servers:update", loadServers);
  state.socket.on("message:new", msg => {
    if (state.chatMode === "server" && state.currentChannel?.id === msg.channelId) appendMessage(msg);
  });
  state.socket.on("dm:new", msg => {
    if (state.chatMode === "dm" && state.currentDM && [msg.userId, msg.peerId].includes(state.currentDM.id)) {
      appendMessage(msg);
    }
  });
  state.socket.on("dm:notify", payload => {
    if (state.chatMode === "dm" && state.currentDM?.id === payload.from?.id) return;
    toast(`Nova mensagem de ${payload.from?.nick || payload.from?.username || "amigo"}.`);
  });
  state.socket.on("dmcall:incoming", payload => {
    if (!payload.from) return;
    if (confirm(`${payload.from.nick || payload.from.username} está te chamando. Atender?`)) {
      startDMCall(payload.from);
    }
  });
  state.socket.on("webrtc:offer", async payload => {
    await handleOffer(payload);
  });
  state.socket.on("webrtc:answer", handleAnswer);
  state.socket.on("webrtc:ice", handleIce);
  state.socket.on("media:state", handleMediaState);
  state.socket.on("media:peer-left", ({ socketId }) => removePeer(socketId));
}

async function loadServers() {
  const data = await API("/api/servers");
  state.servers = data.servers || [];
  renderServerRail();
  if (state.currentServer) {
    const fresh = state.servers.find(s => s.id === state.currentServer.id);
    if (!fresh) {
      state.currentServer = null;
      state.currentChannel = null;
      showHome("friends");
    } else {
      state.currentServer = fresh;
      renderChannels();
    }
  }
}

async function loadFriends() {
  state.friends = await API("/api/friends");
  renderFriends();
  renderDMs();
}

function renderServerRail() {
  const box = $("#serverList");
  box.innerHTML = "";
  state.servers.forEach(srv => {
    const b = document.createElement("button");
    b.className = "server-icon" + (state.currentServer?.id === srv.id ? " active" : "");
    b.title = srv.name;
    b.dataset.server = srv.id;
    if (srv.icon) {
      b.innerHTML = `<img class="server-icon-img" src="${esc(srv.icon)}" alt="${esc(srv.name)}">`;
    } else {
      b.textContent = srv.name[0].toUpperCase();
    }
    b.onclick = () => openServer(srv.id);
    box.appendChild(b);
  });
}

function renderChannels() {
  const textBox = $("#textChannels");
  const voiceBox = $("#voiceChannels");
  textBox.innerHTML = "";
  voiceBox.innerHTML = "";

  if (!state.currentServer) return;

  state.currentServer.channels.forEach(ch => {
    if (ch.type === "text") {
      const b = document.createElement("button");
      b.className = "channel-item" + (state.currentChannel?.id === ch.id ? " active" : "");
      b.dataset.channel = ch.id;
      b.innerHTML = `<span>#</span><b>${esc(ch.name)}</b>`;
      b.onclick = () => openChannel(ch.id);
      textBox.appendChild(b);
    } else {
      const wrap = document.createElement("div");
      wrap.className = "voice-channel-wrap";

      const b = document.createElement("button");
      b.className = "channel-item voice-channel-item" + (state.currentChannel?.id === ch.id ? " active" : "");
      b.dataset.channel = ch.id;
      b.innerHTML = `<span>🔊</span><b>${esc(ch.name)}</b><small>entrar</small>`;
      b.onclick = () => openVoice(ch.id);
      wrap.appendChild(b);

      const participants = document.createElement("div");
      participants.className = "voice-participants";
      (state.voiceStates[ch.id] || []).forEach(m => {
        const row = document.createElement("div");
        row.className = "voice-participant-row";
        row.innerHTML = `<img src="${avatarUrl(m.user)}"><span>${esc(m.user?.nick || m.user?.username || "usuário")}</span>`;
        participants.appendChild(row);
      });
      if (!(state.voiceStates[ch.id] || []).length) {
        const empty = document.createElement("div");
        empty.className = "voice-empty";
        empty.textContent = "Ninguém conectado";
        participants.appendChild(empty);
      }
      wrap.appendChild(participants);
      voiceBox.appendChild(wrap);
    }
  });
}

async function openServer(serverId) {
  closeMobilePanels();
  if (!isPreservingVoiceFor({ kind: "server", serverId })) {
    await leaveVoice();
  }
  const srv = state.servers.find(s => s.id === serverId);
  if (!srv) return;
  state.currentServer = srv;
  state.currentDM = null;
  state.currentChannel = null;
  state.chatMode = "server";
  renderServerRail();
  renderChannels();
  loadMembers();
  $("#serverName").textContent = srv.name;
  $("#serverSidebar").classList.remove("hidden");
  $("#homeSidebar").classList.add("hidden");
  $("#membersPanel").classList.remove("hidden");
  const first = srv.channels.find(c => c.type === "text") || srv.channels[0];
  if (first) await openChannel(first.id);
}

async function openChannel(channelId) {
  closeMobilePanels();
  if (!isPreservingVoiceFor({ kind: "server", serverId: state.currentServer?.id })) {
    await leaveVoice();
  }
  const ch = state.currentServer?.channels.find(c => c.id === channelId);
  if (!ch) return;
  state.currentChannel = ch;
  state.currentDM = null;
  state.chatMode = "server";
  renderChannels();
  $("#homeView").classList.add("hidden");
  $("#chatView").classList.remove("hidden");
  $("#voiceView").classList.add("hidden");
  $("#topTitle").textContent = `# ${ch.name}`;
  const data = await API(`/api/servers/${state.currentServer.id}/channels/${ch.id}/messages`);
  renderMessages(data.messages || []);
}

async function openDM(user) {
  closeMobilePanels();
  if (!isPreservingVoiceFor({ kind: "dm", friendId: user.id })) {
    await leaveVoice();
  }
  state.currentDM = user;
  state.currentChannel = null;
  state.chatMode = "dm";
  $("#homeView").classList.add("hidden");
  $("#chatView").classList.remove("hidden");
  $("#voiceView").classList.add("hidden");
  $("#membersPanel").classList.add("hidden");
  $("#topTitle").textContent = `@ ${user.nick || user.username}`;
  const data = await API(`/api/dms/${user.id}/messages`);
  renderMessages(data.messages || []);
}

async function showHome(tab = "friends") {
  closeMobilePanels();
  if (!isPreservingVoiceFor({ kind: "home" })) {
    await leaveVoice();
  }
  state.currentServer = null;
  state.currentChannel = null;
  state.currentDM = null;
  state.chatMode = "home";
  renderServerRail();
  $("#serverSidebar").classList.add("hidden");
  $("#homeSidebar").classList.remove("hidden");
  $("#membersPanel").classList.add("hidden");
  $("#homeView").classList.remove("hidden");
  $("#chatView").classList.add("hidden");
  $("#voiceView").classList.add("hidden");
  $("#topTitle").textContent = "Amigos";
  renderFriends(tab);
}

function renderDMs() {
  const box = $("#dmList");
  box.innerHTML = "";
  (state.friends?.friends || []).forEach(user => {
    const b = document.createElement("button");
    b.className = "dm-item";
    b.innerHTML = `<img src="${avatarUrl(user)}"><span><b>${esc(user.nick || user.username)}</b><small>@${esc(user.username)}</small></span>`;
    b.onclick = () => openDM(user);
    box.appendChild(b);
  });
}

function renderFriends(tab = "friends") {
  const box = $("#homeContent");
  if (tab === "requests") {
    const incoming = state.friends?.incoming || [];
    box.innerHTML = `<h2>Solicitações</h2>` + (incoming.length ? incoming.map(r => `
      <div class="person-row">
        <img src="${avatarUrl(r.from)}">
        <div><b>${esc(r.from.nick || r.from.username)}</b><small>@${esc(r.from.username)}</small></div>
        <button data-accept="${r.id}" class="primary small">Aceitar</button>
        <button data-reject="${r.id}" class="secondary small">Recusar</button>
      </div>`).join("") : `<p class="muted">Nenhuma solicitação pendente.</p>`);
    $$('[data-accept]').forEach(b => b.onclick = async () => { await API(`/api/friends/${b.dataset.accept}/accept`, { method: "POST" }); await loadFriends(); renderFriends("requests"); });
    $$('[data-reject]').forEach(b => b.onclick = async () => { await API(`/api/friends/${b.dataset.reject}/reject`, { method: "POST" }); await loadFriends(); renderFriends("requests"); });
    return;
  }

  box.innerHTML = `<h2>Amigos</h2>` + `
    <div class="add-friend-row">
      <input id="friendNameInput" placeholder="Nome de usuário">
      <button id="addFriendBtn" class="primary">Adicionar amigo</button>
    </div>` + ((state.friends?.friends || []).length ? state.friends.friends.map(user => `
      <button class="person-row person-click" data-open-dm="${user.id}">
        <img src="${avatarUrl(user)}">
        <span><b>${esc(user.nick || user.username)}</b><small>@${esc(user.username)}</small></span>
        <i>Mensagem</i>
      </button>`).join("") : `<p class="muted">Você ainda não tem amigos adicionados.</p>`);

  $("#addFriendBtn").onclick = async () => {
    const username = $("#friendNameInput").value;
    try {
      await API("/api/friends/request", { method: "POST", body: { username } });
      $("#friendNameInput").value = "";
      toast("Solicitação enviada.");
      await loadFriends();
    } catch (e) { toast(e.message); }
  };

  $$('[data-open-dm]').forEach(b => b.onclick = () => {
    const user = state.friends.friends.find(u => u.id === b.dataset.openDm);
    if (user) openDM(user);
  });
}

$("#homeBtn").onclick = () => showHome("friends");
$("#friendsBtn").onclick = () => showHome("friends");
$("#requestsBtn").onclick = () => showHome("requests");
$("#addServerBtn").onclick = async () => {
  const name = prompt("Nome do servidor:");
  if (!name) return;
  try {
    await API("/api/servers", { method: "POST", body: { name } });
    await loadServers();
  } catch (e) { toast(e.message); }
};

$("#inviteBtn").onclick = async () => {
  const username = prompt("Nome do usuário para adicionar ao servidor:");
  if (!username || !state.currentServer) return;
  try {
    await API(`/api/servers/${state.currentServer.id}/invite`, { method: "POST", body: { username } });
    toast("Usuário adicionado.");
    loadMembers();
  } catch (e) { toast(e.message); }
};

async function loadMembers() {
  if (!state.currentServer) return;
  try {
    const data = await API(`/api/servers/${state.currentServer.id}/members`);
    state.serverMembers = data.members || [];
    renderMembers();
  } catch {}
}

function renderMembers() {
  const box = $("#membersList");
  box.innerHTML = "";
  state.serverMembers.forEach(m => {
    const row = document.createElement("div");
    row.className = "member-row";
    row.innerHTML = `<img src="${avatarUrl(m)}"><span><b>${esc(m.nick || m.username)}</b><small>@${esc(m.username)}</small></span>`;
    box.appendChild(row);
  });
}

async function sendCurrentMessage(text, attachment = null) {
  if (state.chatMode === "server" && state.currentServer && state.currentChannel?.type === "text") {
    state.socket?.emit("message:send", {
      serverId: state.currentServer.id,
      channelId: state.currentChannel.id,
      text,
      attachment
    });
  } else if (state.chatMode === "dm" && state.currentDM) {
    state.socket?.emit("dm:send", { friendId: state.currentDM.id, text, attachment });
  }
}

$("#messageForm").onsubmit = e => {
  e.preventDefault();
  const input = $("#messageInput");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  sendCurrentMessage(text);
};

$("#attachBtn").onclick = () => $("#fileInput").click();
$("#gifBtn").onclick = () => $("#gifInput").click();
$("#emojiBtn").onclick = e => {
  e.stopPropagation();
  $("#emojiPopover").classList.toggle("hidden");
};

document.addEventListener("click", () => $("#emojiPopover").classList.add("hidden"));
$("#emojiPopover").addEventListener("click", e => {
  if (e.target.tagName === "BUTTON") {
    $("#messageInput").value += e.target.textContent;
    $("#messageInput").focus();
  }
});

$("#fileInput").onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const form = new FormData();
    form.append("file", file);
    const data = await API("/api/upload", { method: "POST", body: form });
    sendCurrentMessage("", data.attachment);
  } catch (err) { toast(err.message); }
  e.target.value = "";
};

$("#gifInput").onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const form = new FormData();
    form.append("file", file);
    const data = await API("/api/upload", { method: "POST", body: form });
    sendCurrentMessage("", data.attachment);
  } catch (err) { toast(err.message); }
  e.target.value = "";
};

function renderMessages(messages) {
  const box = $("#messages");
  box.innerHTML = "";
  messages.forEach(appendMessage);
  box.scrollTop = box.scrollHeight;
}

function appendMessage(m) {
  const row = document.createElement("div");
  row.className = "msg";
  row.dataset.msg = m.id;
  row.innerHTML = `
    <img class="avatar" src="${avatarUrl(m.user)}">
    <div>
      <div class="msg-head"><b>${esc(m.user?.nick || m.user?.username || "usuário")}</b><time>${new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>
      ${m.text ? `<div class="msg-text">${esc(m.text)}</div>` : ""}
      ${renderAttachment(m.attachment)}
    </div>`;
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}

function renderAttachment(a) {
  if (!a) return "";
  if (a.type?.startsWith("image/")) return `<a href="${esc(a.url)}" target="_blank"><img class="msg-image" src="${esc(a.url)}" alt="${esc(a.name)}"></a>`;
  if (a.type?.startsWith("video/")) return `<video class="msg-video" controls preload="metadata" src="${esc(a.url)}"></video>`;
  return `<a class="file-card" href="${esc(a.url)}" target="_blank"><span>📄</span><span><b>${esc(a.name)}</b><small>${Math.ceil((a.size || 0) / 1024)} KB</small></span></a>`;
}

async function openVoice(channelId) {
  closeMobilePanels();
  const ch = state.currentServer?.channels.find(c => c.id === channelId);
  if (!ch || ch.type !== "voice") return;
  const sameRoom = isPreservingVoiceFor({ kind: "server", serverId: state.currentServer.id, channelId: ch.id });
  if (!sameRoom) await leaveVoice();
  state.currentChannel = ch;
  state.currentDM = null;
  state.chatMode = "server";
  $("#homeView").classList.add("hidden");
  $("#chatView").classList.add("hidden");
  $("#voiceView").classList.remove("hidden");
  $("#topTitle").textContent = `🔊 ${ch.name}`;
  renderChannels();
  if (!sameRoom) await enterMediaRoom({ kind: "server", serverId: state.currentServer.id, channelId: ch.id });
  else renderVoiceParticipants();
}

function getPeerKey(socketId) { return socketId; }

function createPeerConnection(socketId, user, initiator) {
  let pc = state.peerConnections.get(socketId);
  if (pc) return pc;

  pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ]
  });

  state.peerConnections.set(socketId, pc);
  state.peerUsers.set(socketId, user);

  pc.onicecandidate = e => {
    if (e.candidate) state.socket.emit("webrtc:ice", { to: socketId, candidate: e.candidate });
  };

  pc.ontrack = e => {
    const stream = e.streams[0];
    if (!stream) return;
    let media = state.remoteMedia.get(socketId);
    if (!media) {
      media = { streams: new Map() };
      state.remoteMedia.set(socketId, media);
    }
    media.streams.set(stream.id, stream);
    renderVoiceParticipants();
  };

  pc.onconnectionstatechange = () => {
    if (["failed", "closed"].includes(pc.connectionState)) removePeer(socketId);
  };

  if (state.localStream) state.localStream.getTracks().forEach(t => pc.addTrack(t, state.localStream));
  if (state.screenStream) state.screenStream.getTracks().forEach(t => pc.addTrack(t, state.screenStream));

  if (initiator) createOffer(socketId, pc);
  return pc;
}

async function createOffer(socketId, pc) {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  state.socket.emit("webrtc:offer", { to: socketId, sdp: offer });
}

async function handleOffer({ from, sdp, user }) {
  const pc = createPeerConnection(from, user, false);
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  state.socket.emit("webrtc:answer", { to: from, sdp: answer });
}

async function handleAnswer({ from, sdp }) {
  const pc = state.peerConnections.get(from);
  if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
}

async function handleIce({ from, candidate }) {
  const pc = state.peerConnections.get(from);
  if (pc && candidate) {
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
  }
}

function removePeer(socketId) {
  const pc = state.peerConnections.get(socketId);
  if (pc) pc.close();
  state.peerConnections.delete(socketId);
  state.peerUsers.delete(socketId);
  state.remoteMedia.delete(socketId);
  if (state.streamOverlayPeer === socketId) closeStreamOverlay();
  renderVoiceParticipants();
}

async function enterMediaRoom(ctx) {
  state.mediaContext = ctx;
  state.inVoice = true;
  state.micAvailable = true;

  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    state.muted = false;
  } catch (err) {
    console.warn("Microfone indisponível, entrando como ouvinte:", err?.name || err);
    state.localStream = new MediaStream();
    state.micAvailable = false;
    state.muted = true;
    toast("Entrando sem microfone. Você ainda pode ouvir e assistir.");
  }

  await joinMediaSocketRoom();
  if (ctx.kind === "server") {
    state.currentChannel = state.currentServer?.channels.find(c => c.id === ctx.channelId) || state.currentChannel;
    renderChannels();
  }
  renderVoiceParticipants();
}

async function joinMediaSocketRoom() {
  if (!state.socket || !state.mediaContext) return;
  const ctx = state.mediaContext;
  if (ctx.kind === "server") {
    const ack = await new Promise(resolve => {
      let settled = false;
      const timer = setTimeout(() => { if (!settled) resolve(null); }, 2500);
      state.socket.emit("voice:join", { serverId: ctx.serverId, channelId: ctx.channelId }, payload => {
        settled = true;
        clearTimeout(timer);
        resolve(payload || null);
      });
    });
    if (ack?.ok && Array.isArray(ack.members)) {
      state.voiceStates[ctx.channelId] = ack.members;
      syncActiveCallMembers(ack.members);
      renderChannels();
    }
  } else {
    state.socket.emit("dmvoice:join", { friendId: ctx.friendId });
  }
}

async function startDMCall(user) {
  closeMobilePanels();
  const sameRoom = isPreservingVoiceFor({ kind: "dm", friendId: user.id });
  if (!sameRoom) await leaveVoice();
  state.currentDM = user;
  state.currentServer = null;
  state.currentChannel = null;
  state.chatMode = "dm";
  showApp();
  $("#serverSidebar").classList.add("hidden");
  $("#homeSidebar").classList.remove("hidden");
  $("#homeView").classList.add("hidden");
  $("#chatView").classList.add("hidden");
  $("#voiceView").classList.remove("hidden");
  $("#membersPanel").classList.add("hidden");
  $("#topTitle").textContent = `📞 ${user.nick || user.username}`;
  if (!sameRoom) await enterMediaRoom({ kind: "dm", friendId: user.id });
  if (!sameRoom) state.socket.emit("dmcall:ring", { friendId: user.id });
}

function syncActiveCallMembers(members) {
  state.activeCallMembers = members || [];
  updateCallBar();
}

function updateCallBar() {
  const bar = $("#callBar");
  if (!bar) return;
  if (!state.inVoice || !state.mediaContext) {
    bar.classList.add("hidden");
    return;
  }

  bar.classList.remove("hidden");
  const title = $("#callBarTitle");
  const subtitle = $("#callBarSubtitle");
  const avatars = $("#callBarAvatars");
  if (title) title.textContent = state.mediaContext.kind === "server" ? "Conectado" : "Chamada privada";
  if (subtitle) {
    if (state.mediaContext.kind === "server") {
      const serverName = state.servers.find(s => s.id === state.mediaContext.serverId)?.name || "Servidor";
      const channelName = state.currentServer?.channels.find(c => c.id === state.mediaContext.channelId)?.name || "Voz";
      subtitle.textContent = `${serverName} · ${channelName}`;
    } else {
      const user = state.friends?.friends?.find(f => f.id === state.mediaContext.friendId) || state.currentDM;
      subtitle.textContent = user ? (user.nick || user.username) : "Amigo";
    }
  }
  if (avatars) {
    const seen = new Set();
    const users = [];
    const own = state.me;
    if (own) { seen.add(own.id); users.push(own); }
    for (const member of state.activeCallMembers || []) {
      if (member?.user && !seen.has(member.user.id)) { seen.add(member.user.id); users.push(member.user); }
    }
    avatars.innerHTML = users.slice(0,4).map(u => `<img src="${avatarUrl(u)}" title="${esc(u.nick || u.username)}">`).join("");
  }
}

function isPreservingVoiceFor(target) {
  if (!state.inVoice || !state.mediaContext) return true;
  if (!target) return true;
  const current = state.mediaContext;
  if (current.kind === "server") {
    if (target.kind === "server") {
      if (target.channelId) return current.serverId === target.serverId && current.channelId === target.channelId;
      return current.serverId === target.serverId;
    }
    if (["home","dm"].includes(target.kind)) return true;
  }
  if (current.kind === "dm") {
    if (target.kind === "dm") return !target.friendId || current.friendId === target.friendId;
    if (["home","server"].includes(target.kind)) return true;
  }
  return false;
}

async function leaveVoice() {
  if (state.socket) state.socket.emit("voice:leave");
  for (const pc of state.peerConnections.values()) pc.close();
  state.peerConnections.clear();
  state.peerUsers.clear();
  state.remoteMedia.clear();
  state.localStream?.getTracks().forEach(t => t.stop());
  state.screenStream?.getTracks().forEach(t => t.stop());
  state.localStream = null;
  state.screenStream = null;
  state.mediaContext = null;
  state.inVoice = false;
  state.activeCallMembers = [];
  state.micAvailable = true;
  updateCallBar();
  closeStreamOverlay();
  renderVoiceParticipants();
}

async function toggleMute() {
  if (!state.localStream) return;
  state.muted = !state.muted;
  state.localStream.getAudioTracks().forEach(t => t.enabled = !state.muted);
  $("#muteBtn").textContent = state.muted ? "Ativar microfone" : "Mutar";
  emitMediaState();
}

function buildQualityConstraints(q = state.quality) {
  return {
    width: { ideal: q.width, max: q.width },
    height: { ideal: q.height, max: q.height },
    frameRate: { ideal: q.frameRate, max: q.frameRate }
  };
}

async function applyQualityToSender() {
  if (!state.screenStream) return;
  for (const [socketId, pc] of state.peerConnections.entries()) {
    const sender = pc.getSenders().find(s => s.track && s.track.kind === "video" && state.screenStream.getVideoTracks().includes(s.track));
    if (!sender) continue;
    try {
      const params = sender.getParameters();
      params.encodings ||= [{}];
      params.encodings[0].maxBitrate = state.quality.bitrate;
      params.encodings[0].maxFramerate = state.quality.frameRate;
      await sender.setParameters(params);
    } catch (err) {
      console.warn("Não foi possível aplicar bitrate no sender", socketId, err);
    }
  }
}

function emitMediaState() {
  if (!state.socket || !state.inVoice) return;
  const voiceTrack = state.localStream?.getAudioTracks()[0] || null;
  const screenVideoTrack = state.screenStream?.getVideoTracks()[0] || null;
  const screenAudioTrack = state.screenStream?.getAudioTracks()[0] || null;
  state.socket.emit("media:state", {
    muted: state.muted,
    sharing: !!screenVideoTrack,
    voiceStreamId: state.localStream?.id || null,
    screenStreamId: state.screenStream?.id || null,
    voiceTrackId: voiceTrack?.id || null,
    screenAudioTrackId: screenAudioTrack?.id || null,
    screenVideoTrackId: screenVideoTrack?.id || null
  });
}

async function shareScreen() {
  if (state.screenStream) {
    await stopShare();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: buildQualityConstraints(),
      audio: true
    });
    state.screenStream = stream;
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) videoTrack.contentHint = "detail";

    for (const [socketId, pc] of state.peerConnections.entries()) {
      for (const track of stream.getTracks()) pc.addTrack(track, stream);
      await createOffer(socketId, pc);
    }
    await applyQualityToSender();
    emitMediaState();
    renderVoiceParticipants();
    videoTrack.onended = () => stopShare();
  } catch (err) {
    if (err?.name !== "NotAllowedError") toast("Não foi possível compartilhar a tela.");
  }
}

async function stopShare() {
  if (!state.screenStream) return;
  for (const pc of state.peerConnections.values()) {
    pc.getSenders().forEach(sender => {
      if (sender.track && state.screenStream?.getTracks().includes(sender.track)) pc.removeTrack(sender);
    });
  }
  state.screenStream.getTracks().forEach(t => t.stop());
  state.screenStream = null;
  emitMediaState();
  renderVoiceParticipants();
}

function handleMediaState(payload) {
  const media = state.remoteMedia.get(payload.socketId) || { streams: new Map() };
  media.state = payload;
  state.remoteMedia.set(payload.socketId, media);
  renderVoiceParticipants();
}

function renderVoiceParticipants() {
  const grid = $("#voiceGrid");
  if (!grid) return;
  grid.innerHTML = "";
  const local = document.createElement("div");
  local.className = "video-tile local-tile";
  local.innerHTML = `
    <img src="${avatarUrl(state.me)}">
    <b>${esc(state.me?.nick || state.me?.username || "Você")}</b>
    <small>${state.muted ? "Microfone desativado" : (state.micAvailable ? "Microfone ativo" : "Sem microfone")}</small>`;
  grid.appendChild(local);

  for (const [socketId, media] of state.remoteMedia.entries()) {
    const user = state.peerUsers.get(socketId) || { username: "usuário" };
    const tile = document.createElement("div");
    tile.className = "video-tile";
    tile.dataset.peer = socketId;
    const sharing = !!media.state?.sharing;
    const screenStream = [...(media.streams?.values() || [])].find(s =>
      media.state?.screenStreamId ? s.id === media.state.screenStreamId : s.getVideoTracks().length
    );
    const voiceStream = [...(media.streams?.values() || [])].find(s =>
      media.state?.voiceStreamId ? s.id === media.state.voiceStreamId : s.getAudioTracks().length && !s.getVideoTracks().length
    );

    if (sharing && screenStream?.getVideoTracks().length) {
      tile.classList.add("sharing-tile");
      tile.innerHTML = `<video autoplay playsinline></video><span class="stream-badge">Transmitindo</span><b>${esc(user.nick || user.username)}</b>`;
      const video = tile.querySelector("video");
      video.srcObject = screenStream;
      video.muted = false;
      tile.onclick = () => openStreamOverlay(socketId);
    } else {
      tile.innerHTML = `<img src="${avatarUrl(user)}"><b>${esc(user.nick || user.username)}</b><small>${media.state?.muted ? "Mutado" : "Conectado"}</small>`;
    }

    const audioStreams = new Set();
    for (const s of media.streams?.values() || []) {
      if (s.getAudioTracks().length) audioStreams.add(s);
    }
    for (const s of audioStreams) {
      const a = document.createElement("audio");
      a.autoplay = true;
      a.srcObject = s;
      a.dataset.peer = socketId;
      a.dataset.stream = s.id;
      tile.appendChild(a);
      attachAudioGain(a, socketId, s);
    }

    grid.appendChild(tile);
  }
}

function getVolumePrefs(userId) {
  state.volumePrefs[userId] ||= { voice: 1, screen: 1 };
  return state.volumePrefs[userId];
}

function saveVolumePrefs() {
  try { localStorage.setItem("essencia_volume_prefs", JSON.stringify(state.volumePrefs)); } catch {}
}

function volumeGain(value) {
  const v = Math.max(0, Math.min(2, Number(value) || 0));
  if (v <= 1) return Math.pow(v, 1.8);
  return 1 + (v - 1) * 1.5;
}

function guessAudioKind(stream, socketId) {
  const media = state.remoteMedia.get(socketId);
  const declared = media?.state;
  if (declared?.screenStreamId && stream.id === declared.screenStreamId) return "screen";
  if (declared?.voiceStreamId && stream.id === declared.voiceStreamId) return "voice";
  if (stream.getVideoTracks().length) return "screen";
  return "voice";
}

function ensureAudioContext() {
  if (!state.audioContext) state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (state.audioContext.state === "suspended") state.audioContext.resume().catch(() => {});
  return state.audioContext;
}

function attachAudioGain(audioEl, socketId, stream) {
  if (!audioEl || audioEl.__gainAttached) return;
  try {
    const ctx = ensureAudioContext();
    const source = ctx.createMediaElementSource(audioEl);
    const gain = ctx.createGain();
    source.connect(gain).connect(ctx.destination);
    audioEl.volume = 1;
    audioEl.__gainNode = gain;
    audioEl.__gainAttached = true;
    const user = state.peerUsers.get(socketId);
    const prefs = getVolumePrefs(user?.id || socketId);
    const kind = guessAudioKind(stream, socketId);
    gain.gain.value = volumeGain(prefs[kind] ?? 1);
  } catch (err) {
    console.warn("Falha ao criar mixer de áudio", err);
  }
}

function setPeerVolume(socketId, kind, value) {
  const user = state.peerUsers.get(socketId);
  const userId = user?.id || socketId;
  const prefs = getVolumePrefs(userId);
  prefs[kind] = Math.max(0, Math.min(2, Number(value) || 0));
  saveVolumePrefs();
  $$(`audio[data-peer="${CSS.escape(socketId)}"]`).forEach(audio => {
    const stream = audio.srcObject;
    if (!stream || guessAudioKind(stream, socketId) !== kind) return;
    if (audio.__gainNode) audio.__gainNode.gain.value = volumeGain(prefs[kind]);
    else audio.volume = Math.min(1, prefs[kind]);
  });
}

function volumeLabel(value) { return `${Math.round((Number(value) || 0) * 100)}%`; }

function openStreamVolumeContext(socketId, x, y) {
  closeStreamVolumeContext();
  const user = state.peerUsers.get(socketId);
  const prefs = getVolumePrefs(user?.id || socketId);
  state.streamVolumeContextPeer = socketId;
  const pop = document.createElement("div");
  pop.className = "stream-volume-context";
  pop.id = "streamVolumeContext";
  pop.innerHTML = `
    <b>Volume de ${esc(user?.nick || user?.username || "participante")}</b>
    <label>Transmissão <span>${volumeLabel(prefs.screen)}</span></label>
    <input data-vol="screen" type="range" min="0" max="200" value="${Math.round(prefs.screen*100)}">
    <label>Voz <span>${volumeLabel(prefs.voice)}</span></label>
    <input data-vol="voice" type="range" min="0" max="200" value="${Math.round(prefs.voice*100)}">`;
  document.body.appendChild(pop);
  pop.style.left = `${Math.max(10, Math.min(x, innerWidth - 270))}px`;
  pop.style.top = `${Math.max(10, Math.min(y, innerHeight - 210))}px`;
  pop.querySelectorAll('input[type="range"]').forEach(input => {
    input.oninput = () => {
      const kind = input.dataset.vol;
      const value = Number(input.value) / 100;
      setPeerVolume(socketId, kind, value);
      input.previousElementSibling.querySelector("span").textContent = volumeLabel(value);
      const overlaySlider = $("#streamOverlayVolume");
      const overlayLabel = $("#streamOverlayVolumeLabel");
      if (kind === "screen" && state.streamOverlayPeer === socketId && overlaySlider) {
        overlaySlider.value = Math.round(value * 100);
        if (overlayLabel) overlayLabel.textContent = volumeLabel(value);
      }
    };
  });
}

function closeStreamVolumeContext() {
  $("#streamVolumeContext")?.remove();
  state.streamVolumeContextPeer = null;
}

document.addEventListener("contextmenu", e => {
  const tile = e.target.closest(".video-tile[data-peer]");
  if (!tile) return;
  e.preventDefault();
  openStreamVolumeContext(tile.dataset.peer, e.clientX, e.clientY);
});

document.addEventListener("pointerdown", e => {
  const pop = $("#streamVolumeContext");
  if (pop && !pop.contains(e.target)) closeStreamVolumeContext();
});

function ensureStreamOverlay() {
  let overlay = $("#streamOverlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "streamOverlay";
  overlay.className = "stream-overlay hidden";
  overlay.innerHTML = `
    <div class="stream-overlay-shell">
      <div class="stream-overlay-head">
        <strong id="streamOverlayTitle">Transmissão</strong>
        <div>
          <button id="streamOverlayBrowserFullscreen" class="secondary small">Tela cheia</button>
          <button id="streamOverlayClose" class="secondary small">Fechar</button>
        </div>
      </div>
      <div class="stream-overlay-stage">
        <video id="streamOverlayVideo" autoplay playsinline></video>
      </div>
      <div class="stream-overlay-volume">
        <span>🔊</span>
        <input id="streamOverlayVolume" type="range" min="0" max="200" value="100">
        <b id="streamOverlayVolumeLabel">100%</b>
      </div>
      <div id="streamOverlayParticipants" class="stream-overlay-participants"></div>
    </div>`;
  document.body.appendChild(overlay);
  $("#streamOverlayClose").onclick = closeStreamOverlay;
  $("#streamOverlayBrowserFullscreen").onclick = async () => {
    const shell = $("#streamOverlay");
    try {
      if (!document.fullscreenElement) await shell.requestFullscreen();
      else await document.exitFullscreen();
    } catch (e) { toast("Tela cheia não disponível neste navegador."); }
  };
  $("#streamOverlayVolume").oninput = e => {
    if (!state.streamOverlayPeer) return;
    const value = Number(e.target.value) / 100;
    setPeerVolume(state.streamOverlayPeer, "screen", value);
    $("#streamOverlayVolumeLabel").textContent = volumeLabel(value);
  };
  return overlay;
}

function openStreamOverlay(socketId) {
  const media = state.remoteMedia.get(socketId);
  const user = state.peerUsers.get(socketId);
  const stream = [...(media?.streams?.values() || [])].find(s =>
    media?.state?.screenStreamId ? s.id === media.state.screenStreamId : s.getVideoTracks().length
  );
  if (!stream) return;
  const overlay = ensureStreamOverlay();
  state.streamOverlayPeer = socketId;
  $("#streamOverlayTitle").textContent = `Transmissão de ${user?.nick || user?.username || "participante"}`;
  const video = $("#streamOverlayVideo");
  video.srcObject = stream;
  video.muted = false;
  const prefs = getVolumePrefs(user?.id || socketId);
  const slider = $("#streamOverlayVolume");
  slider.value = Math.round(prefs.screen * 100);
  $("#streamOverlayVolumeLabel").textContent = volumeLabel(prefs.screen);
  renderStreamOverlayParticipants();
  overlay.classList.remove("hidden");
}

function renderStreamOverlayParticipants() {
  const box = $("#streamOverlayParticipants");
  if (!box) return;
  box.innerHTML = "";
  for (const [socketId, user] of state.peerUsers.entries()) {
    const media = state.remoteMedia.get(socketId);
    if (!media?.state?.sharing) continue;
    const b = document.createElement("button");
    b.className = "stream-person" + (socketId === state.streamOverlayPeer ? " active" : "");
    b.innerHTML = `<img src="${avatarUrl(user)}"><span>${esc(user.nick || user.username)}</span>`;
    b.onclick = () => openStreamOverlay(socketId);
    box.appendChild(b);
  }
}

function closeStreamOverlay() {
  const overlay = $("#streamOverlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
  const video = $("#streamOverlayVideo");
  if (video) video.srcObject = null;
  state.streamOverlayPeer = null;
  if (document.fullscreenElement === overlay) document.exitFullscreen().catch(() => {});
}

$("#muteBtn").onclick = toggleMute;
$("#shareBtn").onclick = shareScreen;
$("#leaveVoiceBtn").onclick = leaveVoice;
$("#callBarReturn").onclick = () => {
  if (!state.inVoice || !state.mediaContext) return;
  if (state.mediaContext.kind === "server") {
    const srv = state.servers.find(s => s.id === state.mediaContext.serverId);
    if (srv) {
      state.currentServer = srv;
      $("#serverSidebar").classList.remove("hidden");
      $("#homeSidebar").classList.add("hidden");
      openVoice(state.mediaContext.channelId);
    }
  } else {
    const user = state.friends?.friends?.find(f => f.id === state.mediaContext.friendId) || state.currentDM;
    if (user) startDMCall(user);
  }
};
$("#callBarDisconnect").onclick = leaveVoice;

$("#qualityBtn").onclick = () => $("#qualityModal").classList.remove("hidden");
$("#qualityCancel").onclick = () => $("#qualityModal").classList.add("hidden");
$("#qualityConfirm").onclick = async () => {
  const selected = document.querySelector('input[name="streamQuality"]:checked');
  if (!selected) return;
  const [w,h,f,b,label] = selected.value.split("|");
  state.quality = { width:+w, height:+h, frameRate:+f, bitrate:+b, label };
  localStorage.setItem("essencia_stream_quality", JSON.stringify(state.quality));
  $("#qualityModal").classList.add("hidden");
  if (state.screenStream) {
    const track = state.screenStream.getVideoTracks()[0];
    try { await track.applyConstraints(buildQualityConstraints()); } catch {}
    await applyQualityToSender();
  }
  toast(`Qualidade: ${state.quality.label}`);
};

$("#editProfileBtn").onclick = () => {
  $("#profileNick").value = state.me?.nick || "";
  $("#profileAvatar").value = "";
  $("#profileModal").classList.remove("hidden");
};
$("#profileCancel").onclick = () => $("#profileModal").classList.add("hidden");
$("#profileSave").onclick = async () => {
  try {
    const form = new FormData();
    form.append("nick", $("#profileNick").value);
    const file = $("#profileAvatar").files[0];
    if (file) form.append("avatar", file);
    const data = await API("/api/profile", { method: "POST", body: form });
    state.me = data.user;
    updateMeUI();
    $("#profileModal").classList.add("hidden");
  } catch (e) { toast(e.message); }
};

$("#logoutBtn").onclick = async () => {
  try { await API("/api/logout", { method: "POST" }); } catch {}
  state.token = "";
  state.me = null;
  localStorage.removeItem("essencia_token");
  await leaveVoice();
  state.socket?.disconnect();
  showAuth();
};

$("#mobileMenuBtn")?.addEventListener("click", e => {
  e.stopPropagation();
  if ($(".sidebar")?.classList.contains("open")) closeMobileNav();
  else openMobileNav();
});

$("#mobileMenuClose")?.addEventListener("click", closeMobileNav);
$("#mobileMembersClose")?.addEventListener("click", closeMobileMembers);
$("#mobileScrim")?.addEventListener("click", closeMobilePanels);
window.addEventListener("resize", () => {
  syncMobileViewport();
  if (!isMobileLayout()) {
    $(".server-rail")?.classList.remove("open");
    $(".sidebar")?.classList.remove("open");
    updateMobileScrim();
  }
});
window.visualViewport?.addEventListener("resize", syncMobileViewport);
syncMobileViewport();

boot();