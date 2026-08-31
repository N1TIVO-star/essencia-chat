(() => {
  'use strict';

  function stabilizeMeBar() {
    const bar = document.querySelector('.me-bar');
    const avatar = document.querySelector('#meAvatar');
    const dot = document.querySelector('#v21MeStatusDot');
    if (!bar || !avatar || !dot) return;

    // Usa somente o indicador oficial do status atual.
    document.querySelector('#v31ActiveStatusDot')?.classList.add('v31-beta-hidden-status');
    document.querySelector('#v31QuickStatusPicker')?.classList.add('v31-beta-hidden-status');

    dot.classList.remove('v31-hide-old-status');
    dot.classList.add('v31-beta-avatar-status');

    // Mantém o ponto imediatamente ao lado do avatar, sem duplicatas/recriações.
    if (dot.previousElementSibling !== avatar) avatar.insertAdjacentElement('afterend', dot);
  }

  function cleanAccountActions() {
    const content = document.querySelector('#v17SettingsContent');
    if (!content) return;
    const title = content.querySelector(':scope > h2')?.textContent?.trim();
    if (title !== 'Minha conta') return;
    content.querySelector('.v17-profile-actions')?.remove();
  }

  function sync() {
    stabilizeMeBar();
    cleanAccountActions();
  }

  sync();

  // Observa somente as duas áreas que realmente mudam, sem observer global pesado.
  const bar = document.querySelector('.me-bar');
  const settings = document.querySelector('#v17SettingsContent');

  const barObserver = bar ? new MutationObserver(sync) : null;
  if (barObserver) barObserver.observe(bar, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });

  const settingsObserver = settings ? new MutationObserver(cleanAccountActions) : null;
  if (settingsObserver) settingsObserver.observe(settings, { childList:true, subtree:true });

  // Fallback leve caso algum shell seja reconstruído por uma camada antiga.
  const timer = setInterval(sync, 1500);

  window.addEventListener('beforeunload', () => {
    clearInterval(timer);
    barObserver?.disconnect();
    settingsObserver?.disconnect();
  }, { once:true });
})();
