module.exports = function applyV26SourcePatch(source) {
  const replace = (search, replacement, label) => {
    if (!source.includes(search)) {
      console.warn(`[V26] Patch opcional não encontrado: ${label}`);
      return false;
    }
    source = source.replace(search, replacement);
    return true;
  };

  const ASSET_VERSION = '301safe1';

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

  // Base funcional conhecida + PWA segura sem interceptar fetch.
  source = source.replace(
    '"/v25-final-ui.js"]',
    `"/v25-final-ui.js?v=${ASSET_VERSION}", "/v26-stability.js?v=${ASSET_VERSION}", "/v30-safe-pwa.js?v=${ASSET_VERSION}"]`
  );
  source = source.replace(
    '"/v24-admin-fix.js"]',
    `"/v24-admin-fix.js?v=${ASSET_VERSION}", "/v26-stability.js?v=${ASSET_VERSION}", "/v30-safe-pwa.js?v=${ASSET_VERSION}"]`
  );

  // Visual original da V30 + rework Light original da V30.1.
  // v30-compat.css adapta seletores que antes dependiam do JS instável da V30.
  source = source.replace(
    '"/v25-final-ui.css"]',
    `"/v25-final-ui.css?v=${ASSET_VERSION}", "/v27-media.css?v=${ASSET_VERSION}", "/v30-ui.css?v=${ASSET_VERSION}", "/v30-1-light.css?v=${ASSET_VERSION}", "/v30-compat.css?v=${ASSET_VERSION}", "/v30-safe-pwa.css?v=${ASSET_VERSION}"]`
  );
  source = source.replace(
    '"/v24-admin-fix.css"]',
    `"/v24-admin-fix.css?v=${ASSET_VERSION}", "/v27-media.css?v=${ASSET_VERSION}", "/v30-ui.css?v=${ASSET_VERSION}", "/v30-1-light.css?v=${ASSET_VERSION}", "/v30-compat.css?v=${ASSET_VERSION}", "/v30-safe-pwa.css?v=${ASSET_VERSION}"]`
  );

  // Cache-busting de todos os assets-base para evitar clientes misturando versões.
  replace(
    'let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");',
    `let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    const essenciaAssetVersion = '${ASSET_VERSION}';
    const essenciaBaseAssets = [
      '/styles.css', '/v11-hotfix.css', '/v20-search.css', '/v22-home-refine.css',
      '/app.js', '/v11-hotfix.js', '/v20-search.js'
    ];
    for (const asset of essenciaBaseAssets) {
      html = html.split('"' + asset + '"').join('"' + asset + '?v=' + essenciaAssetVersion + '"');
    }
    if (!html.includes('manifest.webmanifest?v=${ASSET_VERSION}')) {
      html = html.replace('</head>', '  <link rel="manifest" href="/manifest.webmanifest?v=${ASSET_VERSION}" />\\n  <link rel="icon" type="image/svg+xml" href="/essencia-icon.svg?v=${ASSET_VERSION}" />\\n  <link rel="shortcut icon" href="/essencia-icon.svg?v=${ASSET_VERSION}" />\\n  <link rel="apple-touch-icon" href="/essencia-icon.svg?v=${ASSET_VERSION}" />\\n  <meta name="theme-color" content="#745cff" />\\n  <meta name="mobile-web-app-capable" content="yes" />\\n  <meta name="apple-mobile-web-app-capable" content="yes" />\\n  <meta name="apple-mobile-web-app-title" content="Essência" />\\n</head>');
    }`,
    'favicon, manifesto e cache-busting runtime'
  );

  return source;
};
