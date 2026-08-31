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

  // Mantém a camada funcional estável V26/V27 e adiciona apenas o instalador seguro.
  source = source.replace('"/v25-final-ui.js"]', '"/v25-final-ui.js", "/v26-stability.js", "/v30-safe-pwa.js"]');
  source = source.replace('"/v24-admin-fix.js"]', '"/v24-admin-fix.js", "/v26-stability.js", "/v30-safe-pwa.js"]');

  // V27: mídia ampliada + V30 Safe visual + estilos do instalador.
  source = source.replace('"/v25-final-ui.css"]', '"/v25-final-ui.css", "/v27-media.css", "/v30-safe.css", "/v30-safe-pwa.css"]');
  source = source.replace('"/v24-admin-fix.css"]', '"/v24-admin-fix.css", "/v27-media.css", "/v30-safe.css", "/v30-safe-pwa.css"]');

  // Favicon + manifesto. O service worker seguro não intercepta fetch nem cria cache.
  replace(
    'let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");',
    `let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    if (!html.includes('manifest.webmanifest?v=30safe')) {
      html = html.replace('</head>', '  <link rel="manifest" href="/manifest.webmanifest?v=30safe" />\\n  <link rel="icon" type="image/svg+xml" href="/essencia-icon.svg?v=30safe" />\\n  <link rel="shortcut icon" href="/essencia-icon.svg?v=30safe" />\\n  <link rel="apple-touch-icon" href="/essencia-icon.svg?v=30safe" />\\n  <meta name="theme-color" content="#745cff" />\\n  <meta name="mobile-web-app-capable" content="yes" />\\n  <meta name="apple-mobile-web-app-capable" content="yes" />\\n  <meta name="apple-mobile-web-app-title" content="Essência" />\\n</head>');
    }`,
    'favicon e manifesto runtime seguro'
  );

  return source;
};
