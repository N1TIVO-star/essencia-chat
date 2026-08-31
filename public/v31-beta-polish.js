(() => {
  'use strict';

  function stabilizeMeBar() {
    const bar = document.querySelector('.me-bar');
    const avatar = document.querySelector('#meAvatar');
    const dot = document.querySelector('#v21MeStatusDot');
    if (!bar || !avatar || !dot) return;

    bar.classList.add('v31-me-status-bar');

    // Usa apenas o indicador oficial do status atual.
    document.querySelector('#v31ActiveStatusDot')?.classList.add('v31-beta-hidden-status');
    document.querySelector('#v31QuickStatusPicker')?.classList.add('v31-beta-hidden-status');

    dot.classList.remove('v31-hide-old-status');
    dot.classList.add('v31-beta-avatar-status');

    // Move somente quando necessário para evitar re-render e trabalho repetido.
    if (dot.previousElementSibling !== avatar) {
      avatar.insertAdjacentElement('afterend', dot);
    }
  }

  function stabilizeAccountView() {
    const content = document.querySelector('#v17SettingsContent');
    if (!content) return;

    const title = content.querySelector(':scope > h2')?.textContent?.trim() || '';
    const isAccount = title === 'Minha conta';
    content.classList.toggle('v31-beta-account-view', isAccount);

    if (isAccount) {
      content.querySelector('.v17-profile-actions')?.remove();
    }
  }

  function sync() {
    try { stabilizeMeBar(); } catch {}
    try { stabilizeAccountView(); } catch {}
  }

  sync();

  // Sem MutationObserver: ele estava reagindo às próprias mudanças de classe e
  // criando um ciclo contínuo que congelava a interface. Este fallback é leve.
  const timer = setInterval(sync, 800);

  window.addEventListener('beforeunload', () => clearInterval(timer), { once:true });
})();
