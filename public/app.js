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
    await boot();
  } catch (err) {
    $("#authError").textContent = err.message;
  }
};

async function boot() {
  try {
    const me = await API("/api/me");
    state.me = me.user;
    showApp();
    updateMeUI();
    connectSocket();
    await Promise.all([loadServers(), loadFriends()]);
    showHome("friends");
  } catch {
    state.token = "";
    localStorage.removeItem("essencia_token");
    showAuth();
  }
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

  state.socket.on("message:new", message => {
    if (state.chatMode === "server" && state.currentChannel?.type === "text") {
      appendMessage(message, true);
    }
  });

  state.socket.on("dm:new", message => {
    if (state.chatMode === "dm" && state.currentDM) {
      appendMessage(message, true);
    }
  });

  state.socket.on("dm:notify", payload => {
    if (!state.currentDM || state.currentDM.id !== payload.from?.id) {
      toast(`Nova mensagem de ${payload.from?.nick || payload.from?.username || "um amigo"}.`);
    }
  });

  state.socket.on("friend:request", loadFriends);
  state.socket.on("friends:update", loadFriends);
  state.socket.on("servers:update", loadServers);

  state.socket.on("server:update", async serverId => {
    await loadServers();
    if (state.currentServer?.id === serverId) {
      state.currentServer = state.servers.find(s => s.id === serverId) || null;
      renderChannels();
      await loadVoiceStates();
      await loadMembers();
    }
  });

  state.socket.on("voice:state", payload => {
    const members = payload.members || [];

    // Mantém a chamada ativa sincronizada mesmo quando o usuário navega
    // para Amigos/PV/outro chat e currentServer deixa de apontar para a sala.
    if (
      state.inVoice &&
      state.mediaContext?.kind === "server" &&
      state.mediaContext.serverId === payload.serverId &&
      state.mediaContext.channelId === payload.channelId
    ) {
      state.activeCallMembers = members;
      updateActiveCallBar();
    }

    if (state.currentServer && payload.serverId === state.currentServer.id) {
      state.voiceStates[payload.channelId] = members;
      renderChannels();
    }
  });

  state.socket.on("voice:peers", async peers => {
    for (const peer of peers) {
      state.peerUsers.set(peer.socketId, peer.user);
      await createPeer(peer.socketId, true);
    }
    if (state.mediaContext?.kind !== "server" || !state.activeCallMembers.length) {
      state.activeCallMembers = activeMembersFromPeers();
    }
    updateActiveCallBar();
    renderVideoGrid();
    broadcastMediaState();
  });

  state.socket.on("voice:user-joined", async peer => {
    state.peerUsers.set(peer.socketId, peer.user);
    await createPeer(peer.socketId, false);

    if (!state.activeCallMembers.some(member => member.user?.id === peer.user?.id)) {
      state.activeCallMembers.push(peer);
    }
    updateActiveCallBar();
    renderVideoGrid();
    broadcastMediaState();
  });

  state.socket.on("voice:user-left", ({ socketId }) => {
    const leavingUser = state.peerUsers.get(socketId);
    removePeer(socketId);
    if (leavingUser) {
      state.activeCallMembers = state.activeCallMembers.filter(member => member.user?.id !== leavingUser.id);
    }
    updateActiveCallBar();
  });

  state.socket.on("webrtc:offer", async ({ from, sdp, user }) => {
    state.peerUsers.set(from, user);
    const pc = await createPeer(from, false);
    await pc.setRemoteDescription(sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    state.socket.emit("webrtc:answer", { to: from, sdp: pc.localDescription });
  });

  state.socket.on("webrtc:answer", async ({ from, sdp }) => {
    const pc = state.peerConnections.get(from);
    if (pc) await pc.setRemoteDescription(sdp);
  });

  state.socket.on("webrtc:ice", async ({ from, candidate }) => {
    const pc = state.peerConnections.get(from);
    if (!pc || !candidate) return;
    try { await pc.addIceCandidate(candidate); } catch {}
  });

  state.socket.on("media:state", ({ socketId, muted, sharing, voiceStreamId, screenStreamId, voiceTrackId, screenAudioTrackId, screenVideoTrackId }) => {
    const media = state.remoteMedia.get(socketId);
    if (media) {
      media.muted = !!muted;
      media.sharing = !!sharing;
      media.voiceStreamId = voiceStreamId || media.voiceStreamId || null;
      media.screenStreamId = screenStreamId || (sharing ? media.screenStreamId : null);
      media.voiceTrackId = voiceTrackId || media.voiceTrackId || null;
      media.screenAudioTrackId = screenAudioTrackId || (sharing ? media.screenAudioTrackId : null);
      media.screenVideoTrackId = screenVideoTrackId || (sharing ? media.screenVideoTrackId : null);
      if (!sharing) {
        media.screenStreamId = null;
        media.screenAudioTrackId = null;
        media.screenVideoTrackId = null;
      }
      rebuildRemoteAudioStreams(socketId);
    }
    attachRemoteMediaToTile(socketId);
    renderStreamOverlayParticipants();
    if (!sharing && state.streamOverlayPeer === socketId) refreshOpenStreamOverlay();
  });

  state.socket.on("dmcall:incoming", ({ from }) => {
    if (!from) return;
    modal(
      `Chamada de ${from.nick}`,
      `${from.nick} está chamando você por voz.`,
      `<div class="profile-preview"><img class="avatar" src="${avatarUrl(from)}"><div><strong>${esc(from.nick)}</strong><div style="font-size:11px;color:#8e98aa">@${esc(from.username)}</div></div></div>`,
      async () => {
        await startDmCall(from, false);
      },
      "Atender"
    );
  });
}

async function loadServers() {
  const data = await API("/api/servers");
  state.servers = data.servers;
  if (state.currentServer) {
    state.currentServer = state.servers.find(s => s.id === state.currentServer.id) || null;
  }
  renderServerIcons();
}

function renderServerIcons() {
  const box = $("#serverIcons");
  box.innerHTML = "";
  $("#homeRailBtn")?.classList.toggle("active", !state.currentServer);

  for (const server of state.servers) {
    const button = document.createElement("button");
    button.className = "server-icon" + (state.currentServer?.id === server.id ? " active" : "");
    button.title = server.name;
    button.textContent = server.name.split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase();
    button.onclick = () => openServer(server.id);
    box.appendChild(button);
  }
}

async function loadFriends() {
  state.friends = await API("/api/friends");
  $("#requestBadge").textContent = state.friends.incoming.length || "";
  renderDmFriends();

  const activeHome = $(".nav-item.active")?.dataset.home;
  if (activeHome && !$("#homeView").classList.contains("hidden")) {
    renderHomeContent(activeHome);
  }
}

function renderDmFriends() {
  const box = $("#dmFriends");
  box.innerHTML = "";

  for (const friend of state.friends?.friends || []) {
    const button = document.createElement("button");
    button.className = "dm-item";
    button.innerHTML = `<img class="avatar" src="${avatarUrl(friend)}"><span>${esc(friend.nick)}</span>`;
    button.onclick = () => openDM(friend);
    box.appendChild(button);
  }
}

$$("[data-home]").forEach(button => {
  button.onclick = () => showHome(button.dataset.home);
});


$("#homeRailBtn").onclick = () => showHome("friends");
$("#addFriendTopBtn").onclick = $("#addFriendHero").onclick = () => openAddFriend();
$("#profileBtn").onclick = $("#openProfileBtn").onclick = () => openProfile();

async function showHome(kind = "friends") {
  state.currentServer = null;
  state.currentChannel = null;
  state.currentDM = null;
  state.chatMode = null;
  renderServerIcons();

  $("#homeSidebar").classList.remove("hidden");
  $("#serverSidebar").classList.add("hidden");
  $("#inviteMemberBtn").classList.add("hidden");
  $("#homeView").classList.remove("hidden");
  $("#chatView").classList.add("hidden");
  $("#voiceView").classList.add("hidden");
  $("#membersPanel").classList.add("hidden");
  $("#membersPanel").classList.remove("server-visible");

  $("#topIcon").textContent = kind === "requests" ? "✉️" : "👥";
  $("#topTitle").textContent = kind === "requests" ? "Solicitações" : "Amigos";
  $("#sidebarTitle").textContent = "Amigos";
  $("#addFriendTopBtn").classList.remove("hidden");
  $("#dmCallBtn").classList.add("hidden");
  $("#membersToggle").classList.add("hidden");

  $$(".nav-item").forEach(x => x.classList.toggle("active", x.dataset.home === kind));
  renderHomeContent(kind);
  closeMobileNav();
}

function renderHomeContent(kind) {
  if (!state.friends) return;
  const box = $("#homeContent");
  box.innerHTML = "";

  if (kind === "requests") {
    const rows = state.friends.incoming;

    if (!rows.length) {
      box.innerHTML = `<div class="person-row"><div class="person-meta"><strong>Nenhuma solicitação pendente.</strong><small>Quando alguém adicionar você, vai aparecer aqui.</small></div></div>`;
      return;
    }

    rows.forEach(request => {
      const row = document.createElement("div");
      row.className = "person-row";
      row.innerHTML = `
        <img class="avatar" src="${avatarUrl(request.from)}">
        <div class="person-meta">
          <strong>${esc(request.from.nick)}</strong>
          <small>@${esc(request.from.username)} quer ser seu amigo.</small>
        </div>
        <button data-accept>✓ Aceitar</button>
        <button data-reject>×</button>`;

      row.querySelector("[data-accept]").onclick = async () => {
        await API(`/api/friends/${request.id}/accept`, { method: "POST" });
        await loadFriends();
        toast("Amigo adicionado.");
      };

      row.querySelector("[data-reject]").onclick = async () => {
        await API(`/api/friends/${request.id}/reject`, { method: "POST" });
        await loadFriends();
      };

      box.appendChild(row);
    });

    return;
  }

  const rows = state.friends.friends;

  if (!rows.length) {
    box.innerHTML = `<div class="person-row"><div class="person-meta"><strong>Você ainda não adicionou ninguém.</strong><small>Use “Adicionar amigo” e procure pelo nome exato.</small></div></div>`;
    return;
  }

  rows.forEach(friend => {
    const row = document.createElement("div");
    row.className = "person-row";
    row.innerHTML = `
      <img class="avatar" src="${avatarUrl(friend)}">
      <span class="status-dot"></span>
      <div class="person-meta">
        <strong>${esc(friend.nick)}</strong>
        <small>@${esc(friend.username)}</small>
      </div>
      <button data-message>Mensagem</button>
      <button data-call>📞</button>`;

    row.querySelector("[data-message]").onclick = () => openDM(friend);
    row.querySelector("[data-call]").onclick = () => startDmCall(friend, true);
    box.appendChild(row);
  });
}

async function openServer(serverId) {
  const server = state.servers.find(s => s.id === serverId);
  if (!server) return;

  state.currentServer = server;
  state.currentDM = null;
  state.chatMode = "server";
  renderServerIcons();

  $("#homeSidebar").classList.add("hidden");
  $("#serverSidebar").classList.remove("hidden");
  $("#inviteMemberBtn").classList.remove("hidden");
  $("#sidebarTitle").textContent = server.name;
  $("#addFriendTopBtn").classList.add("hidden");
  $("#dmCallBtn").classList.add("hidden");
  $("#membersToggle").classList.remove("hidden");
  if (window.innerWidth > 1100) {
    $("#membersPanel").classList.remove("hidden");
    $("#membersPanel").classList.add("server-visible");
  }

  await loadVoiceStates();
  renderChannels();
  await loadMembers();

  const first = server.channels.find(c => c.type === "text") || server.channels[0];
  if (first) await openChannel(first.id);
}

async function loadVoiceStates() {
  if (!state.currentServer) return;
  try {
    const data = await API(`/api/servers/${state.currentServer.id}/voice-state`);
    state.voiceStates = data.channels || {};

    if (
      state.inVoice &&
      state.mediaContext?.kind === "server" &&
      state.mediaContext.serverId === state.currentServer.id
    ) {
      state.activeCallMembers = state.voiceStates[state.mediaContext.channelId] || state.activeCallMembers;
      updateActiveCallBar();
    }
  } catch {
    state.voiceStates = {};
  }
}

function renderChannels() {
  if (!state.currentServer) return;

  $("#textChannels").innerHTML = "";
  $("#voiceChannels").innerHTML = "";

  for (const channel of state.currentServer.channels) {
    if (channel.type === "text") {
      const button = document.createElement("button");
      button.className = "channel-item" + (state.currentChannel?.id === channel.id ? " active" : "");
      button.dataset.channel = channel.id;
      button.innerHTML = `<span class="hash">#</span><span>${esc(channel.name)}</span>`;
      button.onclick = () => openChannel(channel.id);
      $("#textChannels").appendChild(button);
      continue;
    }

    const wrap = document.createElement("div");
    wrap.className = "voice-channel-wrap";

    const button = document.createElement("button");
    const isConnectedHere = state.inVoice && state.mediaContext?.kind === "server" && state.mediaContext.serverId === state.currentServer.id && state.mediaContext.channelId === channel.id;
    button.className = "channel-item voice-item" + (state.currentChannel?.id === channel.id ? " active" : "") + (isConnectedHere ? " connected-call" : "");
    button.dataset.channel = channel.id;

    const members = state.voiceStates[channel.id] || [];
    button.innerHTML = `<span>🔊</span><span>${esc(channel.name)}</span><small>${isConnectedHere ? "conectado" : (members.length ? members.length : "entrar")}</small>`;
    button.onclick = () => openChannel(channel.id);
    wrap.appendChild(button);

    const participants = document.createElement("div");
    participants.className = "voice-participants";

    if (!members.length) {
      participants.innerHTML = `<div class="voice-empty">Ninguém conectado</div>`;
    } else {
      for (const member of members) {
        const item = document.createElement("div");
        item.className = "voice-participant" + (member.user?.id === state.me?.id ? " me-in-call" : "");
        item.innerHTML = `<img class="avatar" src="${avatarUrl(member.user)}"><span>${esc(member.user?.nick || "Usuário")}</span><i class="mini-status"></i>`;
        participants.appendChild(item);
      }
    }

    wrap.appendChild(participants);
    $("#voiceChannels").appendChild(wrap);
  }
}

async function openChannel(channelId) {
  const channel = state.currentServer?.channels.find(c => c.id === channelId);
  if (!channel) return;

  state.currentChannel = channel;
  state.currentDM = null;
  state.chatMode = "server";

  renderChannels();
  $("#topTitle").textContent = channel.name;
  $("#topIcon").textContent = channel.type === "text" ? "#" : "🔊";
  $("#dmCallBtn").classList.add("hidden");

  $("#homeView").classList.add("hidden");

  if (channel.type === "text") {
    $("#chatView").classList.remove("hidden");
    $("#voiceView").classList.add("hidden");

    state.socket.emit("text:join", {
      serverId: state.currentServer.id,
      channelId: channel.id
    });

    const data = await API(`/api/servers/${state.currentServer.id}/channels/${channel.id}/messages`);
    $("#messages").innerHTML = `<div class="msg"><div></div><div class="msg-body"><div class="msg-text">Começo de <b>#${esc(channel.name)}</b>.</div></div></div>`;
    data.messages.forEach(message => appendMessage(message));
    $("#messageInput").placeholder = `Mensagem em #${channel.name}`;
    $("#messages").scrollTop = $("#messages").scrollHeight;
    closeMobileNav();
    return;
  }

  $("#chatView").classList.add("hidden");
  $("#voiceView").classList.remove("hidden");
  $("#voiceKindLabel").textContent = "CANAL DE VOZ";
  $("#voiceRoomName").textContent = channel.name;

  await joinServerVoice();
  closeMobileNav();
}

async function loadMembers() {
  if (!state.currentServer) return;
  const data = await API(`/api/servers/${state.currentServer.id}/members`);
  state.serverMembers = data.members || [];
  renderMembersList();
}

function renderMembersList(filter = "") {
  const box = $("#membersList");
  if (!box) return;

  const term = String(filter || "").trim().toLowerCase();
  const rows = (state.serverMembers || []).filter(member => {
    if (!term) return true;
    return `${member.nick || ""} ${member.username || ""}`.toLowerCase().includes(term);
  });

  $("#membersCount").textContent = state.serverMembers?.length || 0;
  box.innerHTML = "";

  if (!rows.length) {
    box.innerHTML = `<div class="invite-empty">${term ? "Nenhum membro encontrado." : "Nenhum membro neste servidor."}</div>`;
    return;
  }

  rows.sort((a, b) => {
    if (!!a.isOwner !== !!b.isOwner) return a.isOwner ? -1 : 1;
    return String(a.nick || a.username).localeCompare(String(b.nick || b.username), "pt-BR");
  });

  for (const member of rows) {
    const row = document.createElement("div");
    row.className = "member-row";
    row.dataset.memberId = member.id;
    row.innerHTML = `
      <span class="member-avatar-wrap">
        <img class="avatar" src="${avatarUrl(member)}" alt="${esc(member.nick || member.username)}">
        <i class="member-presence"></i>
      </span>
      <div class="member-meta">
        <strong>${esc(member.nick || member.username)}</strong>
        <span class="member-subline">
          <small>@${esc(member.username)}</small>
          ${member.isOwner ? `<span class="member-role">DONO</span>` : ""}
          ${member.id === state.me?.id ? `<span class="member-you">VOCÊ</span>` : ""}
        </span>
      </div>`;
    box.appendChild(row);
  }
}

$("#membersFilter").oninput = e => renderMembersList(e.target.value);

$("#membersToggle").onclick = () => {
  if (!state.currentServer) return;
  const panel = $("#membersPanel");
  const opening = panel.classList.contains("hidden");
  panel.classList.toggle("hidden");

  if (opening && window.innerWidth > 1100) panel.classList.add("server-visible");
  else panel.classList.remove("server-visible");

  if (opening && isMobileLayout()) closeMobileNav();
  updateMobileScrim();
};

async function openDM(friend) {
  state.currentServer = null;
  state.currentChannel = null;
  state.currentDM = friend;
  state.chatMode = "dm";
  renderServerIcons();

  $("#homeSidebar").classList.remove("hidden");
  $("#serverSidebar").classList.add("hidden");
  $("#inviteMemberBtn").classList.add("hidden");
  $("#membersPanel").classList.add("hidden");
  $("#membersPanel").classList.remove("server-visible");

  $("#homeView").classList.add("hidden");
  $("#chatView").classList.remove("hidden");
  $("#voiceView").classList.add("hidden");

  $("#sidebarTitle").textContent = "Mensagens";
  $("#topIcon").textContent = "💬";
  $("#topTitle").textContent = friend.nick;
  $("#addFriendTopBtn").classList.add("hidden");
  $("#membersToggle").classList.add("hidden");
  $("#dmCallBtn").classList.remove("hidden");

  state.socket.emit("dm:join", { friendId: friend.id });

  const data = await API(`/api/dms/${friend.id}/messages`);
  $("#messages").innerHTML = `<div class="msg"><div></div><div class="msg-body"><div class="msg-text">Conversa privada com <b>${esc(friend.nick)}</b>.</div></div></div>`;
  data.messages.forEach(message => appendMessage(message));
  $("#messageInput").placeholder = `Mensagem para ${friend.nick}`;
  $("#messages").scrollTop = $("#messages").scrollHeight;
  closeMobileNav();
}

function appendMessage(message, scroll = false) {
  if ($("#messages").querySelector(`[data-msg="${message.id}"]`)) return;

  const row = document.createElement("article");
  row.className = "msg";
  row.dataset.msg = message.id;

  let attachmentHtml = "";
  if (message.attachment?.url) {
    const a = message.attachment;
    if (String(a.type || "").startsWith("image/")) {
      attachmentHtml = `
        <a class="msg-attachment" href="${esc(a.url)}" target="_blank" rel="noopener">
          <img class="msg-image" src="${esc(a.url)}" alt="${esc(a.name || "imagem")}">
        </a>`;
    } else if (String(a.type || "").startsWith("video/")) {
      attachmentHtml = `
        <video class="msg-video" controls preload="metadata" playsinline src="${esc(a.url)}"></video>
        <div class="media-file-meta"><span>${esc(a.name || "vídeo")}</span><a href="${esc(a.url)}" target="_blank" rel="noopener" download>baixar</a></div>`;
    } else if (String(a.type || "").startsWith("audio/")) {
      attachmentHtml = `
        <audio class="msg-audio" controls preload="metadata" src="${esc(a.url)}"></audio>
        <div class="media-file-meta"><span>${esc(a.name || "áudio")}</span><a href="${esc(a.url)}" target="_blank" rel="noopener" download>baixar</a></div>`;
    } else {
      const size = a.size ? `${(a.size / 1024 / 1024).toFixed(2)} MB` : "arquivo";
      attachmentHtml = `
        <a class="msg-attachment file-card" href="${esc(a.url)}" target="_blank" rel="noopener" download>
          <span class="file-icon">FILE</span>
          <span><b>${esc(a.name || "arquivo")}</b><small>${esc(size)}</small></span>
        </a>`;
    }
  }

  row.innerHTML = `
    <img class="avatar" src="${avatarUrl(message.user)}">
    <div class="msg-body">
      <div class="msg-head">
        <strong>${esc(message.user?.nick || "Usuário")}</strong>
        <time>${new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time>
      </div>
      ${message.text ? `<div class="msg-text">${esc(message.text)}</div>` : ""}
      ${attachmentHtml}
    </div>`;

  $("#messages").appendChild(row);
  if (scroll) $("#messages").scrollTop = $("#messages").scrollHeight;
}

$("#sendBtn").onclick = () => sendCurrentMessage();
$("#messageInput").onkeydown = e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendCurrentMessage();
  }
};

