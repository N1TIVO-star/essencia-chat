require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 25 * 1024 * 1024 });

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || "";
const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const emptyDb = {
  users: {},
  sessions: {},
  friendRequests: [],
  servers: {},
  messages: {},
  dmMessages: {}
};

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function normalizeDb(parsed) {
  parsed ||= {};
  return {
    users: parsed.users || {},
    sessions: parsed.sessions || {},
    friendRequests: parsed.friendRequests || [],
    servers: parsed.servers || {},
    messages: parsed.messages || {},
    dmMessages: parsed.dmMessages || {}
  };
}

function loadLocalDb() {
  try {
    if (!fs.existsSync(DB_FILE)) return clone(emptyDb);
    return normalizeDb(JSON.parse(fs.readFileSync(DB_FILE, "utf8")));
  } catch (e) {
    console.error("Falha ao ler cache local:", e);
    try {
      const backupFile = `${DB_FILE}.bak`;
      if (fs.existsSync(backupFile)) {
        console.warn("Recuperando cache pelo db.json.bak.");
        return normalizeDb(JSON.parse(fs.readFileSync(backupFile, "utf8")));
      }
    } catch {}
    return clone(emptyDb);
  }
}

function writeLocalDb(snapshot) {
  const tmp = `${DB_FILE}.tmp`;
  const backup = `${DB_FILE}.bak`;
  const json = JSON.stringify(snapshot, null, 2);
  try {
    if (fs.existsSync(DB_FILE)) {
      try { fs.copyFileSync(DB_FILE, backup); } catch {}
    }
    fs.writeFileSync(tmp, json, "utf8");
    fs.renameSync(tmp, DB_FILE);
  } catch (e) {
    console.error("Falha ao salvar cache local:", e);
    try { fs.writeFileSync(DB_FILE, json, "utf8"); } catch {}
  }
}

let db = clone(emptyDb);
let pool = null;
let persistTimer = null;
let persistQueue = Promise.resolve();

async function persistPostgres(snapshot) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO essencia_state (id, data, updated_at)
     VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id)
     DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [JSON.stringify(snapshot)]
  );
}

function saveDb() {
  const snapshot = clone(db);

  // Cache local continua existindo como backup/migração de emergência.
  writeLocalDb(snapshot);

  if (!pool) return;

  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const latest = clone(db);
    persistQueue = persistQueue
      .then(() => persistPostgres(latest))
      .catch(err => console.error("Falha ao persistir no PostgreSQL:", err.message));
  }, 80);
}

async function initDatabase() {
  const local = loadLocalDb();

  if (!DATABASE_URL) {
    db = local;
    console.warn("DATABASE_URL não configurada. Usando db.json local.");
    return;
  }

  try {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 12000
    });

    await pool.query("SELECT 1");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS essencia_state (
        id SMALLINT PRIMARY KEY,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const result = await pool.query("SELECT data FROM essencia_state WHERE id = 1 LIMIT 1");

    if (result.rows.length) {
      db = normalizeDb(result.rows[0].data);
      writeLocalDb(db);
      console.log("PostgreSQL Neon conectado. Dados carregados da nuvem.");
    } else {
      db = normalizeDb(local);
      await persistPostgres(db);
      writeLocalDb(db);
      console.log("PostgreSQL Neon conectado. Banco inicial criado/importado do db.json.");
    }
  } catch (e) {
    console.error("Não foi possível conectar ao PostgreSQL Neon:", e.message);
    console.warn("O servidor continuará usando o cache local db.json nesta execução.");
    try { await pool?.end(); } catch {}
    pool = null;
    db = local;
  }
}

async function flushAndClose(signal) {
  try {
    clearTimeout(persistTimer);
    if (pool) {
      await persistQueue.catch(() => {});
      await persistPostgres(clone(db)).catch(() => {});
      await pool.end().catch(() => {});
    }
  } finally {
    if (signal) process.exit(0);
  }
}

process.on("SIGINT", () => flushAndClose("SIGINT"));
process.on("SIGTERM", () => flushAndClose("SIGTERM"));

