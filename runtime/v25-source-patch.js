module.exports = function applyV25SourcePatch(source) {
  // Injeta a camada visual final depois das versões funcionais, para ela ter prioridade no CSS.
  source = source.replace('"/v24-admin-fix.css"]', '"/v24-admin-fix.css", "/v25-final-ui.css"]');
  source = source.replace('"/v24-admin-fix.js"]', '"/v24-admin-fix.js", "/v25-final-ui.js"]');

  // Fallback para instalações onde a lista ainda termina na V23.
  source = source.replace('"/v23-channel-settings.css"]', '"/v23-channel-settings.css", "/v25-final-ui.css"]');
  source = source.replace('"/v23-channel-settings.js"]', '"/v23-channel-settings.js", "/v25-final-ui.js"]');

  return source;
};
