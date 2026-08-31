module.exports = function applyV23SourcePatch(source) {
  const replace = (search, replacement, label) => {
    if (!source.includes(search)) {
      console.warn(`[V23] Patch opcional não encontrado: ${label}`);
      return false;
    }
    source = source.replace(search, replacement);
    return true;
  };

  // Carrega os assets da V23 no mesmo middleware de HTML usado pela base atual.
  source = source.replace('"/v21-community.css"]', '"/v21-community.css", "/v23-channel-settings.css"]');
  source = source.replace('"/v21-community.js"]', '"/v21-community.js", "/v23-channel-settings.js"]');

  const deleteRoute = `
app.delete("/api/servers/:serverId/channels/:channelId", auth, (req, res) => {
  const srv = db.servers[req.params.serverId];
  if (!userCanAccessServer(req.user, srv) || !hasServerPermission(srv, req.user.id, "manageChannels")) {
    return res.status(403).json({ error: "Sem permissão para excluir canais." });
  }

  const index = (srv.channels || []).findIndex(ch => ch.id === req.params.channelId);
  if (index < 0) return res.status(404).json({ error: "Canal não encontrado." });

  const channel = srv.channels[index];
  if (channel.type === "text") delete db.messages[channelKey(srv.id, channel.id)];

  // Se alguém estiver conectado exatamente neste canal de voz, remove a sala antes de apagar.
  if (channel.type === "voice") {
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.mediaRoom?.kind === "server" && socket.data.mediaRoom.serverId === srv.id && socket.data.mediaRoom.channelId === channel.id) {
        try { leaveMediaRoom(socket); } catch {}
      }
    }
  }

  srv.channels.splice(index, 1);
  saveDb();
  io.to("server:" + srv.id).emit("server:update", srv.id);
  for (const uid of srv.members || []) io.to("user:" + uid).emit("servers:update");
  res.json({ ok:true, channelId:channel.id });
});
`;

  const marker = 'app.get("/api/presence", auth, (req, res) => {';
  if (source.includes(marker)) source = source.replace(marker, deleteRoute + '\n' + marker);
  else console.warn('[V23] Ponto de inserção da rota DELETE não encontrado.');

  return source;
};