function id(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}
function normalizeName(v) {
  return String(v || "").trim().replace(/\s+/g, " ");
}
function safeUsername(v) {
  return normalizeName(v).toLowerCase();
}
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
}
function verifyPassword(password, rec) {
  const got = crypto.pbkdf2Sync(password, rec.salt, 120000, 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(rec.hash, "hex"));
}
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    nick: u.nick || u.username,
    avatar: u.avatar || "",
    friends: u.friends || []
  };
}
function findUserByUsername(username) {
  const key = safeUsername(username);
  return Object.values(db.users).find(u => safeUsername(u.username) === key);
}
function authTokenFromReq(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}
function auth(req, res, next) {
  const token = authTokenFromReq(req);
  const userId = db.sessions[token];
  const user = db.users[userId];
  if (!user) return res.status(401).json({ error: "Sessão inválida." });
  req.user = user;
  req.token = token;
  next();
}
function userCanAccessServer(user, srv) {
  return !!(srv && srv.members.includes(user.id));
}
function areFriends(a, b) {
  return (a.friends || []).includes(b.id) && (b.friends || []).includes(a.id);
}
function channelKey(serverId, channelId) {
  return `${serverId}:${channelId}`;
}
function dmKey(a, b) {
  return [a, b].sort().join(":");
}
function textRoom(serverId, channelId) {
  return `text:${serverId}:${channelId}`;
}
function voiceRoom(serverId, channelId) {
  return `voice:${serverId}:${channelId}`;
}
function dmRoom(a, b) {
  return `dm:${dmKey(a, b)}`;
}
function dmVoiceRoom(a, b) {
  return `dmvoice:${dmKey(a, b)}`;
}
function safeAttachment(a) {
  if (!a || typeof a !== "object") return null;
  const url = String(a.url || "");
  if (!url.startsWith("/uploads/")) return null;
  return {
    url,
    name: String(a.name || "arquivo").slice(0, 180),
    type: String(a.type || "application/octet-stream").slice(0, 120),
    size: Number(a.size || 0)
  };
}
function ensureDefaultServerForUser(user) {
  user.servers ||= [];
  if (user.servers.length) return;
  const sid = id("srv");
  const textId = id("txt");
  const voiceId = id("vc");
  db.servers[sid] = {
    id: sid,
    name: `${user.nick || user.username} Hub`,
    icon: "",
    ownerId: user.id,
    members: [user.id],
    channels: [
      { id: textId, name: "geral", type: "text" },
      { id: voiceId, name: "Bate-papo", type: "voice" }
    ],
    createdAt: Date.now()
  };
  user.servers = [sid];
  db.messages[channelKey(sid, textId)] = [];
  saveDb();
}

