const fs = require('fs');
const path = require('path');
const Module = require('module');

const originalPath = path.join(__dirname, 'server.js');
let source = fs.readFileSync(originalPath, 'utf8');

function patchOnce(search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`V13 patch não encontrou: ${label}`);
  }
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
    friends: u.friends || [],
    online: !!onlineSockets.get(u.id)?.size
  };
}`,
'publicUser/presença'
);

patchOnce(
`app.use(express.json({ limit: "3mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));`,
`app.use(express.json({ limit: "3mb" }));

// V13: injeta os recursos de presença/notificações sem alterar o HTML-base.
app.use((req, res, next) => {
  if (req.method !== "GET" || !["/", "/index.html"].includes(req.path)) return next();
  try {
    let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    if (!html.includes("/v13-hotfix.css")) {
      html = html.replace("</head>", '  <link rel="stylesheet" href="/v13-hotfix.css" />\\n</head>');
    }
    if (!html.includes("/v13-hotfix.js")) {
      html = html.replace("</body>", '  <script src="/v13-hotfix.js"></script>\\n</body>');
    }
    res.type("html").send(html);
  } catch (err) {
    next(err);
  }
});

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));`,
'injeção client V13'
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

    // V13: avisa os membros do servidor mesmo quando eles estão em outro canal/PV.
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
'notificação de mensagem de servidor'
);

patchOnce(
`  socket.on("dmcall:ring", ({ friendId }) => {
    const friend = db.users[friendId];
    if (!friend || !areFriends(user, friend)) return;
    io.to(\`user:\${friendId}\`).emit("dmcall:incoming", { from: publicUser(user) });
  });`,
`  socket.on("dmcall:ring", ({ friendId }) => {
    const friend = db.users[friendId];
    if (!friend || !areFriends(user, friend)) return;
    io.to(\`user:\${friendId}\`).emit("dmcall:incoming", { from: publicUser(user) });
  });

  socket.on("dmcall:decline", ({ friendId }) => {
    const friend = db.users[friendId];
    if (!friend || !areFriends(user, friend)) return;
    io.to(\`user:\${friendId}\`).emit("dmcall:declined", { from: publicUser(user) });
  });`,
'recusa de chamada'
);

// Compila a versão corrigida mantendo __dirname/require como se fosse o server.js original.
const runtimeFilename = path.join(__dirname, 'server.v13.runtime.js');
const runtimeModule = new Module(runtimeFilename, module);
runtimeModule.filename = runtimeFilename;
runtimeModule.paths = module.paths;
runtimeModule._compile(source, runtimeFilename);
