module.exports = function applyV302SourcePatch(source) {
  // Camadas isoladas da V30.2.
  if (!source.includes('"/v30-2-fixes.css"')) {
    source = source.replace('"/v30-1-light.css"]', '"/v30-1-light.css", "/v30-2-fixes.css"]');
  }
  if (!source.includes('"/v30-2-gif.js"')) {
    source = source.replace('"/v28-pwa.js"]', '"/v28-pwa.js", "/v30-2-gif.js"]');
  }

  // Proxy seguro para o Tenor. A chave fica somente no servidor/Square Cloud.
  if (!source.includes('app.get("/api/tenor/gifs"')) {
    const marker = 'app.get("/api/presence", auth, (req, res) => {';
    const route = `app.get("/api/tenor/gifs", auth, async (req, res) => {
  const apiKey = String(process.env.TENOR_API_KEY || "").trim();
  if (!apiKey) {
    return res.status(503).json({
      error: "Biblioteca Tenor ainda não configurada no servidor.",
      needsKey: true,
      results: []
    });
  }

  const query = String(req.query.q || "").trim().slice(0, 80);
  const pos = String(req.query.pos || "").trim().slice(0, 180);
  const endpoint = query ? "search" : "featured";
  const params = new URLSearchParams({
    key: apiKey,
    client_key: "essencia_chat",
    limit: "28",
    media_filter: "gif,tinygif",
    contentfilter: "medium",
    locale: "pt_BR"
  });
  if (query) params.set("q", query);
  if (pos) params.set("pos", pos);

  try {
    const response = await fetch("https://tenor.googleapis.com/v2/" + endpoint + "?" + params.toString(), {
      headers: { "Accept": "application/json" }
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn("Tenor respondeu", response.status, detail.slice(0, 180));
      return res.status(502).json({ error: "Não foi possível carregar os GIFs do Tenor.", results: [] });
    }

    const payload = await response.json();
    const results = (payload.results || []).map(item => {
      const full = item.media_formats?.gif || item.media_formats?.mediumgif || item.media_formats?.tinygif;
      const preview = item.media_formats?.tinygif || full;
      if (!full?.url) return null;
      return {
        id: item.id,
        title: item.content_description || item.title || "GIF Tenor",
        url: full.url,
        preview: preview?.url || full.url,
        width: Array.isArray(full.dims) ? full.dims[0] : null,
        height: Array.isArray(full.dims) ? full.dims[1] : null
      };
    }).filter(Boolean);

    res.json({ results, next: payload.next || "" });
  } catch (err) {
    console.error("Erro Tenor:", err?.message || err);
    res.status(502).json({ error: "Não foi possível carregar os GIFs do Tenor.", results: [] });
  }
});

`;
    if (source.includes(marker)) source = source.replace(marker, route + marker);
    else console.warn('[V30.2] Endpoint de presença não encontrado para inserir Tenor.');
  }

  return source;
};
