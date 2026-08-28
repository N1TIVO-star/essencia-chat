module.exports = function applyV21SourcePatch(source) {
  const replace = (search, replacement, label) => {
    if (!source.includes(search)) {
      console.warn(`[V21] Patch opcional não encontrado: ${label}`);
      return false;
    }
    source = source.replace(search, replacement);
    return true;
  };

  // Carrega a camada visual V21 através do middleware HTML já usado pelas versões anteriores.
  source = source.replace('"/v19-server-admin.css"]', '"/v19-server-admin.css", "/v21-community.css"]');
  source = source.replace('"/v19-server-admin.js"]', '"/v19-server-admin.js", "/v21-community.js"]');

  // Status público do usuário (online / dnd / invisible).
  replace(
`    bio: u.bio || "",
    friends: u.friends || []`,
`    bio: u.bio || "",
    status: ["online", "dnd", "invisible"].includes(u.status) ? u.status : "online",
    friends: u.friends || []`,
'publicUser.status'
  );

  // Convites passam a ser pendentes e chegam no PV, em vez de adicionar direto.
  const inviteHelpers = `
function ensureV21ServerData(srv) {
  if (!srv) return;
  ensureServerRoleData(srv);
  if (!Array.isArray(srv.bannedUserIds)) srv.bannedUserIds = [];
  if (!Array.isArray(srv.mutedUserIds)) srv.mutedUserIds = [];
  if (typeof srv.banner !== "string") srv.banner = "";
  if (typeof srv.icon !== "string") srv.icon = srv.icon || "";
  db.serverInvites ||= [];
}
function v21InviteMessage(invite, fromUser, targetUser, srv) {
  const msg = {
    id: id("dm"),
    userId: fromUser.id,
    friendId: targetUser.id,
    text: "Convite para entrar no servidor " + srv.name,
    attachment: null,
    serverInvite: {
      id: invite.id,
      serverId: srv.id,
      serverName: srv.name,
      serverIcon: srv.icon || "",
      serverBanner: srv.banner || "",
      fromUserId: fromUser.id,
      status: invite.status || "pending"
    },
    createdAt: Date.now()
  };
  const key = dmKey(fromUser.id, targetUser.id);
  db.dmMessages[key] ||= [];
  db.dmMessages[key].push(msg);
  if (db.dmMessages[key].length > 500) db.dmMessages[key] = db.dmMessages[key].slice(-500);
  const delivered = { ...msg, user: publicUser(fromUser) };
  io.to(dmRoom(fromUser.id, targetUser.id)).emit("dm:new", delivered);
  io.to("user:" + targetUser.id).emit("dm:notify", { from: publicUser(fromUser), message: delivered });
  return msg;
}
function v21SetInviteStatus(inviteId, status) {
  for (const list of Object.values(db.dmMessages || {})) {
    for (const message of list || []) {
      if (message.serverInvite?.id === inviteId) message.serverInvite.status = status;
    }
  }
}
function createServerInvitesV21(req, res, srv, userIds) {
  if (!userCanAccessServer(req.user, srv)) return res.status(403).json({ error: "Sem acesso." });
  ensureV21ServerData(srv);
  const friendIds = new Set(req.user.friends || []);
  const requested = [...new Set((userIds || []).map(String))].slice(0, 50);
  const created = [];
  const skipped = [];
  for (const userId of requested) {
    const target = db.users[userId];
    if (!target || !friendIds.has(userId)) { skipped.push(userId); continue; }
    if (srv.members.includes(userId) || srv.bannedUserIds.includes(userId)) { skipped.push(userId); continue; }
    const pending = db.serverInvites.find(inv => inv.serverId === srv.id && inv.toUserId === userId && inv.status === "pending");
    if (pending) { skipped.push(userId); continue; }
    const invite = { id: id("sinv"), serverId: srv.id, fromUserId: req.user.id, toUserId: userId, status: "pending", createdAt: Date.now() };
    db.serverInvites.push(invite);
    v21InviteMessage(invite, req.user, target, srv);
    created.push({ id: invite.id, user: publicUser(target) });
  }
  if (!created.length) return res.status(400).json({ error: "Essas pessoas já estão no servidor, já possuem convite pendente ou não podem ser convidadas." });
  saveDb();
  res.json({ ok: true, invites: created, skipped });
}

app.post("/api/servers/:serverId/invite", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  const target = findUserByUsername(req.body.username);
  if (!target) return res.status(404).json({ error: "Usuário não encontrado." });
  return createServerInvitesV21(req, res, srv, [target.id]);
});

app.post("/api/servers/:serverId/invite-friends", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  const userIds = Array.isArray(req.body.userIds) ? req.body.userIds : [];
  return createServerInvitesV21(req, res, srv, userIds);
});
`;

  const oldInviteMarker = 'app.post("/api/servers/:serverId/invite", auth, (req, res) => {';
  if (source.includes(oldInviteMarker)) source = source.replace(oldInviteMarker, inviteHelpers + '\n' + oldInviteMarker);
  else console.warn('[V21] Marcador de convite antigo não encontrado; mantendo fluxo antigo como fallback.');

  // APIs novas da V21.
  const routes = `
app.post("/api/status", auth, (req, res) => {
  const status = ["online", "dnd", "invisible"].includes(req.body.status) ? req.body.status : "online";
  req.user.status = status;
  saveDb();
  emitPresence();
  res.json({ user: publicUser(req.user) });
});

app.get("/api/servers/:serverId/v21", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  if (!userCanAccessServer(req.user, srv)) return res.status(403).json({ error: "Sem acesso." });
  ensureV21ServerData(srv);
  const members = srv.members.map(uid => {
    const user = publicUser(db.users[uid]);
    return user ? { ...user, isOwner: uid === srv.ownerId, roleIds: srv.memberRoles?.[uid] || [], muted: srv.mutedUserIds.includes(uid) } : null;
  }).filter(Boolean);
  const bannedUsers = srv.bannedUserIds.map(uid => publicUser(db.users[uid])).filter(Boolean);
  res.json({
    server: { id:srv.id, name:srv.name, icon:srv.icon || "", banner:srv.banner || "", ownerId:srv.ownerId },
    channels: srv.channels || [], roles: srv.roles || [], members, bannedUsers,
    permissions: serverPermissionsForUser(srv, req.user.id), isOwner: srv.ownerId === req.user.id
  });
});

app.post("/api/servers/:serverId/profile", auth, upload.fields([{ name:"icon", maxCount:1 }, { name:"banner", maxCount:1 }]), (req, res) => {
  const srv = db.servers[req.params.serverId];
  if (!userCanAccessServer(req.user, srv)) return res.status(403).json({ error: "Sem acesso." });
  if (srv.ownerId !== req.user.id && !hasServerPermission(srv, req.user.id, "manageMembers")) return res.status(403).json({ error: "Sem permissão para editar o servidor." });
  ensureV21ServerData(srv);
  const name = normalizeName(req.body.name).slice(0, 40);
  if (name) srv.name = name;
  const iconFile = req.files?.icon?.[0];
  const bannerFile = req.files?.banner?.[0];
  if (iconFile) srv.icon = "/uploads/" + iconFile.filename;
  if (bannerFile) srv.banner = "/uploads/" + bannerFile.filename;
  if (String(req.body.removeIcon || "") === "1") srv.icon = "";
  if (String(req.body.removeBanner || "") === "1") srv.banner = "";
  saveDb();
  io.to("server:" + srv.id).emit("server:update", srv.id);
  for (const uid of srv.members || []) io.to("user:" + uid).emit("servers:update");
  res.json({ server: srv });
});

app.put("/api/servers/:serverId/channels/:channelId", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  if (!userCanAccessServer(req.user, srv) || !hasServerPermission(srv, req.user.id, "manageChannels")) return res.status(403).json({ error: "Sem permissão para editar canais." });
  const channel = (srv.channels || []).find(ch => ch.id === req.params.channelId);
  if (!channel) return res.status(404).json({ error: "Canal não encontrado." });
  const name = normalizeName(req.body.name).slice(0, 32);
  if (!name) return res.status(400).json({ error: "Nome do canal inválido." });
  channel.name = name;
  saveDb();
  io.to("server:" + srv.id).emit("server:update", srv.id);
  res.json({ channel });
});

app.post("/api/servers/:serverId/invites", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  const userIds = Array.isArray(req.body.userIds) ? req.body.userIds : [];
  return createServerInvitesV21(req, res, srv, userIds);
});

app.post("/api/server-invites/:inviteId/accept", auth, (req, res) => {
  db.serverInvites ||= [];
  const invite = db.serverInvites.find(item => item.id === req.params.inviteId && item.toUserId === req.user.id);
  if (!invite || invite.status !== "pending") return res.status(404).json({ error: "Convite não está mais disponível." });
  const srv = db.servers[invite.serverId];
  if (!srv) return res.status(404).json({ error: "Servidor não existe mais." });
  ensureV21ServerData(srv);
  if (srv.bannedUserIds.includes(req.user.id)) return res.status(403).json({ error: "Você não pode entrar neste servidor." });
  if (!srv.members.includes(req.user.id)) srv.members.push(req.user.id);
  req.user.servers ||= [];
  if (!req.user.servers.includes(srv.id)) req.user.servers.push(srv.id);
  srv.memberRoles[req.user.id] ||= [];
  invite.status = "accepted";
  v21SetInviteStatus(invite.id, "accepted");
  saveDb();
  for (const sid of onlineSockets.get(req.user.id) || []) io.sockets.sockets.get(sid)?.join("server:" + srv.id);
  io.to("user:" + req.user.id).emit("servers:update");
  io.to("server:" + srv.id).emit("server:update", srv.id);
  res.json({ ok:true, server:srv });
});

app.post("/api/server-invites/:inviteId/reject", auth, (req, res) => {
  db.serverInvites ||= [];
  const invite = db.serverInvites.find(item => item.id === req.params.inviteId && item.toUserId === req.user.id);
  if (!invite || invite.status !== "pending") return res.status(404).json({ error: "Convite não está mais disponível." });
  invite.status = "rejected";
  v21SetInviteStatus(invite.id, "rejected");
  saveDb();
  res.json({ ok:true });
});

function removeMemberV21(srv, targetId, reason) {
  ensureV21ServerData(srv);
  srv.members = (srv.members || []).filter(uid => uid !== targetId);
  srv.mutedUserIds = srv.mutedUserIds.filter(uid => uid !== targetId);
  if (srv.memberRoles) delete srv.memberRoles[targetId];
  const target = db.users[targetId];
  if (target) target.servers = (target.servers || []).filter(sid => sid !== srv.id);
  for (const sid of onlineSockets.get(targetId) || []) {
    const socket = io.sockets.sockets.get(sid);
    if (!socket) continue;
    if (socket.data.mediaRoom?.kind === "server" && socket.data.mediaRoom.serverId === srv.id) leaveMediaRoom(socket);
    socket.leave("server:" + srv.id);
  }
  io.to("user:" + targetId).emit("server:removed", { serverId:srv.id, reason });
  io.to("user:" + targetId).emit("servers:update");
}
function canModerateMemberV21(reqUser, srv, targetId) {
  if (!userCanAccessServer(reqUser, srv)) return false;
  if (!hasServerPermission(srv, reqUser.id, "manageMembers")) return false;
  if (!targetId || targetId === srv.ownerId || targetId === reqUser.id) return false;
  return true;
}

app.post("/api/servers/:serverId/members/:userId/kick", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  if (!canModerateMemberV21(req.user, srv, req.params.userId)) return res.status(403).json({ error: "Sem permissão para expulsar este membro." });
  removeMemberV21(srv, req.params.userId, "kick");
  saveDb();
  io.to("server:" + srv.id).emit("server:update", srv.id);
  res.json({ ok:true });
});

app.post("/api/servers/:serverId/members/:userId/ban", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  if (!canModerateMemberV21(req.user, srv, req.params.userId)) return res.status(403).json({ error: "Sem permissão para banir este membro." });
  ensureV21ServerData(srv);
  if (!srv.bannedUserIds.includes(req.params.userId)) srv.bannedUserIds.push(req.params.userId);
  removeMemberV21(srv, req.params.userId, "ban");
  saveDb();
  io.to("server:" + srv.id).emit("server:update", srv.id);
  res.json({ ok:true });
});

app.post("/api/servers/:serverId/members/:userId/mute", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  if (!canModerateMemberV21(req.user, srv, req.params.userId)) return res.status(403).json({ error: "Sem permissão para silenciar este membro." });
  ensureV21ServerData(srv);
  const muted = req.body.muted !== false;
  srv.mutedUserIds = srv.mutedUserIds.filter(uid => uid !== req.params.userId);
  if (muted) srv.mutedUserIds.push(req.params.userId);
  saveDb();
  io.to("user:" + req.params.userId).emit("server:moderation", { serverId:srv.id, muted });
  io.to("server:" + srv.id).emit("server:update", srv.id);
  res.json({ ok:true, muted });
});

app.post("/api/servers/:serverId/bans/:userId/unban", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  if (!userCanAccessServer(req.user, srv) || !hasServerPermission(srv, req.user.id, "manageMembers")) return res.status(403).json({ error: "Sem permissão para remover banimentos." });
  ensureV21ServerData(srv);
  srv.bannedUserIds = srv.bannedUserIds.filter(uid => uid !== req.params.userId);
  saveDb();
  res.json({ ok:true });
});
`;

  const presenceMarker = 'app.get("/api/presence", auth, (req, res) => {';
  if (source.includes(presenceMarker)) source = source.replace(presenceMarker, routes + '\n' + presenceMarker);
  else console.warn('[V21] Endpoint de presença não encontrado para inserir rotas.');

  // Presença considera Invisível como offline e envia o status para a interface nova.
  replace(
`app.get("/api/presence", auth, (req, res) => {
  res.json({ onlineUserIds: [...onlineSockets.keys()] });
});`,
`app.get("/api/presence", auth, (req, res) => {
  res.json(v21PresencePayload());
});`,
'GET presence V21'
  );

  replace(
`function emitPresence() {
  io.emit("presence:update", { onlineUserIds: [...onlineSockets.keys()] });
}`,
`function v21PresencePayload() {
  const onlineUserIds = [];
  const statuses = {};
  for (const [userId] of onlineSockets) {
    const user = db.users[userId];
    const status = ["online", "dnd", "invisible"].includes(user?.status) ? user.status : "online";
    statuses[userId] = status;
    if (status !== "invisible") onlineUserIds.push(userId);
  }
  return { onlineUserIds, statuses };
}
function emitPresence() {
  io.emit("presence:update", v21PresencePayload());
}`,
'emitPresence V21'
  );

  // Membro silenciado não envia mensagens no servidor.
  replace(
`  socket.on("message:send", ({ serverId, channelId, text, attachment, replyTo }) => {
    const srv = db.servers[serverId];`,
`  socket.on("message:send", ({ serverId, channelId, text, attachment, replyTo }) => {
    const srv = db.servers[serverId];
    if (srv && (srv.mutedUserIds || []).includes(uid)) {
      socket.emit("server:moderation-error", { serverId, error:"Você está silenciado neste servidor." });
      return;
    }`,
'mute em message:send'
  );

  // Membro silenciado também não entra em canal de voz até ser liberado.
  replace(
`  socket.on("voice:join", ({ serverId, channelId }, ack) => {
    const srv = db.servers[serverId];`,
`  socket.on("voice:join", ({ serverId, channelId }, ack) => {
    const srv = db.servers[serverId];
    if (srv && (srv.mutedUserIds || []).includes(uid)) {
      if (typeof ack === "function") ack({ ok:false, error:"Você está silenciado neste servidor." });
      socket.emit("server:moderation-error", { serverId, error:"Você está silenciado neste servidor." });
      return;
    }`,
'mute em voice:join'
  );

  // Estado de mídia leve para mostrar transmitindo/microfone/áudio nos participantes.
  replace(
`  socket.on("text:join", ({ serverId, channelId }) => {`,
`  socket.on("v21:media-state", payload => {
    const mediaRoom = socket.data.mediaRoom;
    const data = {
      userId: uid,
      muted: !!payload?.muted,
      deafened: !!payload?.deafened,
      sharing: !!payload?.sharing,
      clear: !!payload?.clear
    };
    if (mediaRoom?.kind === "server") io.to("server:" + mediaRoom.serverId).emit("v21:media-state", data);
    else if (mediaRoom?.room) io.to(mediaRoom.room).emit("v21:media-state", data);
  });

  socket.on("text:join", ({ serverId, channelId }) => {`,
'v21 media state'
  );

  return source;
};