function sendCurrentMessage(textOverride = null, attachment = null) {
  const text = textOverride === null ? $("#messageInput").value.trim() : String(textOverride || "").trim();
  if (!text && !attachment) return;

  if (state.chatMode === "server" && state.currentServer && state.currentChannel?.type === "text") {
    state.socket.emit("message:send", {
      serverId: state.currentServer.id,
      channelId: state.currentChannel.id,
      text,
      attachment
    });
  } else if (state.chatMode === "dm" && state.currentDM) {
    state.socket.emit("dm:send", {
      friendId: state.currentDM.id,
      text,
      attachment
    });
  } else {
    return;
  }

  $("#messageInput").value = "";
}

async function uploadFile(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    toast("O arquivo deve ter no máximo 20 MB.");
    return;
  }

  try {
    toast("Enviando arquivo...");
    const form = new FormData();
    form.append("file", file);
    const data = await API("/api/upload", { method: "POST", body: form });
    sendCurrentMessage("", data.attachment);
  } catch (err) {
    toast(err.message);
  }
}

$("#attachBtn").onclick = () => $("#fileInput").click();
$("#fileInput").onchange = async e => {
  await uploadFile(e.target.files?.[0]);
  e.target.value = "";
};

$("#gifBtn").onclick = () => $("#gifInput").click();
$("#gifInput").onchange = async e => {
  await uploadFile(e.target.files?.[0]);
  e.target.value = "";
};

