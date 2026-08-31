module.exports = function applyV26SourcePatch(source) {
  const replace = (search, replacement, label) => {
    if (!source.includes(search)) {
      console.warn(`[V26] Patch opcional não encontrado: ${label}`);
      return false;
    }
    source = source.replace(search, replacement);
    return true;
  };

  // Tolera oscilações curtas de rede antes de considerar o Socket.IO perdido.
  replace(
    'const io = new Server(server, { maxHttpBufferSize: 25 * 1024 * 1024 });',
    `const io = new Server(server, {
  maxHttpBufferSize: 25 * 1024 * 1024,
  pingInterval: 20000,
  pingTimeout: 60000,
  connectTimeout: 45000
});`,
    'configuração Socket.IO'
  );

  // Mantém a camada funcional estável V26/V27.
  source = source.replace('"/v25-final-ui.js"]', '"/v25-final-ui.js", "/v26-stability.js"]');
  source = source.replace('"/v24-admin-fix.js"]', '"/v24-admin-fix.js", "/v26-stability.js"]');

  // V27: mídia ampliada + V30 Safe: somente CSS visual, sem PWA e sem JS extra.
  source = source.replace('"/v25-final-ui.css"]', '"/v25-final-ui.css", "/v27-media.css", "/v30-safe.css"]');
  source = source.replace('"/v24-admin-fix.css"]', '"/v24-admin-fix.css", "/v27-media.css", "/v30-safe.css"]');

  // Favicon real no HTML servido em runtime, com versão para quebrar cache antigo.
  replace(
    'let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");',
    `let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    if (!html.includes('essencia-icon.svg?v=30safe')) {
      html = html.replace('</head>', '  <link rel="icon" type="image/svg+xml" href="/essencia-icon.svg?v=30safe" />\\n  <link rel="shortcut icon" href="/essencia-icon.svg?v=30safe" />\\n  <link rel="apple-touch-icon" href="/essencia-icon.svg?v=30safe" />\\n</head>');
    }`,
    'favicon runtime'
  );

  return source;
};
