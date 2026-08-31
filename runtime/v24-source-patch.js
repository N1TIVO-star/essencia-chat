module.exports = function applyV24SourcePatch(source) {
  source = source.replace('"/v23-channel-settings.css"]', '"/v23-channel-settings.css", "/v24-admin-fix.css"]');
  source = source.replace('"/v23-channel-settings.js"]', '"/v23-channel-settings.js", "/v24-admin-fix.js"]');

  // Fallback caso a V23 não tenha alterado a lista por algum motivo.
  source = source.replace('"/v21-community.css"]', '"/v21-community.css", "/v24-admin-fix.css"]');
  source = source.replace('"/v21-community.js"]', '"/v21-community.js", "/v24-admin-fix.js"]');
  return source;
};