$("#emojiBtn").onclick = e => {
  e.stopPropagation();
  $("#emojiPopover").classList.toggle("hidden");
};

$$("#emojiPopover button").forEach(button => {
  button.onclick = e => {
    e.stopPropagation();
    const input = $("#messageInput");
    input.value += button.textContent;
    input.focus();
  };
});

document.addEventListener("click", e => {
  if (!$("#emojiPopover").contains(e.target) && e.target !== $("#emojiBtn")) {
    $("#emojiPopover").classList.add("hidden");
  }
});


function sameMediaContext(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "server") return a.serverId === b.serverId && a.channelId === b.channelId;
  return a.friendId === b.friendId;
}

function activeMembersFromPeers() {
  const seen = new Set();
  const members = [];

  if (state.inVoice && state.me) {
    seen.add(state.me.id);
    members.push({ socketId: state.socket?.id || "local", user: state.me });
  }

  for (const [socketId, user] of state.peerUsers) {
    if (!user || seen.has(user.id)) continue;
    seen.add(user.id);
    members.push({ socketId, user });
  }

  return members;
}

function syncActiveCallMembersFromPeers() {
  if (!state.inVoice) {
    state.activeCallMembers = [];
    return;
  }

  // Para canal de servidor, voice:state/ack é a fonte principal.
  // Se ainda não chegou, os peers já conhecidos servem como fallback.
  if (state.mediaContext?.kind === "server" && state.activeCallMembers.length) {
    return;
  }

  state.activeCallMembers = activeMembersFromPeers();
}

function renderActiveCallParticipants() {
  const box = $("#activeCallParticipants");
  if (!box) return;

  if (!state.inVoice) {
    box.innerHTML = "";
    return;
  }

  let members = state.activeCallMembers || [];
  if (!members.length) members = activeMembersFromPeers();

  const unique = [];
  const seen = new Set();
  for (const member of members) {
    const user = member?.user;
    if (!user || seen.has(user.id)) continue;
    seen.add(user.id);
    unique.push(member);
  }

  box.innerHTML = "";
  const visible = unique.slice(0, 3);

  for (const member of visible) {
    const user = member.user;
    const item = document.createElement("div");
    item.className = "active-call-person";
    item.title = user.nick || user.username || "Participante";
    item.innerHTML = `<img class="avatar" src="${avatarUrl(user)}"><span>${esc(user.nick || user.username || "Usuário")}</span>`;
    box.appendChild(item);
  }

  if (unique.length > visible.length) {
    const more = document.createElement("span");
    more.className = "active-call-more";
    more.textContent = `+${unique.length - visible.length}`;
    box.appendChild(more);
  }
}

function updateActiveCallBar() {
  const bar = $("#activeCallBar");
  if (!bar) return;

  if (!state.inVoice || !state.mediaContext) {
    bar.classList.add("hidden");
    state.activeCallMembers = [];
    renderActiveCallParticipants();
    return;
  }

  bar.classList.remove("hidden");
  $("#activeCallTitle").textContent = state.mediaContext.title || "Chamada";
  $("#activeCallSubtitle").textContent = state.mediaContext.kind === "server"
    ? "Canal de voz conectado"
    : "Chamada privada conectada";

  syncActiveCallMembersFromPeers();
  renderActiveCallParticipants();
}

function broadcastMediaState() {
  if (!state.inVoice || !state.socket) return;
  state.socket.emit("media:state", {
    muted: !!state.muted,
    sharing: !!state.screenStream?.getVideoTracks().length,
    voiceStreamId: state.localStream?.id || null,
    screenStreamId: state.screenStream?.id || null,
    voiceTrackId: state.localStream?.getAudioTracks()?.[0]?.id || null,
    screenAudioTrackId: state.screenStream?.getAudioTracks()?.[0]?.id || null,
    screenVideoTrackId: state.screenStream?.getVideoTracks()?.[0]?.id || null
  });
}

function clampVolumePref(value) {
  return Math.min(2, Math.max(0, Number(value) || 0));
}

function preferenceToGain(value) {
  const v = clampVolumePref(value);
  // De 0-100% usa curva perceptiva: 50% ~= -12 dB, 25% ~= -24 dB.
  // Acima de 100%, permite ganho real de até 2x.
  return v <= 1 ? v * v : v;
}

function getVolumePrefs(user) {
  const key = user?.id || user?.username || "unknown";
  const stored = state.volumePrefs[key] || {};
  return {
    voice: Number.isFinite(Number(stored.voice)) ? clampVolumePref(stored.voice) : 1,
    stream: Number.isFinite(Number(stored.stream)) ? clampVolumePref(stored.stream) : 1
  };
}

function volumeIcon(value) {
  const n = Number(value);
  if (n <= 0) return "🔇";
  if (n < 0.35) return "🔈";
  if (n < 0.8) return "🔉";
  return "🔊";
}

async function ensureAudioEngine() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!state.audioContext) {
    try { state.audioContext = new AudioCtx({ latencyHint: "interactive" }); }
    catch { state.audioContext = new AudioCtx(); }
  }
  if (state.audioContext.state === "suspended") {
    try { await state.audioContext.resume(); } catch {}
  }
  return state.audioContext;
}

function destroyPeerAudioGraph(media) {
  if (!media) return;
  for (const node of media.audioSourceNodes || []) {
    try { node.disconnect(); } catch {}
  }
  media.audioSourceNodes = [];
  try { media.voiceGain?.disconnect(); } catch {}
  try { media.screenGain?.disconnect(); } catch {}
  media.voiceGain = null;
  media.screenGain = null;
}

async function rebuildPeerAudioGraph(socketId) {
  const media = state.remoteMedia.get(socketId);
  if (!media) return;
  const ctx = await ensureAudioEngine();
  if (!ctx) return;

  destroyPeerAudioGraph(media);

  media.voiceGain = ctx.createGain();
  media.screenGain = ctx.createGain();
  media.audioSourceNodes = [];
  media.voiceGain.connect(ctx.destination);
  media.screenGain.connect(ctx.destination);

  const user = state.peerUsers.get(socketId);
  const prefs = getVolumePrefs(user);
  media.voiceGain.gain.value = preferenceToGain(prefs.voice);
  media.screenGain.gain.value = preferenceToGain(prefs.stream);

  const connectTrack = (track, gainNode) => {
    if (!track || track.readyState === "ended") return;
    try {
      const holder = new MediaStream([track]);
      const source = ctx.createMediaStreamSource(holder);
      source.connect(gainNode);
      media.audioSourceNodes.push(source);
      // Mantém referência do MediaStream enquanto o node estiver ativo.
      source.__essenciaStream = holder;
    } catch (err) {
      console.warn("Não foi possível criar o mixer para uma faixa de áudio:", err);
    }
  };

  for (const track of media.voiceAudio?.getAudioTracks?.() || []) connectTrack(track, media.voiceGain);
  for (const track of media.screenAudio?.getAudioTracks?.() || []) connectTrack(track, media.screenGain);
}

