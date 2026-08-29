module.exports = function applyV28SourcePatch(source) {
  source = source.replace('"/v25-final-ui.css"]', '"/v25-final-ui.css", "/v28-pwa.css"]');
  source = source.replace('"/v26-stability.js"]', '"/v26-stability.js", "/v28-pwa.js"]');
  source = source.replace('"/v25-final-ui.js", "/v26-stability.js"]', '"/v25-final-ui.js", "/v26-stability.js", "/v28-pwa.js"]');
  return source;
};
