module.exports = function applyV28SourcePatch(source) {
  source = source.replace('"/v25-final-ui.css"]', '"/v25-final-ui.css", "/v28-pwa.css"]');
  source = source.replace('"/v26-stability.js"]', '"/v26-stability.js", "/v28-pwa.js"]');
  source = source.replace('"/v25-final-ui.js", "/v26-stability.js"]', '"/v25-final-ui.js", "/v26-stability.js", "/v28-pwa.js"]');

  const manifestMarkup = '  <link rel="manifest" href="/manifest.webmanifest?v=28" />\\n  <meta name="mobile-web-app-capable" content="yes" />\\n  <meta name="apple-mobile-web-app-capable" content="yes" />\\n  <meta name="apple-mobile-web-app-title" content="Essência" />\\n';
  if (!source.includes('manifest.webmanifest?v=28')) {
    source = source.replace("html = html.replace('</head>',", "html = html.replace('</head>', '" + manifestMarkup + "</head>');\n    html = html.replace('</head>',");
  }

  return source;
};
