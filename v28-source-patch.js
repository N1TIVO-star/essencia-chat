module.exports = function applyV28SourcePatch(source) {
  // PWA continua ativo pela V26/V28. A V3.0 adiciona apenas uma camada CSS segura.
  // Não carregamos JS extra da V3.0 para evitar interferência na inicialização do site/app.
  if (!source.includes('"/v30-ui.css"')) {
    source = source.replace('"/v28-pwa.css"]', '"/v28-pwa.css", "/v30-ui.css"]');
  }
  return source;
};
