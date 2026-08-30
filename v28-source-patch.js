module.exports = function applyV28SourcePatch(source) {
  source = source.replace('"/v25-final-ui.css"]', '"/v25-final-ui.css", "/v28-pwa.css", "/v30-ui.css"]');
  source = source.replace('"/v28-pwa.css"]', '"/v28-pwa.css", "/v30-ui.css"]');

  source = source.replace('"/v26-stability.js"]', '"/v26-stability.js", "/v28-pwa.js", "/v30-ui.js"]');
  source = source.replace('"/v25-final-ui.js", "/v26-stability.js"]', '"/v25-final-ui.js", "/v26-stability.js", "/v28-pwa.js", "/v30-ui.js"]');
  source = source.replace('"/v28-pwa.js"]', '"/v28-pwa.js", "/v30-ui.js"]');

  return source;
};