function setVolumePref(user, kind, value) {
  if (!user || !["voice", "stream"].includes(kind)) return;
  const key = user.id || user.username || "unknown";
  state.volumePrefs[key] ||= { voice: 1, stream: 1 };
  state.volumePrefs[key][kind] = clampVolumePref(value);
  localStorage.setItem("essencia_volume_prefs", JSON.stringify(state.volumePrefs));
  applyPeerVolumesByUser(user);
  syncVisibleVolumeControls(user);
}

function applyPeerVolumesByUser(user) {
  if (!user) return;
  const prefs = getVolumePrefs(user);
  const ctx = state.audioContext;

  for (const [socketId, peerUser] of state.peerUsers) {
    if ((peerUser?.id || peerUser?.username) !== (user.id || user.username)) continue;
    const media = state.remoteMedia.get(socketId);
    const now = ctx?.currentTime || 0;

    if (media?.voiceGain && ctx) {
      const target = preferenceToGain(prefs.voice);
      media.voiceGain.gain.cancelScheduledValues(now);
      if (target === 0) media.voiceGain.gain.setValueAtTime(0, now);
      else media.voiceGain.gain.setTargetAtTime(target, now, 0.012);
    }
    if (media?.screenGain && ctx) {
      const target = preferenceToGain(prefs.stream);
      media.screenGain.gain.cancelScheduledValues(now);
      if (target === 0) media.screenGain.gain.setValueAtTime(0, now);
      else media.screenGain.gain.setTargetAtTime(target, now, 0.012);
    }

    // Fallback para navegadores sem Web Audio. Quando o mixer existe,
    // os elementos ficam mutados para não criar áudio duplicado.
    const tile = document.querySelector(`[data-peer="${socketId}"]`);
    const voiceAudio = tile?.querySelector("audio.voice-audio");
    const screenAudio = tile?.querySelector("audio.screen-audio");
    const usingMixer = !!state.audioContext;
    if (voiceAudio) {
      voiceAudio.muted = usingMixer;
      voiceAudio.volume = Math.min(1, prefs.voice);
    }
    if (screenAudio) {
      screenAudio.muted = usingMixer;
      screenAudio.volume = Math.min(1, prefs.stream);
    }
  }
}

function syncVisibleVolumeControls(user) {
  if (!user) return;
  const prefs = getVolumePrefs(user);

  if (state.streamVolumeContextPeer) {
    const contextUser = state.peerUsers.get(state.streamVolumeContextPeer);
    if ((contextUser?.id || contextUser?.username) === (user.id || user.username)) {
      const streamSlider = $("#streamContextVolumeSlider");
      const voiceSlider = $("#voiceContextVolumeSlider");
      if (streamSlider) streamSlider.value = Math.round(prefs.stream * 100);
      if (voiceSlider) voiceSlider.value = Math.round(prefs.voice * 100);
      if ($("#streamContextVolumeValue")) $("#streamContextVolumeValue").textContent = `${Math.round(prefs.stream * 100)}%`;
      if ($("#voiceContextVolumeValue")) $("#voiceContextVolumeValue").textContent = `${Math.round(prefs.voice * 100)}%`;
      if ($("#streamContextMuteBtn")) $("#streamContextMuteBtn").textContent = volumeIcon(prefs.stream);
      $$('.audio-presets').forEach(group => {
        const kind = group.dataset.kind;
        const current = Math.round((kind === "voice" ? prefs.voice : prefs.stream) * 100);
        group.querySelectorAll('button').forEach(btn => btn.classList.toggle('active', Number(btn.dataset.level) === current));
      });
    }
  }

  if (state.streamOverlayPeer && state.streamOverlayPeer !== "local") {
    const overlayUser = state.peerUsers.get(state.streamOverlayPeer);
    if ((overlayUser?.id || overlayUser?.username) === (user.id || user.username)) {
      const slider = $("#streamOverlayVolumeSlider");
      if (slider) slider.value = Math.round(prefs.stream * 100);
      if ($("#streamOverlayVolumeValue")) $("#streamOverlayVolumeValue").textContent = `${Math.round(prefs.stream * 100)}%`;
      if ($("#streamOverlayMuteBtn")) $("#streamOverlayMuteBtn").textContent = volumeIcon(prefs.stream);
    }
  }
}

function rebuildRemoteAudioStreams(socketId) {
  const media = state.remoteMedia.get(socketId);
  if (!media) return;

  media.voiceAudio ||= new MediaStream();
  media.screenAudio ||= new MediaStream();
  media.audioEntries ||= new Map();

  for (const track of [...media.voiceAudio.getTracks(), ...media.screenAudio.getTracks()]) {
    try { media.voiceAudio.removeTrack(track); } catch {}
    try { media.screenAudio.removeTrack(track); } catch {}
  }

  const liveEntries = [...media.audioEntries.values()].filter(entry => entry.track?.readyState !== "ended");

  for (const { track, streamId } of liveEntries) {
    const isVoiceByTrack = !!media.voiceTrackId && track.id === media.voiceTrackId;
    const isScreenByTrack = !!media.screenAudioTrackId && track.id === media.screenAudioTrackId;
    const isVoiceByStream = !!media.voiceStreamId && !!streamId && streamId === media.voiceStreamId;
    const isScreenByStream = !!media.screenStreamId && !!streamId && streamId === media.screenStreamId;

    let kind = null;
    if (isScreenByTrack || isScreenByStream) kind = "screen";
    else if (isVoiceByTrack || isVoiceByStream) kind = "voice";

    if (!kind) {
      // Durante um compartilhamento, áudio sem identificação que não pertence
      // claramente ao microfone é tratado como áudio da tela. Isso evita o bug
      // em que o som da transmissão ficava preso no controle de voz.
      if (media.sharing) {
        if (!media.voiceTrackId && !media.voiceStreamId) kind = "screen";
        else if (streamId && media.voiceStreamId && streamId !== media.voiceStreamId) kind = "screen";
        else kind = "voice";
      } else {
        kind = "voice";
      }
    }

    const target = kind === "screen" ? media.screenAudio : media.voiceAudio;
    if (!target.getTracks().some(t => t.id === track.id)) target.addTrack(track);
  }

  rebuildPeerAudioGraph(socketId).then(() => {
    const user = state.peerUsers.get(socketId);
    if (user) applyPeerVolumesByUser(user);
    attachRemoteMediaToTile(socketId);
  });
}

function openVolumeControls(socketId) {
  ensureAudioEngine();
  const user = state.peerUsers.get(socketId);
  if (!user) return;
  const prefs = getVolumePrefs(user);
  const media = state.remoteMedia.get(socketId);
  const hasScreenAudio = !!media?.screenAudio?.getAudioTracks().length;

  modal(
    `Volume de ${user.nick || user.username}`,
    "Ajuste separadamente a voz da pessoa e o áudio da transmissão.",
    `<div class="volume-control-modal">
      <label class="volume-row">
        <div><strong>🎙️ Voz</strong><span id="voiceVolumeValue">${Math.round(prefs.voice * 100)}%</span></div>
        <input id="voiceVolumeSlider" type="range" min="0" max="200" step="1" value="${Math.round(prefs.voice * 100)}">
      </label>
      <label class="volume-row ${hasScreenAudio ? "" : "volume-unavailable"}">
        <div><strong>🖥️ Transmissão</strong><span id="streamVolumeValue">${Math.round(prefs.stream * 100)}%</span></div>
        <input id="streamVolumeSlider" type="range" min="0" max="200" step="1" value="${Math.round(prefs.stream * 100)}" ${hasScreenAudio ? "" : "disabled"}>
        <small>${hasScreenAudio ? "Controla somente o áudio compartilhado pela tela." : "Esta transmissão não está enviando áudio agora."}</small>
      </label>
    </div>`,
    async () => {},
    "Fechar"
  );

  const voice = $("#voiceVolumeSlider");
  const stream = $("#streamVolumeSlider");
  voice.oninput = () => {
    $("#voiceVolumeValue").textContent = `${voice.value}%`;
    setVolumePref(user, "voice", Number(voice.value) / 100);
  };
  if (stream) stream.oninput = () => {
    $("#streamVolumeValue").textContent = `${stream.value}%`;
    setVolumePref(user, "stream", Number(stream.value) / 100);
  };
}

function closeStreamVolumeContext() {
  state.streamVolumeContextPeer = null;
  $("#streamVolumeContext")?.classList.add("hidden");
}

