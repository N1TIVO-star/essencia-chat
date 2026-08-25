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
`app.use(express.json({ limit: "3mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));`,
`app.use(express.json({ limit: "3mb" }));

// Presence Lite + Message Notify Lite + Call Ring Lite + Speaking Lite.
app.use((req, res, next) => {
  if (req.method !== "GET" || !["/", "/index.html"].includes(req.path)) return next();
  try {
    let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    if (!html.includes("/presence-lite.css")) {
      html = html.replace("</head>", '  <link rel="stylesheet" href="/presence-lite.css" />\\n</head>');
    }
    if (!html.includes("/presence-lite.js")) {
      html = html.replace("</body>", '  <script src="/presence-lite.js"></script>\\n</body>');
    }
    if (!html.includes("/message-notify-lite.js")) {
      html = html.replace("</body>", '  <script src="/message-notify-lite.js"></script>\\n</body>');
    }
    if (!html.includes("/call-ring-lite.js")) {
      html = html.replace("</body>", '  <script src="/call-ring-lite.js"></script>\\n</body>');
    }
    if (!html.includes("/speaking-lite.js")) {
      html = html.replace("</body>", '  <script src="/speaking-lite.js"></script>\\n</body>');
    }
    res.type("html").send(html);
  } catch (err) {
    next(err);
  }
});

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));`,
'injeção dos arquivos leves'
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
}`,
'endpoint e emissor de presença'
);

patchOnce(
`    io.to(textRoom(serverId, channelId)).emit("message:new", {
      ...msg,
      user: publicUser(user)
    });`,
`    const deliveredMessage = {
      ...msg,
      user: publicUser(user)
    };

    io.to(textRoom(serverId, channelId)).emit("message:new", deliveredMessage);

    for (const memberId of srv.members || []) {
      if (memberId === uid) continue;
      io.to(\`user:\${memberId}\`).emit("message:notify", {
        from: publicUser(user),
        serverId,
        serverName: srv.name,
        channelId,
        channelName: ch.name,
        message: deliveredMessage
      });
    }`,
'notificação de mensagens do servidor'
);

source = source.replaceAll('io.emit("presence:update");', 'emitPresence();');

const runtimeFilename = path.join(__dirname, 'server.presence-lite.runtime.js');
const runtimeModule = new Module(runtimeFilename, module);
runtimeModule.filename = runtimeFilename;
runtimeModule.paths = module.paths;
runtimeModule._compile(source, runtimeFilename);
