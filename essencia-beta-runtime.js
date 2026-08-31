const fs = require('fs');
const path = require('path');
const Module = require('module');

const originalPath = path.join(__dirname, 'server.js');
let source = fs.readFileSync(originalPath, 'utf8');

function patchOnce(search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Presence Lite patch não encontrou: ${label}`);
  source = source.replace(search, replacement);
}

patchOnce(
`function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    nick: u.nick || u.username,
    avatar: u.avatar || "",
    friends: u.friends || []
  };
}`,
`function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    nick: u.nick || u.username,
    avatar: u.avatar || "",
    banner: u.banner || "",
    bio: u.bio || "",
    friends: u.friends || []
  };
}`,
'campos públicos do perfil V17'
);

patchOnce(
`function userCanAccessServer(user, srv) {
  return !!(srv && srv.members.includes(user.id));
}`,
`const SERVER_PERMISSION_KEYS = ["manageMessages", "manageChannels", "manageRoles", "manageMembers"];
function ensureServerRoleData(srv) {
  if (!srv) return;
  if (!Array.isArray(srv.roles)) srv.roles = [];
  if (!srv.memberRoles || typeof srv.memberRoles !== "object") srv.memberRoles = {};
  for (const uid of srv.members || []) {
    if (!Array.isArray(srv.memberRoles[uid])) srv.memberRoles[uid] = [];
  }
}
function cleanPermissions(value) {
  const input = value && typeof value === "object" ? value : {};
  return Object.fromEntries(SERVER_PERMISSION_KEYS.map(key => [key, !!input[key]]));
}
function memberPermissionSet(srv, userId) {
  ensureServerRoleData(srv);
  const set = new Set();
  if (!srv || srv.ownerId === userId) {
    SERVER_PERMISSION_KEYS.forEach(key => set.add(key));
    return set;
  }
  const roleIds = srv.memberRoles?.[userId] || [];
  for (const role of srv.roles || []) {
    if (!roleIds.includes(role.id)) continue;
    for (const [key, enabled] of Object.entries(role.permissions || {})) if (enabled) set.add(key);
  }
  return set;
}
function hasServerPermission(srv, userId, permission) {
  if (!srv || !userId) return false;
  if (srv.ownerId === userId) return true;
  return memberPermissionSet(srv, userId).has(permission);
}
function serverPermissionsForUser(srv, userId) {
  const set = memberPermissionSet(srv, userId);
  return Object.fromEntries(SERVER_PERMISSION_KEYS.map(key => [key, set.has(key)]));
}
function userCanAccessServer(user, srv) {
  if (srv) ensureServerRoleData(srv);
  return !!(srv && srv.members.includes(user.id));
}`,
'helpers de cargos e permissões V19'
);

patchOnce(
`app.use(express.json({ limit: "3mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));`,
`app.use(express.json({ limit: "3mb" }));

// Presence Lite + notificações + chamadas + fala + V17 UI + V18 mensagens + V19 administração.
app.use((req, res, next) => {
  if (req.method !== "GET" || !["/", "/index.html"].includes(req.path)) return next();
  try {
    let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    const styles = ["/presence-lite.css", "/v17-ui.css", "/v18-message-actions.css", "/v19-server-admin.css"];
    const scripts = ["/presence-lite.js", "/message-notify-lite.js", "/call-ring-lite.js", "/speaking-lite.js", "/v17-ui.js", "/v18-message-actions.js", "/v19-server-admin.js"];
    for (const href of styles) {
      if (!html.includes(href)) html = html.replace("</head>", \`  <link rel="stylesheet" href="\${href}" />\\n</head>\`);
    }
    for (const src of scripts) {
      if (!html.includes(src)) html = html.replace("</body>", \`  <script src="\${src}"></script>\\n</body>\`);
    }
    res.type("html").send(html);
  } catch (err) {
    next(err);
  }
});

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));`,
'injeção dos arquivos V17-V19'
);

patchOnce(
`app.post("/api/profile", auth, upload.single("avatar"), (req, res) => {
  const nick = normalizeName(req.body.nick);
  if (nick && (nick.length < 2 || nick.length > 28))
    return res.status(400).json({ error: "Nick deve ter entre 2 e 28 caracteres." });
  if (nick) req.user.nick = nick;
  if (req.file) req.user.avatar = \`/uploads/\${req.file.filename}\`;
  saveDb();
  io.emit("presence:update");
  res.json({ user: publicUser(req.user) });
});`,
`app.post("/api/profile", auth, upload.fields([{ name: "avatar", maxCount: 1 }, { name: "banner", maxCount: 1 }]), (req, res) => {
  const nick = normalizeName(req.body.nick);
  const bio = String(req.body.bio || "").trim().slice(0, 190);
  if (nick && (nick.length < 2 || nick.length > 28))
    return res.status(400).json({ error: "Nick deve ter entre 2 e 28 caracteres." });
  if (nick) req.user.nick = nick;
  req.user.bio = bio;
  const avatarFile = req.files?.avatar?.[0];
  const bannerFile = req.files?.banner?.[0];
  if (avatarFile) req.user.avatar = \`/uploads/\${avatarFile.filename}\`;
  if (bannerFile) req.user.banner = \`/uploads/\${bannerFile.filename}\`;
  saveDb();
  emitPresence();
  res.json({ user: publicUser(req.user) });
});`,
'perfil com banner/bio/avatar gif'
);

patchOnce(
`app.get("/api/servers/:serverId/members", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  if (!userCanAccessServer(req.user, srv))
    return res.status(403).json({ error: "Sem acesso." });

  const members = srv.members
    .map(uid => {
      const user = publicUser(db.users[uid]);
      if (!user) return null;
      return { ...user, isOwner: uid === srv.ownerId };
    })
    .filter(Boolean);

  res.json({ members, ownerId: srv.ownerId, count: members.length });
});`,
`app.get("/api/servers/:serverId/members", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  if (!userCanAccessServer(req.user, srv))
    return res.status(403).json({ error: "Sem acesso." });
  ensureServerRoleData(srv);
  const members = srv.members
    .map(uid => {
      const user = publicUser(db.users[uid]);
      if (!user) return null;
      return { ...user, isOwner: uid === srv.ownerId, roleIds: srv.memberRoles[uid] || [] };
    })
    .filter(Boolean);
  res.json({ members, ownerId: srv.ownerId, count: members.length, roles: srv.roles || [], permissions: serverPermissionsForUser(srv, req.user.id) });
});

app.get("/api/servers/:serverId/admin", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  if (!userCanAccessServer(req.user, srv)) return res.status(403).json({ error: "Sem acesso." });
  ensureServerRoleData(srv);
  const members = srv.members.map(uid => {
    const user = publicUser(db.users[uid]);
    return user ? { ...user, isOwner: uid === srv.ownerId, roleIds: srv.memberRoles[uid] || [] } : null;
  }).filter(Boolean);
  res.json({ server: { id:srv.id, name:srv.name, ownerId:srv.ownerId }, roles:srv.roles, members, permissions:serverPermissionsForUser(srv, req.user.id), isOwner:srv.ownerId === req.user.id });
});

app.post("/api/servers/:serverId/roles", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  if (!userCanAccessServer(req.user, srv) || !hasServerPermission(srv, req.user.id, "manageRoles")) return res.status(403).json({ error: "Sem permissão para gerenciar cargos." });
  ensureServerRoleData(srv);
  const name = normalizeName(req.body.name).slice(0, 32);
  if (!name) return res.status(400).json({ error: "Informe um nome para o cargo." });
  const color = /^#[0-9a-f]{6}$/i.test(String(req.body.color || "")) ? String(req.body.color) : "#745cff";
  const role = { id:id("role"), name, color, permissions:cleanPermissions(req.body.permissions), createdAt:Date.now() };
  srv.roles.push(role); saveDb();
  io.to(\`server:\${srv.id}\`).emit("server:roles-update", { serverId:srv.id });
  res.json({ role });
});

app.put("/api/servers/:serverId/roles/:roleId", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  if (!userCanAccessServer(req.user, srv) || !hasServerPermission(srv, req.user.id, "manageRoles")) return res.status(403).json({ error: "Sem permissão para gerenciar cargos." });
  ensureServerRoleData(srv);
  const role = srv.roles.find(r => r.id === req.params.roleId);
  if (!role) return res.status(404).json({ error: "Cargo não encontrado." });
  const name = normalizeName(req.body.name).slice(0,32); if (name) role.name = name;
  if (/^#[0-9a-f]{6}$/i.test(String(req.body.color || ""))) role.color = String(req.body.color);
  role.permissions = cleanPermissions(req.body.permissions);
  saveDb(); io.to(\`server:\${srv.id}\`).emit("server:roles-update", { serverId:srv.id });
  res.json({ role });
});

app.delete("/api/servers/:serverId/roles/:roleId", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  if (!userCanAccessServer(req.user, srv) || !hasServerPermission(srv, req.user.id, "manageRoles")) return res.status(403).json({ error: "Sem permissão para gerenciar cargos." });
  ensureServerRoleData(srv);
  const index = srv.roles.findIndex(r => r.id === req.params.roleId);
  if (index < 0) return res.status(404).json({ error: "Cargo não encontrado." });
  srv.roles.splice(index,1);
  for (const uid of Object.keys(srv.memberRoles)) srv.memberRoles[uid] = (srv.memberRoles[uid] || []).filter(id => id !== req.params.roleId);
  saveDb(); io.to(\`server:\${srv.id}\`).emit("server:roles-update", { serverId:srv.id });
  res.json({ ok:true });
});

app.put("/api/servers/:serverId/members/:userId/roles", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  if (!userCanAccessServer(req.user, srv) || !hasServerPermission(srv, req.user.id, "manageRoles")) return res.status(403).json({ error: "Sem permissão para atribuir cargos." });
  ensureServerRoleData(srv);
  const targetId = req.params.userId;
  if (!srv.members.includes(targetId)) return res.status(404).json({ error: "Membro não encontrado." });
  if (targetId === srv.ownerId) return res.status(400).json({ error: "O dono do servidor não precisa de cargos." });
  const validIds = new Set(srv.roles.map(r => r.id));
  const roleIds = Array.isArray(req.body.roleIds) ? [...new Set(req.body.roleIds.map(String))].filter(id => validIds.has(id)) : [];
  srv.memberRoles[targetId] = roleIds;
  saveDb(); io.to(\`server:\${srv.id}\`).emit("server:roles-update", { serverId:srv.id });
  res.json({ ok:true, roleIds });
});`
,
'membros, cargos e permissões V19'
);

patchOnce(
`app.get("/api/health", (_, res) => {
  res.json({ ok: true, users: Object.keys(db.users).length });
});

const onlineSockets = new Map();`,
`app.get("/api/presence", auth, (req, res) => {
  res.json({ onlineUserIds: [...onlineSockets.keys()] });
});

app.get("/api/health", (_, res) => {
  res.json({ ok: true, users: Object.keys(db.users).length });
});

const onlineSockets = new Map();

function emitPresence() {
  io.emit("presence:update", { onlineUserIds: [...onlineSockets.keys()] });
}

function safeReplyTo(reply) {
  if (!reply || typeof reply !== "object") return null;
  const idValue = String(reply.id || "").slice(0, 80);
  if (!idValue) return null;
  return {
    id: idValue,
    userId: String(reply.userId || "").slice(0, 80),
    userNick: String(reply.userNick || "Usuário").slice(0, 80),
    text: String(reply.text || "Mensagem").slice(0, 160)
  };
}`,
'endpoint, presença e reply seguro'
);

patchOnce(
`  socket.on("message:send", ({ serverId, channelId, text, attachment }) => {`,
`  socket.on("message:send", ({ serverId, channelId, text, attachment, replyTo }) => {`,
'assinatura message:send V18'
);
patchOnce(
`    const msg = {
      id: id("msg"),
      userId: uid,
      text: clean,
      attachment: file,
      createdAt: Date.now()
    };`,
`    const msg = {
      id: id("msg"),
      userId: uid,
      text: clean,
      attachment: file,
      replyTo: safeReplyTo(replyTo),
      createdAt: Date.now()
    };`,
'replyTo em mensagem de servidor'
);

patchOnce(
`    io.to(textRoom(serverId, channelId)).emit("message:new", {
      ...msg,
      user: publicUser(user)
    });`,
`    const deliveredMessage = { ...msg, user: publicUser(user) };
    io.to(textRoom(serverId, channelId)).emit("message:new", deliveredMessage);
    for (const memberId of srv.members || []) {
      if (memberId === uid) continue;
      io.to(\`user:\${memberId}\`).emit("message:notify", { from:publicUser(user), serverId, serverName:srv.name, channelId, channelName:ch.name, message:deliveredMessage });
    }`,
'notificação de mensagens do servidor'
);

patchOnce(
`  socket.on("dm:send", ({ friendId, text, attachment }) => {`,
`  socket.on("dm:send", ({ friendId, text, attachment, replyTo }) => {`,
'assinatura dm:send V18'
);
patchOnce(
`    const msg = {
      id: id("dm"),
      userId: uid,
      friendId,
      text: clean,
      attachment: file,
      createdAt: Date.now()
    };`,
`    const msg = {
      id: id("dm"),
      userId: uid,
      friendId,
      text: clean,
      attachment: file,
      replyTo: safeReplyTo(replyTo),
      createdAt: Date.now()
    };`,
'replyTo em DM'
);

patchOnce(
`  socket.on("dm:join", ({ friendId }) => {`,
`  socket.on("message:delete", ({ serverId, channelId, messageId }, ack) => {
    const srv = db.servers[serverId];
    if (!userCanAccessServer(user, srv)) { if (typeof ack === "function") ack({ok:false,error:"Sem acesso."}); return; }
    const key = channelKey(serverId, channelId); const list = db.messages[key] || []; const index = list.findIndex(m => m.id === messageId);
    if (index < 0) { if (typeof ack === "function") ack({ok:false,error:"Mensagem não encontrada."}); return; }
    const target = list[index];
    const allowed = target.userId === uid || hasServerPermission(srv, uid, "manageMessages");
    if (!allowed) { if (typeof ack === "function") ack({ok:false,error:"Você não tem permissão para excluir esta mensagem."}); return; }
    list.splice(index,1); saveDb(); io.to(\`server:\${serverId}\`).emit("message:deleted", {serverId,channelId,messageId});
    if (typeof ack === "function") ack({ok:true});
  });

  socket.on("dm:join", ({ friendId }) => {`,
'exclusão de mensagem com permissão V19'
);

patchOnce(
`  socket.on("voice:join", ({ serverId, channelId }, ack) => {`,
`  socket.on("dm:delete", ({ friendId, messageId }, ack) => {
    const friend = db.users[friendId];
    if (!friend || !areFriends(user, friend)) { if (typeof ack === "function") ack({ok:false,error:"Conversa não disponível."}); return; }
    const key = dmKey(uid, friendId); const list = db.dmMessages[key] || []; const index = list.findIndex(m => m.id === messageId);
    if (index < 0) { if (typeof ack === "function") ack({ok:false,error:"Mensagem não encontrada."}); return; }
    if (list[index].userId !== uid) { if (typeof ack === "function") ack({ok:false,error:"Você só pode excluir suas próprias mensagens privadas."}); return; }
    list.splice(index,1); saveDb();
    io.to(dmRoom(uid, friendId)).emit("dm:deleted", {friendId:uid,messageId});
    io.to(\`user:\${uid}\`).emit("dm:deleted", {friendId,messageId});
    io.to(\`user:\${friendId}\`).emit("dm:deleted", {friendId:uid,messageId});
    if (typeof ack === "function") ack({ok:true});
  });

  socket.on("voice:join", ({ serverId, channelId }, ack) => {`,
'exclusão de DM'
);

source = source.replace(
`  if (!userCanAccessServer(req.user, srv))
    return res.status(403).json({ error: "Sem acesso." });
  const name = normalizeName(req.body.name);
  const type = req.body.type === "voice" ? "voice" : "text";`,
`  if (!userCanAccessServer(req.user, srv) || !hasServerPermission(srv, req.user.id, "manageChannels"))
    return res.status(403).json({ error: "Sem permissão para gerenciar canais." });
  const name = normalizeName(req.body.name);
  const type = req.body.type === "voice" ? "voice" : "text";`
);

source = source.replaceAll('io.emit("presence:update");', 'emitPresence();');

const runtimeFilename = path.join(__dirname, 'server.presence-lite.runtime.js');
const runtimeModule = new Module(runtimeFilename, module);
runtimeModule.filename = runtimeFilename;
runtimeModule.paths = module.paths;
runtimeModule._compile(source, runtimeFilename);