function openStreamVolumeContext(socketId, clientX, clientY) {
  ensureAudioEngine();
  const user = state.peerUsers.get(socketId);
  const media = state.remoteMedia.get(socketId);
  if (!user || !media?.sharing) return;

  state.streamVolumeContextPeer = socketId;
  const prefs = getVolumePrefs(user);
  const menu = $("#streamVolumeContext");

  $("#streamContextUser").textContent = `${user.nick || user.username} • áudio`;
  $("#streamContextVolumeSlider").value = Math.round(prefs.stream * 100);
  $("#voiceContextVolumeSlider").value = Math.round(prefs.voice * 100);
  $("#streamContextVolumeValue").textContent = `${Math.round(prefs.stream * 100)}%`;
  $("#voiceContextVolumeValue").textContent = `${Math.round(prefs.voice * 100)}%`;
  $("#streamContextMuteBtn").textContent = volumeIcon(prefs.stream);
  $("#streamContextMuteBtn").dataset.previous = String(prefs.stream > 0 ? prefs.stream : 1);

  menu.classList.remove("hidden");
  syncVisibleVolumeControls(user);

  // Mantém o menu dentro da viewport.
  const rect = menu.getBoundingClientRect();
  const margin = 10;
  const left = Math.min(Math.max(margin, clientX), window.innerWidth - rect.width - margin);
  const top = Math.min(Math.max(margin, clientY), window.innerHeight - rect.height - margin);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

$("#streamContextVolumeSlider").oninput = e => {
  const socketId = state.streamVolumeContextPeer;
  const user = state.peerUsers.get(socketId);
  if (!user) return;
  setVolumePref(user, "stream", Number(e.target.value) / 100);
};

$("#voiceContextVolumeSlider").oninput = e => {
  const socketId = state.streamVolumeContextPeer;
  const user = state.peerUsers.get(socketId);
  if (!user) return;
  setVolumePref(user, "voice", Number(e.target.value) / 100);
};

$$('.audio-presets button').forEach(button => {
  button.onclick = () => {
    const socketId = state.streamVolumeContextPeer;
    const user = state.peerUsers.get(socketId);
    if (!user) return;
    const kind = button.closest('.audio-presets')?.dataset.kind;
    const level = Number(button.dataset.level || 100);
    if (!['voice','stream'].includes(kind)) return;
    setVolumePref(user, kind, level / 100);
  };
});

$("#streamContextMuteBtn").onclick = () => {
  const socketId = state.streamVolumeContextPeer;
  const user = state.peerUsers.get(socketId);
  if (!user) return;
  const prefs = getVolumePrefs(user);
  const previous = Number($("#streamContextMuteBtn").dataset.previous || 1);
  if (prefs.stream > 0) {
    $("#streamContextMuteBtn").dataset.previous = String(prefs.stream);
    setVolumePref(user, "stream", 0);
  } else {
    setVolumePref(user, "stream", previous > 0 ? previous : 1);
  }
};

document.addEventListener("pointerdown", e => {
  const menu = $("#streamVolumeContext");
  if (!menu || menu.classList.contains("hidden")) return;
  if (!menu.contains(e.target)) closeStreamVolumeContext();
});

window.addEventListener("blur", closeStreamVolumeContext);
window.addEventListener("resize", closeStreamVolumeContext);

async function showActiveCall() {
  if (!state.inVoice || !state.mediaContext) return;
  const ctx = state.mediaContext;
  if (ctx.kind === "server") {
    const server = state.servers.find(s => s.id === ctx.serverId);
    if (!server) return;
    state.currentServer = server;
    state.currentDM = null;
    state.chatMode = "server";
    renderServerIcons();
    $("#homeSidebar").classList.add("hidden");
    $("#serverSidebar").classList.remove("hidden");
    $("#inviteMemberBtn").classList.remove("hidden");
    $("#sidebarTitle").textContent = server.name;
    await loadVoiceStates();
    renderChannels();
    await loadMembers();
    const channel = server.channels.find(c => c.id === ctx.channelId);
    if (channel) {
      state.currentChannel = channel;
      $("#homeView").classList.add("hidden");
      $("#chatView").classList.add("hidden");
      $("#voiceView").classList.remove("hidden");
      $("#topIcon").textContent = "🔊";
      $("#topTitle").textContent = channel.name;
      $("#voiceKindLabel").textContent = "CANAL DE VOZ";
      $("#voiceRoomName").textContent = channel.name;
      renderChannels();
      renderVideoGrid();
    }
  } else {
    const friend = (state.friends?.friends || []).find(f => f.id === ctx.friendId) || state.currentDM;
    if (!friend) return;
    state.currentServer = null;
    state.currentChannel = null;
    state.currentDM = friend;
    state.chatMode = "dm";
    renderServerIcons();
    $("#homeSidebar").classList.remove("hidden");
    $("#serverSidebar").classList.add("hidden");
    $("#inviteMemberBtn").classList.add("hidden");
    $("#membersPanel").classList.add("hidden");
  $("#membersPanel").classList.remove("server-visible");
    $("#homeView").classList.add("hidden");
    $("#chatView").classList.add("hidden");
    $("#voiceView").classList.remove("hidden");
    $("#sidebarTitle").textContent = "Mensagens";
    $("#topIcon").textContent = "📞";
    $("#topTitle").textContent = friend.nick;
    $("#voiceKindLabel").textContent = "CHAMADA PRIVADA";
    $("#voiceRoomName").textContent = friend.nick;
    renderVideoGrid();
  }
}

$("#showActiveCallBtn").onclick = () => showActiveCall();
$("#disconnectCallBtn").onclick = async () => {
  const wasVoiceView = !$("#voiceView").classList.contains("hidden");
  await leaveVoice(wasVoiceView);
};

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

async function ensureLocalAudio() {
  if (state.localStream) return;

  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });
    state.micAvailable = !!state.localStream.getAudioTracks().length;
    state.muted = false;
  } catch {
    state.localStream = new MediaStream();
    state.micAvailable = false;
    state.muted = true;
    toast("Você entrou sem microfone. Ainda pode ouvir e assistir.");
  }

  updateMicButton();
}

function updateMicButton() {
  const button = $("#micBtn");
  button.classList.toggle("off", state.muted || !state.micAvailable);
  button.innerHTML = state.micAvailable
    ? `${state.muted ? "🔇" : "🎙️"}<span>${state.muted ? "Silenciado" : "Microfone"}</span>`
    : `🚫<span>Sem microfone</span>`;
}

async function joinServerVoice() {
  if (!state.currentServer || state.currentChannel?.type !== "voice") return;
  await enterMediaRoom({
    kind: "server",
    serverId: state.currentServer.id,
    channelId: state.currentChannel.id,
    title: state.currentChannel.name
  });
}

async function startDmCall(friend, ring = true) {
  if (!friend) return;

  state.currentServer = null;
  state.currentChannel = null;
  state.currentDM = friend;
  state.chatMode = "dm";
  renderServerIcons();

  $("#homeSidebar").classList.remove("hidden");
  $("#serverSidebar").classList.add("hidden");
  $("#inviteMemberBtn").classList.add("hidden");
  $("#membersPanel").classList.add("hidden");
  $("#membersPanel").classList.remove("server-visible");
  $("#homeView").classList.add("hidden");
  $("#chatView").classList.add("hidden");
  $("#voiceView").classList.remove("hidden");

  $("#sidebarTitle").textContent = "Mensagens";
  $("#topIcon").textContent = "📞";
  $("#topTitle").textContent = friend.nick;
  $("#addFriendTopBtn").classList.add("hidden");
  $("#membersToggle").classList.add("hidden");
  $("#dmCallBtn").classList.add("hidden");
  $("#voiceKindLabel").textContent = "CHAMADA PRIVADA";
  $("#voiceRoomName").textContent = friend.nick;

  await enterMediaRoom({
    kind: "dm",
    friendId: friend.id,
    title: friend.nick
  });

  if (ring) {
    state.socket.emit("dmcall:ring", { friendId: friend.id });
    toast(`Chamando ${friend.nick}...`);
  }
}

$("#dmCallBtn").onclick = () => {
  if (state.currentDM) startDmCall(state.currentDM, true);
};

async function enterMediaRoom(context) {
  if (state.inVoice && sameMediaContext(state.mediaContext, context)) {
    state.mediaContext = { ...state.mediaContext, ...context };
    updateActiveCallBar();
    renderVideoGrid();
    return;
  }

  if (state.inVoice) await leaveVoice(false);

  await ensureLocalAudio();
  await ensureAudioEngine();

  state.inVoice = true;
  state.mediaContext = context;
  state.peerConnections.clear();
  state.peerUsers.clear();
  state.remoteMedia.clear();
  updateActiveCallBar();

  if (context.kind === "server") {
    state.activeCallMembers = [];

    const response = await new Promise(resolve => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        resolve(null);
      }, 1600);

      state.socket.emit("voice:join", {
        serverId: context.serverId,
        channelId: context.channelId
      }, ack => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(ack || null);
      });
    });

    if (response?.ok) {
      state.activeCallMembers = response.members || [];

      if (state.currentServer?.id === context.serverId) {
        state.voiceStates[context.channelId] = response.members || [];
        renderChannels();
      }
    } else if (state.currentServer?.id === context.serverId) {
      // Fallback para instalações/servidores antigos sem ACK.
      try {
        await loadVoiceStates();
        state.activeCallMembers = state.voiceStates[context.channelId] || [];
        renderChannels();
      } catch {}
    }

    updateActiveCallBar();
  } else {
    state.activeCallMembers = activeMembersFromPeers();
    state.socket.emit("dmvoice:join", { friendId: context.friendId });
  }

  renderVideoGrid();
  broadcastMediaState();
}

async function createPeer(socketId, initiator) {
  if (state.peerConnections.has(socketId)) return state.peerConnections.get(socketId);

  const pc = new RTCPeerConnection(rtcConfig);
  state.peerConnections.set(socketId, pc);
  state.remoteMedia.set(socketId, {
    voiceAudio: new MediaStream(),
    screenAudio: new MediaStream(),
    video: new MediaStream(),
    audioEntries: new Map(),
    voiceStreamId: null,
    screenStreamId: null,
    voiceTrackId: null,
    screenAudioTrackId: null,
    screenVideoTrackId: null,
    sharing: false,
    muted: false,
    voiceGain: null,
    screenGain: null,
    audioSourceNodes: []
  });

  const audioTracks = state.localStream?.getAudioTracks() || [];
  if (audioTracks.length) {
    for (const track of audioTracks) pc.addTrack(track, state.localStream);
  } else {
    pc.addTransceiver("audio", { direction: "recvonly" });
  }

  const screenVideo = state.screenStream?.getVideoTracks()?.[0];
  if (screenVideo) {
    pc.addTrack(screenVideo, state.screenStream);
  } else {
    pc.addTransceiver("video", { direction: "recvonly" });
  }

  const screenAudio = state.screenStream?.getAudioTracks()?.[0];
  if (screenAudio) pc.addTrack(screenAudio, state.screenStream);

  if (screenVideo) {
    setTimeout(() => setScreenSenderQuality(pc, state.quality), 0);
  }

  pc.onicecandidate = e => {
    if (e.candidate) state.socket.emit("webrtc:ice", { to: socketId, candidate: e.candidate });
  };

  pc.ontrack = e => {
    const media = state.remoteMedia.get(socketId);
    if (!media) return;

    const streamId = e.streams?.[0]?.id || null;
    if (e.track.kind === "video") {
      media.sharing = true;
      if (streamId) media.screenStreamId = streamId;
      if (!media.video.getTracks().some(t => t.id === e.track.id)) media.video.addTrack(e.track);
      rebuildRemoteAudioStreams(socketId);
      e.track.onended = () => {
        try { media.video.removeTrack(e.track); } catch {}
        attachRemoteMediaToTile(socketId);
      };
    } else {
      media.audioEntries.set(e.track.id, { track: e.track, streamId });
      rebuildRemoteAudioStreams(socketId);
      e.track.onended = () => {
        media.audioEntries.delete(e.track.id);
        rebuildRemoteAudioStreams(socketId);
      };
    }

    renderVideoGrid();
    refreshOpenStreamOverlay();
  };

  pc.onconnectionstatechange = () => {
    if (["failed", "closed"].includes(pc.connectionState)) removePeer(socketId);
  };

  if (initiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    state.socket.emit("webrtc:offer", { to: socketId, sdp: pc.localDescription });
  }

  return pc;
}

