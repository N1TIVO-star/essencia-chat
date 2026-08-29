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

  // Carrega as camadas cliente finais.
  source = source.replace('"/v25-final-ui.js"]', '"/v25-final-ui.js", "/v26-stability.js", "/v28-pwa.js"]');
  source = source.replace('"/v24-admin-fix.js"]', '"/v24-admin-fix.js", "/v26-stability.js", "/v28-pwa.js"]');
  source = source.replace('"/v26-stability.js"]', '"/v26-stability.js", "/v28-pwa.js"]');

  // V27: amplia transmissão e mostra imagens de grupos completas.
  source = source.replace('"/v25-final-ui.css"]', '"/v25-final-ui.css", "/v27-media.css", "/v28-pwa.css"]');
  source = source.replace('"/v24-admin-fix.css"]', '"/v24-admin-fix.css", "/v27-media.css", "/v28-pwa.css"]');
  source = source.replace('"/v27-media.css"]', '"/v27-media.css", "/v28-pwa.css"]');

  // V29: favicon + manifesto reais no HTML servido em runtime.
  replace(
    'let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");',
    `let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    if (!html.includes('manifest.webmanifest?v=29')) {
      html = html.replace('</head>', '  <link rel="manifest" href="/manifest.webmanifest?v=29" />\\n  <link rel="icon" type="image/png" sizes="192x192" href="/essencia-192.png?v=29" />\\n  <link rel="icon" type="image/png" sizes="512x512" href="/essencia-512.png?v=29" />\\n  <link rel="shortcut icon" href="/essencia-192.png?v=29" />\\n  <link rel="apple-touch-icon" href="/essencia-192.png?v=29" />\\n  <meta name="theme-color" content="#745cff" />\\n  <meta name="mobile-web-app-capable" content="yes" />\\n  <meta name="apple-mobile-web-app-capable" content="yes" />\\n  <meta name="apple-mobile-web-app-title" content="Essência" />\\n</head>');
    }`,
    'favicon e manifesto runtime V29'
  );

  return source;
};
