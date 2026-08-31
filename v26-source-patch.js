module.exports = function applyV26SourcePatch(source) {
  const replace = (search, replacement, label) => {
    if (!source.includes(search)) {
      console.warn(`[V26] Patch opcional não encontrado: ${label}`);
      return false;
    }
    source = source.replace(search, replacement);
    return true;
  };

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

  // Camadas funcionais originais da V30.1: estabilidade V26, mídia V27 e PWA V28.
  source = source.replace('"/v25-final-ui.js"]', '"/v25-final-ui.js", "/v26-stability.js", "/v28-pwa.js"]');
  source = source.replace('"/v24-admin-fix.js"]', '"/v24-admin-fix.js", "/v26-stability.js", "/v28-pwa.js"]');
  source = source.replace('"/v26-stability.js"]', '"/v26-stability.js", "/v28-pwa.js"]');

  source = source.replace('"/v25-final-ui.css"]', '"/v25-final-ui.css", "/v27-media.css", "/v28-pwa.css"]');
  source = source.replace('"/v24-admin-fix.css"]', '"/v24-admin-fix.css", "/v27-media.css", "/v28-pwa.css"]');
  source = source.replace('"/v27-media.css"]', '"/v27-media.css", "/v28-pwa.css"]');

  // V29: identidade/PWA + quebra de cache dos arquivos-base do HTML.
  replace(
    'let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");',
    `let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    const restoreVersion = '301restore1';
    const baseAssets = ['/styles.css','/v11-hotfix.css','/v20-search.css','/v22-home-refine.css','/app.js','/v11-hotfix.js','/v20-search.js'];
    for (const asset of baseAssets) {
      html = html.split('"' + asset + '"').join('"' + asset + '?v=' + restoreVersion + '"');
    }
    if (!html.includes('manifest.webmanifest?v=301restore1')) {
      html = html.replace('</head>', '  <link rel="manifest" href="/manifest.webmanifest?v=301restore1" />\\n  <link rel="icon" type="image/svg+xml" href="/essencia-icon.svg?v=301restore1" />\\n  <link rel="shortcut icon" href="/essencia-icon.svg?v=301restore1" />\\n  <link rel="apple-touch-icon" href="/essencia-icon.svg?v=301restore1" />\\n  <meta name="theme-color" content="#745cff" />\\n  <meta name="mobile-web-app-capable" content="yes" />\\n  <meta name="apple-mobile-web-app-capable" content="yes" />\\n  <meta name="apple-mobile-web-app-title" content="Essência" />\\n</head>');
    }`,
    'favicon, manifesto e cache-busting V30.1 restaurada'
  );

  return source;
};