function attachRemoteMediaToTile(socketId) {
  const media = state.remoteMedia.get(socketId);
  const tile = document.querySelector(`[data-peer="${socketId}"]`);
  if (!media || !tile) return;

  const video = tile.querySelector("video");
  const voiceAudio = tile.querySelector("audio.voice-audio");
  const screenAudio = tile.querySelector("audio.screen-audio");
  const fallback = tile.querySelector(".video-fallback");

  const isSharing = media.sharing && media.video.getVideoTracks().length > 0;
  tile.classList.toggle("remote-sharing", isSharing);
  if (isSharing) {
    video.srcObject = media.video;
    video.classList.remove("hidden");
    fallback.classList.add("hidden");
    video.play().catch(() => {});
  } else {
    video.srcObject = null;
    video.classList.add("hidden");
    fallback.classList.remove("hidden");
  }

  const badge = tile.querySelector(".tile-badge");
  if (badge) badge.textContent = isSharing ? "Transmitindo" : (media.muted ? "Silenciado" : "");
  const fullscreen = tile.querySelector(".tile-fullscreen");
  if (fullscreen) fullscreen.classList.toggle("hidden", !isSharing);

  const user = state.peerUsers.get(socketId);
  const prefs = getVolumePrefs(user);
  const usingMixer = !!state.audioContext;
  if (voiceAudio) {
    voiceAudio.srcObject = media.voiceAudio;
    voiceAudio.muted = usingMixer;
    voiceAudio.volume = Math.min(1, prefs.voice);
    if (!usingMixer) voiceAudio.play().catch(() => {});
  }
  if (screenAudio) {
    screenAudio.srcObject = media.screenAudio;
    screenAudio.muted = usingMixer;
    screenAudio.volume = Math.min(1, prefs.stream);
    if (!usingMixer) screenAudio.play().catch(() => {});
  }
  renderStreamOverlayParticipants();
}

function removePeer(socketId) {
  const wasOpen = state.streamOverlayPeer === socketId;
  destroyPeerAudioGraph(state.remoteMedia.get(socketId));
  state.peerConnections.get(socketId)?.close();
  state.peerConnections.delete(socketId);
  state.peerUsers.delete(socketId);
  state.remoteMedia.delete(socketId);
  renderVideoGrid();
  if (wasOpen) refreshOpenStreamOverlay();
}

function renderVideoGrid() {
  const box = $("#videoGrid");
  box.innerHTML = "";

  const local = document.createElement("div");
  local.className = "video-tile";
  local.dataset.peer = "local";

  const localSharing = !!state.screenStream?.getVideoTracks().length;
  if (localSharing) {
    local.classList.add("local-sharing");
    local.innerHTML = `
      <video autoplay muted playsinline></video>
      <span class="tile-name">Você</span>
      <span class="tile-badge">Transmitindo</span>
      <span class="local-share-note">Se compartilhar esta própria página, o efeito de espelho é normal.</span>
      <button class="tile-fullscreen" title="Abrir sua transmissão">⛶</button>`;
    const video = local.querySelector("video");
    video.srcObject = state.screenStream;
    video.play().catch(() => {});
    local.querySelector(".tile-fullscreen").onclick = e => {
      e.stopPropagation();
      openStreamOverlay("local");
    };
    local.ondblclick = () => openStreamOverlay("local");
  } else {
    local.innerHTML = `
      <div class="video-fallback">
        <div>
          <img class="avatar" src="${avatarUrl(state.me)}">
          <span>${esc(state.me.nick)}</span>
        </div>
      </div>
      <span class="tile-name">Você</span>
      <span class="tile-badge">${state.micAvailable ? (state.muted ? "Silenciado" : "") : "Sem microfone"}</span>`;
  }
  box.appendChild(local);

  for (const [socketId, user] of state.peerUsers) {
    const tile = document.createElement("div");
    tile.className = "video-tile";
    tile.dataset.peer = socketId;
    tile.innerHTML = `
      <div class="video-fallback">
        <div>
          <img class="avatar" src="${avatarUrl(user)}">
          <span>${esc(user?.nick || "Usuário")}</span>
        </div>
      </div>
      <video autoplay playsinline class="hidden"></video>
      <audio class="voice-audio" autoplay></audio>
      <audio class="screen-audio" autoplay></audio>
      <span class="tile-name">${esc(user?.nick || "Usuário")}</span>
      <span class="tile-badge"></span>
      <button class="tile-volume" title="Ajustar volume">🔊</button>
      <button class="tile-fullscreen hidden" title="Abrir transmissão">⛶</button>`;
    tile.querySelector(".tile-volume").onclick = e => {
      e.stopPropagation();
      openVolumeControls(socketId);
    };
    tile.querySelector(".tile-fullscreen").onclick = e => {
      e.stopPropagation();
      openStreamOverlay(socketId);
    };
    tile.ondblclick = () => {
      const media = state.remoteMedia.get(socketId);
      if (media?.sharing) openStreamOverlay(socketId);
    };
    const media = state.remoteMedia.get(socketId);
    tile.classList.toggle("remote-sharing", !!media?.sharing);
    tile.oncontextmenu = e => {
      const currentMedia = state.remoteMedia.get(socketId);
      if (!currentMedia?.sharing) return;
      e.preventDefault();
      e.stopPropagation();
      openStreamVolumeContext(socketId, e.clientX, e.clientY);
    };

    box.appendChild(tile);
    attachRemoteMediaToTile(socketId);
  }

  renderStreamOverlayParticipants();
}
function getOverlayStream(peerId) {
  if (peerId === "local") return state.screenStream;
  const media = state.remoteMedia.get(peerId);
  return media?.sharing ? media.video : null;
}

function renderStreamOverlayParticipants() {
  const box = $("#streamParticipants");
  if (!box) return;
  box.innerHTML = "";

  const people = [{
    id: "local",
    user: state.me,
    sharing: !!state.screenStream?.getVideoTracks().length,
    muted: state.muted,
    me: true
  }];

  for (const [socketId, user] of state.peerUsers) {
    const media = state.remoteMedia.get(socketId);
    people.push({
      id: socketId,
      user,
      sharing: !!(media?.sharing && media.video.getVideoTracks().length),
      muted: !!media?.muted,
      me: false
    });
  }

  $("#streamParticipantsCount").textContent = `${people.length} ${people.length === 1 ? "participante" : "participantes"}`;

  for (const p of people) {
    const item = document.createElement("div");
    item.className = `stream-participant${p.sharing ? " broadcasting" : ""}${p.me ? " me" : ""}`;
    item.innerHTML = `
      <img class="avatar" src="${avatarUrl(p.user)}">
      <div class="stream-participant-meta">
        <strong>${esc(p.user?.nick || "Usuário")}${p.me ? " (você)" : ""}</strong>
        <small>${p.sharing ? "🖥️ transmitindo" : (p.muted ? "🔇 silenciado" : "na chamada")}</small>
      </div>
      ${p.me ? "" : '<button class="stream-volume-btn" title="Ajustar volume">🔊</button>'}`;
    if (!p.me) {
      const volumeBtn = item.querySelector(".stream-volume-btn");
      volumeBtn.onclick = e => {
        e.stopPropagation();
        openVolumeControls(p.id);
      };
    }
    if (p.sharing) {
      item.style.cursor = "pointer";
      item.title = "Ver transmissão";
      item.onclick = () => openStreamOverlay(p.id);
    }
    box.appendChild(item);
  }
}

function openStreamOverlay(peerId) {
  if (isMobileLayout()) closeMobilePanels();
  const stream = getOverlayStream(peerId);
  if (!stream?.getVideoTracks().length) {
    toast("Essa transmissão não está disponível agora.");
    return;
  }

  state.streamOverlayPeer = peerId;
  const user = peerId === "local" ? state.me : state.peerUsers.get(peerId);
  $("#streamOverlayTitle").textContent = `${user?.nick || "Usuário"} • transmissão`;
  const video = $("#streamOverlayVideo");
  video.muted = true;
  video.srcObject = stream;
  $("#streamOverlayEmpty").classList.add("hidden");
  $("#streamOverlay").classList.remove("hidden");
  updateStreamOverlayVolumeBar();
  renderStreamOverlayParticipants();
  video.play().catch(() => {});
}

function refreshOpenStreamOverlay() {
  if (!state.streamOverlayPeer) return;
  const stream = getOverlayStream(state.streamOverlayPeer);
  const video = $("#streamOverlayVideo");
  if (!stream?.getVideoTracks().length) {
    video.srcObject = null;
    $("#streamOverlayEmpty").classList.remove("hidden");
    return;
  }
  $("#streamOverlayEmpty").classList.add("hidden");
  if (video.srcObject !== stream) video.srcObject = stream;
  updateStreamOverlayVolumeBar();
  renderStreamOverlayParticipants();
}

function updateStreamOverlayVolumeBar() {
  const bar = $("#streamOverlayVolumeBar");
  if (!bar) return;

  const peerId = state.streamOverlayPeer;
  if (!peerId || peerId === "local") {
    bar.classList.add("hidden");
    return;
  }

  const user = state.peerUsers.get(peerId);
  const media = state.remoteMedia.get(peerId);
  if (!user || !media?.sharing) {
    bar.classList.add("hidden");
    return;
  }

  const prefs = getVolumePrefs(user);
  bar.classList.remove("hidden");
  $("#streamOverlayVolumeSlider").value = Math.round(prefs.stream * 100);
  $("#streamOverlayVolumeValue").textContent = `${Math.round(prefs.stream * 100)}%`;
  $("#streamOverlayMuteBtn").textContent = volumeIcon(prefs.stream);
  if (prefs.stream > 0) $("#streamOverlayMuteBtn").dataset.previous = String(prefs.stream);
}