app.use(express.json({ limit: "3mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 12).replace(/[^.\w-]/g, "");
    cb(null, `${Date.now()}_${crypto.randomBytes(7).toString("hex")}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }
});

app.post("/api/register", (req, res) => {
  const username = normalizeName(req.body.username);
  const password = String(req.body.password || "");
  if (username.length < 3 || username.length > 24)
    return res.status(400).json({ error: "O nome deve ter entre 3 e 24 caracteres." });
  if (password.length < 4)
    return res.status(400).json({ error: "A senha deve ter no mínimo 4 caracteres." });
  if (findUserByUsername(username))
    return res.status(409).json({ error: "Esse nome já está em uso." });

  const uid = id("usr");
  const user = {
    id: uid,
    username,
    nick: username,
    avatar: "",
    password: hashPassword(password),
    friends: [],
    servers: [],
    createdAt: Date.now()
  };
  db.users[uid] = user;
  ensureDefaultServerForUser(user);
  const token = crypto.randomBytes(32).toString("hex");
  db.sessions[token] = uid;
  saveDb();
  res.json({ token, user: publicUser(user) });
});

app.post("/api/login", (req, res) => {
  const user = findUserByUsername(req.body.username);
  if (!user || !verifyPassword(String(req.body.password || ""), user.password))
    return res.status(401).json({ error: "Nome ou senha inválidos." });
  const token = crypto.randomBytes(32).toString("hex");
  db.sessions[token] = user.id;
  ensureDefaultServerForUser(user);
  saveDb();
  res.json({ token, user: publicUser(user) });
});

app.post("/api/logout", auth, (req, res) => {
  delete db.sessions[req.token];
  saveDb();
  res.json({ ok: true });
});

app.get("/api/me", auth, (req, res) => {
  ensureDefaultServerForUser(req.user);
  res.json({ user: publicUser(req.user) });
});

app.post("/api/profile", auth, upload.single("avatar"), (req, res) => {
  const nick = normalizeName(req.body.nick);
  if (nick && (nick.length < 2 || nick.length > 28))
    return res.status(400).json({ error: "Nick deve ter entre 2 e 28 caracteres." });
  if (nick) req.user.nick = nick;
  if (req.file) req.user.avatar = `/uploads/${req.file.filename}`;
  saveDb();
  io.emit("presence:update");
  res.json({ user: publicUser(req.user) });
});

app.post("/api/upload", auth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });
  res.json({
    attachment: {
      url: `/uploads/${req.file.filename}`,
      name: req.file.originalname,
      type: req.file.mimetype || "application/octet-stream",
      size: req.file.size
    }
  });
});

app.get("/api/friends", auth, (req, res) => {
  const incoming = db.friendRequests
    .filter(r => r.to === req.user.id)
    .map(r => ({ id: r.id, from: publicUser(db.users[r.from]) }));
  const outgoing = db.friendRequests
    .filter(r => r.from === req.user.id)
    .map(r => ({ id: r.id, to: publicUser(db.users[r.to]) }));
  const friends = (req.user.friends || []).map(uid => publicUser(db.users[uid])).filter(Boolean);
  res.json({ friends, incoming, outgoing });
});

app.post("/api/friends/request", auth, (req, res) => {
  const target = findUserByUsername(req.body.username);
  if (!target) return res.status(404).json({ error: "Usuário não encontrado." });
  if (target.id === req.user.id)
    return res.status(400).json({ error: "Você não pode adicionar a si mesmo." });
  if ((req.user.friends || []).includes(target.id))
    return res.status(400).json({ error: "Vocês já são amigos." });
  if (db.friendRequests.some(r =>
    (r.from === req.user.id && r.to === target.id) ||
    (r.from === target.id && r.to === req.user.id)
  )) return res.status(400).json({ error: "Já existe uma solicitação entre vocês." });

  db.friendRequests.push({ id: id("fr"), from: req.user.id, to: target.id, createdAt: Date.now() });
  saveDb();
  io.to(`user:${target.id}`).emit("friend:request");
  res.json({ ok: true });
});

app.post("/api/friends/:id/accept", auth, (req, res) => {
  const idx = db.friendRequests.findIndex(r => r.id === req.params.id && r.to === req.user.id);
  if (idx < 0) return res.status(404).json({ error: "Solicitação não encontrada." });
  const r = db.friendRequests.splice(idx, 1)[0];
  const a = db.users[r.from], b = db.users[r.to];
  a.friends ||= []; b.friends ||= [];
  if (!a.friends.includes(b.id)) a.friends.push(b.id);
  if (!b.friends.includes(a.id)) b.friends.push(a.id);
  db.dmMessages[dmKey(a.id, b.id)] ||= [];
  saveDb();
  io.to(`user:${a.id}`).emit("friends:update");
  io.to(`user:${b.id}`).emit("friends:update");
  res.json({ ok: true });
});

app.post("/api/friends/:id/reject", auth, (req, res) => {
  const idx = db.friendRequests.findIndex(r => r.id === req.params.id && r.to === req.user.id);
  if (idx < 0) return res.status(404).json({ error: "Solicitação não encontrada." });
  db.friendRequests.splice(idx, 1);
  saveDb();
  res.json({ ok: true });
});

app.get("/api/dms/:friendId/messages", auth, (req, res) => {
  const friend = db.users[req.params.friendId];
  if (!friend || !areFriends(req.user, friend))
    return res.status(403).json({ error: "Essa conversa privada não está disponível." });
  const list = db.dmMessages[dmKey(req.user.id, friend.id)] || [];
  res.json({
    messages: list.slice(-200).map(m => ({ ...m, user: publicUser(db.users[m.userId]) })),
    friend: publicUser(friend)
  });
});

app.get("/api/servers", auth, (req, res) => {
  ensureDefaultServerForUser(req.user);
  const servers = (req.user.servers || []).map(sid => db.servers[sid]).filter(Boolean);
  res.json({ servers });
});

app.post("/api/servers", auth, (req, res) => {
  const name = normalizeName(req.body.name);
  if (!name || name.length > 40)
    return res.status(400).json({ error: "Nome de servidor inválido." });
  const sid = id("srv"), textId = id("txt"), voiceId = id("vc");
  const srv = {
    id: sid,
    name,
    icon: "",
    ownerId: req.user.id,
    members: [req.user.id],
    channels: [
      { id: textId, name: "geral", type: "text" },
      { id: voiceId, name: "Bate-papo", type: "voice" }
    ],
    createdAt: Date.now()
  };
  db.servers[sid] = srv;
  req.user.servers ||= [];
  req.user.servers.push(sid);
  db.messages[channelKey(sid, textId)] = [];
  saveDb();
  res.json({ server: srv });
});

app.post("/api/servers/:serverId/invite", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  if (!userCanAccessServer(req.user, srv))
    return res.status(403).json({ error: "Sem acesso." });
  const target = findUserByUsername(req.body.username);
  if (!target) return res.status(404).json({ error: "Usuário não encontrado." });
  if (!srv.members.includes(target.id)) srv.members.push(target.id);
  target.servers ||= [];
  if (!target.servers.includes(srv.id)) target.servers.push(srv.id);
  saveDb();
  io.to(`user:${target.id}`).emit("servers:update");
  io.to(`server:${srv.id}`).emit("server:update", srv.id);
  res.json({ ok: true });
});


app.post("/api/servers/:serverId/invite-friends", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  if (!userCanAccessServer(req.user, srv))
    return res.status(403).json({ error: "Sem acesso." });

  const requestedIds = Array.isArray(req.body.userIds)
    ? [...new Set(req.body.userIds.map(String))]
    : [];

  if (!requestedIds.length)
    return res.status(400).json({ error: "Selecione pelo menos um amigo." });

  const friendIds = new Set(req.user.friends || []);
  const added = [];

  for (const userId of requestedIds.slice(0, 50)) {
    if (!friendIds.has(userId)) continue;

    const target = db.users[userId];
    if (!target || target.id === req.user.id) continue;

    if (!srv.members.includes(target.id)) {
      srv.members.push(target.id);
      added.push(target.id);
    }

    target.servers ||= [];
    if (!target.servers.includes(srv.id)) target.servers.push(srv.id);
  }

  if (!added.length)
    return res.status(400).json({ error: "Esses amigos já estão no servidor ou não podem ser adicionados." });

  saveDb();

  for (const userId of added) io.to(`user:${userId}`).emit("servers:update");
  io.to(`server:${srv.id}`).emit("server:update", srv.id);

  res.json({
    ok: true,
    added: added.map(userId => publicUser(db.users[userId])).filter(Boolean)
  });
});

app.post("/api/servers/:serverId/channels", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  if (!userCanAccessServer(req.user, srv))
    return res.status(403).json({ error: "Sem acesso." });
  const name = normalizeName(req.body.name);
  const type = req.body.type === "voice" ? "voice" : "text";
  if (!name || name.length > 32)
    return res.status(400).json({ error: "Nome de canal inválido." });
  const ch = { id: id(type === "voice" ? "vc" : "txt"), name, type };
  srv.channels.push(ch);
  if (type === "text") db.messages[channelKey(srv.id, ch.id)] = [];
  saveDb();
  io.to(`server:${srv.id}`).emit("server:update", srv.id);
  res.json({ channel: ch });
});

app.get("/api/servers/:serverId/members", auth, (req, res) => {
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
});

app.get("/api/servers/:serverId/channels/:channelId/messages", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  if (!userCanAccessServer(req.user, srv))
    return res.status(403).json({ error: "Sem acesso." });
  const ch = srv.channels.find(c => c.id === req.params.channelId && c.type === "text");
  if (!ch) return res.status(404).json({ error: "Canal não encontrado." });
  const msgs = db.messages[channelKey(srv.id, ch.id)] || [];
  res.json({ messages: msgs.slice(-200).map(m => ({ ...m, user: publicUser(db.users[m.userId]) })) });
});

app.get("/api/servers/:serverId/voice-state", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  if (!userCanAccessServer(req.user, srv))
    return res.status(403).json({ error: "Sem acesso." });
  const channels = {};
  for (const ch of srv.channels.filter(c => c.type === "voice")) {
    channels[ch.id] = getRoomMembers(voiceRoom(srv.id, ch.id));
  }
  res.json({ channels });
});

app.get("/api/health", (_, res) => {
  res.json({ ok: true, users: Object.keys(db.users).length });
});

const onlineSockets = new Map();

function getRoomMembers(room) {
  return [...(io.sockets.adapter.rooms.get(room) || [])].map(sid => {
    const s = io.sockets.sockets.get(sid);
    return { socketId: sid, user: publicUser(db.users[s?.data.userId]) };
  }).filter(x => x.user);
}

function emitServerVoiceState(serverId, channelId) {
  io.to(`server:${serverId}`).emit("voice:state", {
    serverId,
    channelId,
    members: getRoomMembers(voiceRoom(serverId, channelId))
  });
}

function leaveMediaRoom(socket) {
  const m = socket.data.mediaRoom;
  if (!m) return;
  socket.to(m.room).emit("voice:user-left", { socketId: socket.id });
  socket.leave(m.room);
  socket.data.mediaRoom = null;
  if (m.kind === "server") emitServerVoiceState(m.serverId, m.channelId);
}

function joinMediaRoom(socket, meta) {
  leaveMediaRoom(socket);
  socket.join(meta.room);
  socket.data.mediaRoom = meta;

  const peers = getRoomMembers(meta.room).filter(p => p.socketId !== socket.id);
  socket.emit("voice:peers", peers);
  socket.to(meta.room).emit("voice:user-joined", {
    socketId: socket.id,
    user: publicUser(db.users[socket.data.userId])
  });
  if (meta.kind === "server") emitServerVoiceState(meta.serverId, meta.channelId);
}

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const uid = db.sessions[token];
  if (!uid || !db.users[uid]) return next(new Error("unauthorized"));
  socket.data.userId = uid;
  next();
});

io.on("connection", socket => {
  const uid = socket.data.userId;
  const user = db.users[uid];

  socket.join(`user:${uid}`);
  for (const sid of user.servers || []) socket.join(`server:${sid}`);

  if (!onlineSockets.has(uid)) onlineSockets.set(uid, new Set());
  onlineSockets.get(uid).add(socket.id);
  io.emit("presence:update");

  socket.on("text:join", ({ serverId, channelId }) => {
    const srv = db.servers[serverId];
    if (!userCanAccessServer(user, srv)) return;
    for (const room of [...socket.rooms]) if (room.startsWith("text:")) socket.leave(room);
    socket.join(textRoom(serverId, channelId));
  });

  socket.on("message:send", ({ serverId, channelId, text, attachment }) => {
    const srv = db.servers[serverId];
    if (!userCanAccessServer(user, srv)) return;
    const ch = srv.channels.find(c => c.id === channelId && c.type === "text");
    if (!ch) return;

    const clean = String(text || "").trim().slice(0, 4000);
    const file = safeAttachment(attachment);
    if (!clean && !file) return;

    const msg = {
      id: id("msg"),
      userId: uid,
      text: clean,
      attachment: file,
      createdAt: Date.now()
    };
    const key = channelKey(serverId, channelId);
    db.messages[key] ||= [];
    db.messages[key].push(msg);
    if (db.messages[key].length > 700) db.messages[key] = db.messages[key].slice(-700);
    saveDb();

    io.to(textRoom(serverId, channelId)).emit("message:new", {
      ...msg,
      user: publicUser(user)
    });
  });

  socket.on("dm:join", ({ friendId }) => {
    const friend = db.users[friendId];
    if (!friend || !areFriends(user, friend)) return;
    for (const room of [...socket.rooms]) if (room.startsWith("dm:")) socket.leave(room);
    socket.join(dmRoom(uid, friendId));
  });

  socket.on("dm:send", ({ friendId, text, attachment }) => {
    const friend = db.users[friendId];
    if (!friend || !areFriends(user, friend)) return;
    const clean = String(text || "").trim().slice(0, 4000);
    const file = safeAttachment(attachment);
    if (!clean && !file) return;

    const msg = {
      id: id("dm"),
      userId: uid,
      friendId,
      text: clean,
      attachment: file,
      createdAt: Date.now()
    };
    const key = dmKey(uid, friendId);
    db.dmMessages[key] ||= [];
    db.dmMessages[key].push(msg);
    if (db.dmMessages[key].length > 1000) db.dmMessages[key] = db.dmMessages[key].slice(-1000);
    saveDb();

    io.to(dmRoom(uid, friendId)).emit("dm:new", {
      ...msg,
      user: publicUser(user),
      peerId: friendId
    });
    io.to(`user:${friendId}`).emit("dm:notify", {
      from: publicUser(user),
      message: { ...msg, user: publicUser(user) }
    });
  });

  socket.on("voice:join", ({ serverId, channelId }, ack) => {
    const srv = db.servers[serverId];
    const ch = srv?.channels.find(c => c.id === channelId && c.type === "voice");
    if (!userCanAccessServer(user, srv) || !ch) {
      if (typeof ack === "function") ack({ ok: false, error: "Sem acesso ao canal." });
      return;
    }

    joinMediaRoom(socket, {
      kind: "server",
      room: voiceRoom(serverId, channelId),
      serverId,
      channelId
    });

    // Devolve o estado atual da sala no próprio join. Isso evita a janela
    // em que o cliente entra novamente mas ainda não recebeu voice:state.
    if (typeof ack === "function") {
      ack({
        ok: true,
        serverId,
        channelId,
        members: getRoomMembers(voiceRoom(serverId, channelId))
      });
    }
  });

  socket.on("dmcall:ring", ({ friendId }) => {
    const friend = db.users[friendId];
    if (!friend || !areFriends(user, friend)) return;
    io.to(`user:${friendId}`).emit("dmcall:incoming", { from: publicUser(user) });
  });

  socket.on("dmvoice:join", ({ friendId }) => {
    const friend = db.users[friendId];
    if (!friend || !areFriends(user, friend)) return;
    joinMediaRoom(socket, {
      kind: "dm",
      room: dmVoiceRoom(uid, friendId),
      friendId
    });
  });

  socket.on("voice:leave", () => leaveMediaRoom(socket));

  socket.on("webrtc:offer", ({ to, sdp }) => {
    io.to(to).emit("webrtc:offer", {
      from: socket.id,
      sdp,
      user: publicUser(user)
    });
  });
  socket.on("webrtc:answer", ({ to, sdp }) => {
    io.to(to).emit("webrtc:answer", { from: socket.id, sdp });
  });
  socket.on("webrtc:ice", ({ to, candidate }) => {
    io.to(to).emit("webrtc:ice", { from: socket.id, candidate });
  });

  socket.on("media:state", state => {
    const m = socket.data.mediaRoom;
    if (!m) return;
    socket.to(m.room).emit("media:state", {
      socketId: socket.id,
      userId: uid,
      muted: !!state?.muted,
      sharing: !!state?.sharing,
      voiceStreamId: state?.voiceStreamId || null,
      screenStreamId: state?.screenStreamId || null,
      voiceTrackId: state?.voiceTrackId || null,
      screenAudioTrackId: state?.screenAudioTrackId || null,
      screenVideoTrackId: state?.screenVideoTrackId || null
    });
  });

  socket.on("disconnect", () => {
    leaveMediaRoom(socket);
    const set = onlineSockets.get(uid);
    if (set) {
      set.delete(socket.id);
      if (!set.size) onlineSockets.delete(uid);
    }
    io.emit("presence:update");
  });
});

app.use((req, res, next) => {
  if (req.method === "GET") {
    return res.sendFile(path.join(__dirname, "public", "index.html"));
  }
  next();
});

app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada." });
});

async function start() {
  await initDatabase();
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Essência Chat rodando em http://localhost:${PORT}`);
    console.log(`Persistência: ${pool ? "PostgreSQL Neon + cache local" : "cache local db.json"}`);
  });
}

start().catch(err => {
  console.error("Falha ao iniciar o Essência Chat:", err);
  process.exit(1);
});