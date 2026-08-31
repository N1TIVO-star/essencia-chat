module.exports = function applyV26SourcePatch(source) {
  const replace = (search, replacement, label) => {
    if (!source.includes(search)) {
      console.warn(`[V26] Patch opcional não encontrado: ${label}`);
      return false;
    }
    source = source.replace(search, replacement);
    return true;
  };

  const ASSET_VERSION = '31safe8';

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

  // Mantém a base estável e injeta apenas camadas V31 isoladas.
  source = source.replace(
    '"/v25-final-ui.js"]',
    `"/v25-final-ui.js?v=${ASSET_VERSION}", "/v26-stability.js?v=${ASSET_VERSION}", "/v30-safe-pwa.js?v=${ASSET_VERSION}", "/v31-ui-controls.js?v=${ASSET_VERSION}", "/v31-voice-video-settings.js?v=${ASSET_VERSION}", "/v31-stage2-callbar.js?v=${ASSET_VERSION}", "/v31-stage3-share.js?v=${ASSET_VERSION}", "/v31-social-polish.js?v=${ASSET_VERSION}"]`
  );
  source = source.replace(
    '"/v24-admin-fix.js"]',
    `"/v24-admin-fix.js?v=${ASSET_VERSION}", "/v26-stability.js?v=${ASSET_VERSION}", "/v30-safe-pwa.js?v=${ASSET_VERSION}", "/v31-ui-controls.js?v=${ASSET_VERSION}", "/v31-voice-video-settings.js?v=${ASSET_VERSION}", "/v31-stage2-callbar.js?v=${ASSET_VERSION}", "/v31-stage3-share.js?v=${ASSET_VERSION}", "/v31-social-polish.js?v=${ASSET_VERSION}"]`
  );

  source = source.replace(
    '"/v25-final-ui.css"]',
    `"/v25-final-ui.css?v=${ASSET_VERSION}", "/v27-media.css?v=${ASSET_VERSION}", "/v30-safe.css?v=${ASSET_VERSION}", "/v30-safe-pwa.css?v=${ASSET_VERSION}", "/v31-ui-controls.css?v=${ASSET_VERSION}", "/v31-call-hotfix.css?v=${ASSET_VERSION}", "/v31-voice-video-settings.css?v=${ASSET_VERSION}", "/v31-stage2-callbar.css?v=${ASSET_VERSION}", "/v31-stage3-share.css?v=${ASSET_VERSION}", "/v31-social-polish.css?v=${ASSET_VERSION}"]`
  );
  source = source.replace(
    '"/v24-admin-fix.css"]',
    `"/v24-admin-fix.css?v=${ASSET_VERSION}", "/v27-media.css?v=${ASSET_VERSION}", "/v30-safe.css?v=${ASSET_VERSION}", "/v30-safe-pwa.css?v=${ASSET_VERSION}", "/v31-ui-controls.css?v=${ASSET_VERSION}", "/v31-call-hotfix.css?v=${ASSET_VERSION}", "/v31-voice-video-settings.css?v=${ASSET_VERSION}", "/v31-stage2-callbar.css?v=${ASSET_VERSION}", "/v31-stage3-share.css?v=${ASSET_VERSION}", "/v31-social-polish.css?v=${ASSET_VERSION}"]`
  );

  // Favicon + manifesto + quebra de cache dos arquivos-base do HTML.
  replace(
    'let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");',
    `let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    const essenciaAssetVersion = '${ASSET_VERSION}';
    const essenciaBaseAssets = [
      '/styles.css',
      '/v11-hotfix.css',
      '/v20-search.css',
      '/v22-home-refine.css',
      '/app.js',
      '/v11-hotfix.js',
      '/v20-search.js'
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