$("#streamOverlayVolumeSlider").oninput = e => {
  const peerId = state.streamOverlayPeer;
  if (!peerId || peerId === "local") return;
  const user = state.peerUsers.get(peerId);
  if (!user) return;
  setVolumePref(user, "stream", Number(e.target.value) / 100);
};

$("#streamOverlayMuteBtn").onclick = () => {
  const peerId = state.streamOverlayPeer;
  if (!peerId || peerId === "local") return;
  const user = state.peerUsers.get(peerId);
  if (!user) return;

  const prefs = getVolumePrefs(user);
  const btn = $("#streamOverlayMuteBtn");
  const previous = Number(btn.dataset.previous || 1);

  if (prefs.stream > 0) {
    btn.dataset.previous = String(prefs.stream);
    setVolumePref(user, "stream", 0);
  } else {
    setVolumePref(user, "stream", previous > 0 ? previous : 1);
  }
};

$("#streamOverlayVideo").oncontextmenu = e => {
  const peerId = state.streamOverlayPeer;
  if (!peerId || peerId === "local") return;
  e.preventDefault();
  e.stopPropagation();
  openStreamVolumeContext(peerId, e.clientX, e.clientY);
};

function closeStreamOverlay() {
  state.streamOverlayPeer = null;
  const video = $("#streamOverlayVideo");
  if (video) video.srcObject = null;
  $("#streamOverlay")?.classList.add("hidden");
  $("#streamOverlayEmpty")?.classList.add("hidden");
  $("#streamOverlayVolumeBar")?.classList.add("hidden");
  closeStreamVolumeContext();
}
$("#closeStreamOverlayBtn").onclick = closeStreamOverlay;
$("#browserFullscreenBtn").onclick = async () => {
  const overlay = $("#streamOverlay");
  try {
    if (!document.fullscreenElement) await overlay.requestFullscreen?.();
    else await document.exitFullscreen?.();
  } catch {
    toast("O navegador não permitiu tela cheia.");
  }
};
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!$("#streamVolumeContext").classList.contains("hidden")) {
    closeStreamVolumeContext();
    return;
  }
  if (!$("#streamOverlay").classList.contains("hidden")) closeStreamOverlay();
});

$("#micBtn").onclick = () => {
  if (!state.inVoice) return;

  if (!state.micAvailable) {
    toast("Você entrou sem microfone.");
    return;
  }

  state.muted = !state.muted;
  state.localStream?.getAudioTracks().forEach(track => track.enabled = !state.muted);
  updateMicButton();
  renderVideoGrid();
  broadcastMediaState();
};

$("#leaveVoiceBtn").onclick = () => leaveVoice(true);

async function leaveVoice(goBack = true) {
  if (!state.inVoice) return;

  const leavingContext = state.mediaContext;
  const wasVoiceView = !$("#voiceView").classList.contains("hidden");

  state.socket?.emit("voice:leave");
  state.inVoice = false;

  for (const media of state.remoteMedia.values()) destroyPeerAudioGraph(media);
  for (const pc of state.peerConnections.values()) pc.close();
  state.peerConnections.clear();
  state.peerUsers.clear();
  state.remoteMedia.clear();

  state.localStream?.getTracks().forEach(track => track.stop());
  state.localStream = null;

  state.screenStream?.getTracks().forEach(track => track.stop());
  state.screenStream = null;

  state.mediaContext = null;
  state.activeCallMembers = [];
  state.micAvailable = true;
  state.muted = false;
  $("#screenBtn").classList.remove("active");
  $("#qualityBadge").textContent = "Voz";
  updateMicButton();
  updateActiveCallBar();
  closeStreamOverlay();

  if (state.currentServer) {
    try { await loadVoiceStates(); } catch {}
    renderChannels();
  }

  if (!goBack || !wasVoiceView) return;

  if (leavingContext?.kind === "dm" && state.currentDM) {
    await openDM(state.currentDM);
    return;
  }

  if (state.currentServer) {
    const textChannel = state.currentServer.channels.find(c => c.type === "text");
    if (textChannel) await openChannel(textChannel.id);
  }
}

const STREAM_QUALITIES = [
  { label: "720p · 30 FPS", width: 1280, height: 720, frameRate: 30, bitrate: 2500000, hint: "Boa qualidade com menor uso de internet." },
  { label: "720p · 60 FPS", width: 1280, height: 720, frameRate: 60, bitrate: 4500000, hint: "Mais fluidez para jogos e movimentos." },
  { label: "1080p · 30 FPS", width: 1920, height: 1080, frameRate: 30, bitrate: 5500000, hint: "Imagem mais nítida com movimento moderado." },
  { label: "1080p · 60 FPS", width: 1920, height: 1080, frameRate: 60, bitrate: 8500000, hint: "Máxima nitidez e fluidez; exige mais PC e internet." }
];

async function setScreenSenderQuality(pc, quality) {
  const videoSender = pc.getSenders().find(sender => sender.track?.kind === "video");
  if (!videoSender) return;

  try {
    const params = videoSender.getParameters();
    params.degradationPreference = quality.frameRate >= 60 ? "balanced" : "maintain-resolution";
    params.encodings ||= [{}];
    if (!params.encodings.length) params.encodings = [{}];
    params.encodings[0].maxBitrate = quality.bitrate;
    params.encodings[0].maxFramerate = quality.frameRate;
    params.encodings[0].networkPriority = "high";
    await videoSender.setParameters(params);
  } catch {}
}

async function applyQualityToActiveShare(quality, announce = true) {
  state.quality = { ...quality };
  localStorage.setItem("essencia_stream_quality", JSON.stringify(state.quality));
  $("#qualityBadge").textContent = state.screenStream ? state.quality.label : "Voz";

  if (!state.screenStream) {
    if (announce) toast(`Qualidade selecionada: ${state.quality.label}`);
    return;
  }

  const track = state.screenStream.getVideoTracks()[0];
  if (track) {
    try {
      track.contentHint = quality.frameRate >= 60 ? "motion" : "detail";
    } catch {}
    try {
      await track.applyConstraints({
        width: { ideal: quality.width, max: quality.width },
        height: { ideal: quality.height, max: quality.height },
        frameRate: { ideal: quality.frameRate, max: quality.frameRate },
        resizeMode: "crop-and-scale"
      });
    } catch {
      try {
        await track.applyConstraints({
          width: { ideal: quality.width },
          height: { ideal: quality.height },
          frameRate: { ideal: quality.frameRate, max: quality.frameRate }
        });
      } catch {}
    }
  }

  await Promise.all([...state.peerConnections.values()].map(pc => setScreenSenderQuality(pc, quality)));
  refreshOpenStreamOverlay();
  if (announce) toast(`Transmissão ajustada para ${state.quality.label}.`);
}

$("#screenBtn").onclick = async () => {
  if (!state.inVoice) return;

  if (state.screenStream) {
    await stopScreen();
    return;
  }

  try {
    const q = state.quality;
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: q.width, max: q.width },
        height: { ideal: q.height, max: q.height },
        frameRate: { ideal: q.frameRate, max: q.frameRate },
        resizeMode: "crop-and-scale"
      },
      audio: true,
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
      systemAudio: "include"
    });

    state.screenStream = stream;

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      try { videoTrack.contentHint = q.frameRate >= 60 ? "motion" : "detail"; } catch {}
      try {
        await videoTrack.applyConstraints({
          width: { ideal: q.width, max: q.width },
          height: { ideal: q.height, max: q.height },
          frameRate: { ideal: q.frameRate, max: q.frameRate },
          resizeMode: "crop-and-scale"
        });
      } catch {}
      videoTrack.onended = () => stopScreen();
    }

    const screenAudio = stream.getAudioTracks()[0];

    for (const pc of state.peerConnections.values()) {
      if (videoTrack) {
        const emptyVideoTransceiver = pc.getTransceivers().find(t =>
          t.receiver?.track?.kind === "video" && !t.sender.track
        );

        if (emptyVideoTransceiver) {
          emptyVideoTransceiver.direction = "sendrecv";
          await emptyVideoTransceiver.sender.replaceTrack(videoTrack);
        } else {
          pc.addTrack(videoTrack, stream);
        }
      }

      if (screenAudio) pc.addTrack(screenAudio, stream);
      await setScreenSenderQuality(pc, q);
    }

    await renegotiateAll();
    await applyQualityToActiveShare(q, false);
    $("#screenBtn").classList.add("active");
    $("#qualityBadge").textContent = state.quality.label;
    broadcastMediaState();
    renderVideoGrid();
    refreshOpenStreamOverlay();

    const settings = videoTrack?.getSettings?.() || {};
    const actual = settings.width && settings.height
      ? ` Captura atual: ${settings.width}×${settings.height}${settings.frameRate ? ` a ~${Math.round(settings.frameRate)} FPS` : ""}.`
      : "";
    toast(`Transmissão iniciada em ${state.quality.label}.${actual}`);
  } catch (err) {
    console.error(err);
    toast("Compartilhamento cancelado ou bloqueado pelo navegador.");
  }
};
async function stopScreen() {
  if (!state.screenStream) return;

  const tracks = [...state.screenStream.getTracks()];

  for (const pc of state.peerConnections.values()) {
    for (const transceiver of pc.getTransceivers()) {
      const senderTrack = transceiver.sender?.track;
      if (!senderTrack || !tracks.includes(senderTrack)) continue;

      if (senderTrack.kind === "video") {
        try {
          await transceiver.sender.replaceTrack(null);
          transceiver.direction = "recvonly";
        } catch {}
      } else {
        try { pc.removeTrack(transceiver.sender); } catch {}
      }
    }
  }

  tracks.forEach(track => track.stop());
  state.screenStream = null;
  $("#screenBtn").classList.remove("active");
  $("#qualityBadge").textContent = "Voz";
  broadcastMediaState();
  renderVideoGrid();
  refreshOpenStreamOverlay();
  await renegotiateAll();
}

