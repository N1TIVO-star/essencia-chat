module.exports = function applyV28SourcePatch(source) {
  const VERSION = '301restore1';

  // V30/V30.1 originais, mas com URL versionada para impedir mistura de cache antigo.
  if (!source.includes('/v30-ui.css?v=')) {
    source = source.replace('"/v28-pwa.css"]', `"/v28-pwa.css?v=${VERSION}", "/v30-ui.css?v=${VERSION}"]`);
  }
  if (!source.includes('/v30-1-light.css?v=')) {
    source = source.replace(`"/v30-ui.css?v=${VERSION}"]`, `"/v30-ui.css?v=${VERSION}", "/v30-1-light.css?v=${VERSION}"]`);
  }
  return source;
};
