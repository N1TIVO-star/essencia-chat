module.exports = function applyV28SourcePatch(source) {
  // PWA continua ativo pela V26/V28. A V3.0/V30 usa apenas camadas CSS seguras.
  if (!source.includes('"/v30-ui.css"')) {
    source = source.replace('"/v28-pwa.css"]', '"/v28-pwa.css", "/v30-ui.css"]');
  }
  if (!source.includes('"/v30-1-light.css"')) {
    source = source.replace('"/v30-ui.css"]', '"/v30-ui.css", "/v30-1-light.css"]');
  }
  return source;
};