async function renegotiateAll() {
  for (const [socketId, pc] of state.peerConnections) {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      state.socket.emit("webrtc:offer", { to: socketId, sdp: pc.localDescription });
    } catch {}
  }
}

$("#qualityBtn").onclick = () => openQuality();

function modal(title, text, body, onConfirm, confirmText = "Confirmar") {
  if (isMobileLayout()) closeMobilePanels();
  $("#modalTitle").textContent = title;
  $("#modalText").textContent = text || "";
  $("#modalBody").innerHTML = body || "";
  $("#modalError").textContent = "";
  $("#modalConfirm").textContent = confirmText;
  $("#modalBackdrop").classList.remove("hidden");

  $("#modalConfirm").onclick = async () => {
    try {
      await onConfirm?.();
      closeModal();
    } catch (err) {
      $("#modalError").textContent = err.message;
    }
  };
}

function closeModal() {
  $("#modalBackdrop").classList.add("hidden");
}

$("#modalClose").onclick = $("#modalCancel").onclick = closeModal;
$("#modalBackdrop").onclick = e => {
  if (e.target.id === "modalBackdrop") closeModal();
};

function openAddFriend() {
  modal(
    "Adicionar amigo",
    "Digite o nome exato da pessoa.",
    `<label>Nome de usuário</label><input id="friendName" placeholder="ex.: marcks">`,
    async () => {
      await API("/api/friends/request", {
        method: "POST",
        body: { username: $("#friendName").value }
      });
      toast("Solicitação enviada.");
      await loadFriends();
    },
    "Enviar"
  );
}

$("#newServerBtn").onclick = () => {
  modal(
    "Criar servidor",
    "Dê um nome à sua comunidade.",
    `<label>Nome do servidor</label><input id="serverNameInput" placeholder="Minha comunidade">`,
    async () => {
      const data = await API("/api/servers", {
        method: "POST",
        body: { name: $("#serverNameInput").value }
      });
      await loadServers();
      await openServer(data.server.id);
      toast("Servidor criado.");
    },
    "Criar"
  );
};

$("#inviteMemberBtn").onclick = async () => {
  if (!state.currentServer) return;

  await loadFriends();
  await loadMembers();

  const memberIds = new Set((state.serverMembers || []).map(member => member.id));
  const friends = (state.friends?.friends || []).filter(friend => !memberIds.has(friend.id));

  const rows = friends.length
    ? friends.map(friend => `
        <div class="invite-friend-row" data-invite-id="${friend.id}" data-search="${esc(`${friend.nick} ${friend.username}`.toLowerCase())}">
          <img class="avatar" src="${avatarUrl(friend)}" alt="${esc(friend.nick)}">
          <div class="invite-friend-meta">
            <strong>${esc(friend.nick)}</strong>
            <small>@${esc(friend.username)}</small>
          </div>
          <span class="invite-check">✓</span>
        </div>
      `).join("")
    : `<div class="invite-empty">Todos os seus amigos já estão neste servidor.<br>Adicione novos amigos pela página inicial e eles aparecerão aqui.</div>`;

  modal(
    "Adicionar amigos ao servidor",
    "Escolha um ou mais amigos da sua lista.",
    `
      <input id="inviteFriendSearch" class="invite-search" type="search" placeholder="Buscar amigo">
      <div id="inviteFriendsList" class="invite-friends-list">${rows}</div>
      <div id="inviteSelectedCount" class="invite-selected-count">0 selecionados</div>
    `,
    async () => {
      const selected = [...document.querySelectorAll(".invite-friend-row.selected")]
        .map(row => row.dataset.inviteId);

      if (!selected.length) throw new Error("Selecione pelo menos um amigo.");

      const data = await API(`/api/servers/${state.currentServer.id}/invite-friends`, {
        method: "POST",
        body: { userIds: selected }
      });

      await loadMembers();
      await loadServers();
      state.currentServer = state.servers.find(server => server.id === state.currentServer.id) || state.currentServer;
      toast(`${data.added.length} ${data.added.length === 1 ? "amigo adicionado" : "amigos adicionados"} ao servidor.`);
    },
    "Adicionar"
  );

  const updateSelectedCount = () => {
    const count = document.querySelectorAll(".invite-friend-row.selected").length;
    if ($("#inviteSelectedCount")) {
      $("#inviteSelectedCount").textContent = `${count} ${count === 1 ? "selecionado" : "selecionados"}`;
    }
  };

  $$(".invite-friend-row").forEach(row => {
    row.onclick = () => {
      row.classList.toggle("selected");
      updateSelectedCount();
    };
  });

  $("#inviteFriendSearch")?.addEventListener("input", e => {
    const term = e.target.value.trim().toLowerCase();
    $$(".invite-friend-row").forEach(row => {
      row.style.display = !term || row.dataset.search.includes(term) ? "" : "none";
    });
  });
};

$$("[data-new-channel]").forEach(button => {
  button.onclick = () => {
    const type = button.dataset.newChannel;
    modal(
      type === "voice" ? "Criar canal de voz" : "Criar canal de texto",
      "Escolha um nome.",
      `<label>Nome do canal</label><input id="channelName" placeholder="${type === "voice" ? "Bate-papo" : "novo-chat"}">`,
      async () => {
        await API(`/api/servers/${state.currentServer.id}/channels`, {
          method: "POST",
          body: { name: $("#channelName").value, type }
        });
        await loadServers();
        state.currentServer = state.servers.find(s => s.id === state.currentServer.id);
        await loadVoiceStates();
        renderChannels();
        toast("Canal criado.");
      },
      "Criar"
    );
  };
});

function openProfile() {
  modal(
    "Meu perfil",
    "Altere seu nick e sua foto.",
    `<div class="profile-preview">
      <img id="profilePreview" class="avatar" src="${avatarUrl(state.me)}">
      <div><strong>@${esc(state.me.username)}</strong><div style="font-size:11px;color:#8e98aa">Nome de usuário usado no login</div></div>
    </div>
    <label>Novo nick</label><input id="profileNick" value="${esc(state.me.nick)}">
    <label>Foto</label><input id="profileAvatar" type="file" accept="image/*">`,
    async () => {
      const form = new FormData();
      form.append("nick", $("#profileNick").value);
      const file = $("#profileAvatar").files[0];
      if (file) form.append("avatar", file);

      const data = await API("/api/profile", { method: "POST", body: form });
      state.me = data.user;
      updateMeUI();
      await loadFriends();
      toast("Perfil atualizado.");
    },
    "Salvar"
  );

  setTimeout(() => {
    $("#profileAvatar")?.addEventListener("change", e => {
      const file = e.target.files[0];
      if (file) $("#profilePreview").src = URL.createObjectURL(file);
    });
  }, 50);
}

function openQuality() {
  let selected = STREAM_QUALITIES.find(q => q.label === state.quality.label) || STREAM_QUALITIES[0];

  modal(
    "Qualidade da transmissão",
    state.screenStream
      ? "Escolha a qualidade e confirme. A mudança será aplicada à transmissão atual."
      : "Escolha a qualidade que será usada ao iniciar a próxima transmissão.",
    `<div class="quality-grid">${STREAM_QUALITIES.map((option, i) =>
      `<button class="quality-option ${option.label === selected.label ? "active" : ""}" data-q="${i}">
        <b>${option.label}</b>
        <small>${option.hint}</small>
      </button>`
    ).join("")}</div>
    <div class="quality-help">
      <span class="quality-live">${state.screenStream ? "● Transmissão ativa" : "○ Transmissão parada"}</span><br>
      60 FPS prioriza fluidez; 1080p usa resolução e bitrate maiores. O resultado final também depende da resolução da tela, navegador, processador, GPU e velocidade de upload.
    </div>`,
    async () => {
      await applyQualityToActiveShare(selected, true);
    },
    "Confirmar"
  );

  $("#modalCancel").textContent = "Cancelar";

  $$(".quality-option").forEach(button => {
    button.onclick = () => {
      selected = STREAM_QUALITIES[Number(button.dataset.q)];
      $(".quality-option.active")?.classList.remove("active");
      button.classList.add("active");
    };
  });
}
$("#mobileMenuBtn").onclick = () => {
  if (!isMobileLayout()) return;
  const open = $(".sidebar")?.classList.contains("open");
  if (open) closeMobileNav();
  else {
    closeMobileMembers();
    openMobileNav();
  }
};

$("#mobileDrawerCloseBtn").onclick = closeMobileNav;
$("#mobileMembersCloseBtn").onclick = closeMobileMembers;
$("#mobileScrim").onclick = closeMobilePanels;

$("#globalMuteBtn").onclick = () => {
  if (!state.inVoice) {
    toast("Entre em uma chamada ou canal de voz primeiro.");
    return;
  }
  $("#micBtn").click();
};

syncMobileViewport();
window.addEventListener("resize", () => {
  syncMobileViewport();
  if (!isMobileLayout()) {
    closeMobileNav();
    $("#mobileScrim")?.classList.add("hidden");
    $("#mobileScrim")?.classList.remove("show");
  }
});
window.visualViewport?.addEventListener("resize", () => {
  syncMobileViewport();
  if (document.activeElement === $("#messageInput")) {
    setTimeout(() => {
      const messages = $("#messages");
      if (messages) messages.scrollTop = messages.scrollHeight;
    }, 80);
  }
});
window.visualViewport?.addEventListener("scroll", syncMobileViewport);

$("#messageInput")?.addEventListener("focus", () => {
  if (!isMobileLayout()) return;
  setTimeout(() => {
    syncMobileViewport();
    const messages = $("#messages");
    if (messages) messages.scrollTop = messages.scrollHeight;
  }, 120);
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && isMobileLayout()) {
    closeMobilePanels();
  }
});

window.addEventListener("beforeunload", () => {
  if (state.inVoice) state.socket?.emit("voice:leave");
});

if (state.token) boot();
else showAuth();