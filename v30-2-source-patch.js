module.exports = function applyV302SourcePatch(source) {
  // V30.3 mantém apenas as camadas visuais/cliente para GIF por link ou dispositivo.
  if (!source.includes('"/v30-2-fixes.css"')) {
    source = source.replace('"/v30-1-light.css"]', '"/v30-1-light.css", "/v30-2-fixes.css"]');
  }
  if (!source.includes('"/v30-2-gif.js"')) {
    source = source.replace('"/v28-pwa.js"]', '"/v28-pwa.js", "/v30-2-gif.js"]');
  }
  return source;
};
