(() => {
  'use strict';

  const statusLabel = status => {
    if (status === 'dnd') return 'Não perturbar';
    if (status === 'invisible') return 'Invisível';
    return 'Disponível';
  };

  function stabilizeMeBar() {
    const bar = document.querySelector('.me-bar');
    const avatar = document.querySelector('#meAvatar');
    const meta = bar?.querySelector('.me-meta');
    if (!bar || !avatar || !state.me) return;

    bar.classList.add('v31-me-status-bar');

    // Esconde indicadores antigos/duplicados para nunca aparecerem no meio da barra.
    document.querySelector('#v21MeStatusDot')?.classList.add('v31-beta-hidden-status');
    document.querySelector('#v31ActiveStatusDot')?.classList.add('v31-beta-hidden-status');
    document.querySelector('#v31QuickStatusPicker')?.classList.add('v31-beta-hidden-status');

    let wrap = avatar.parentElement?.classList?.contains('v31-avatar-status-wrap')
      ? avatar.parentElement
      : null;

    if (!wrap) {
      wrap = document.createElement('span');
      wrap.className = 'v31-avatar-status-wrap';
      avatar.parentNode.insertBefore(wrap, avatar);
      wrap.appendChild(avatar);
    }

    let dot = wrap.querySelector('#v31PinnedStatusDot');
    if (!dot) {
      dot = document.createElement('span');
      dot.id = 'v31PinnedStatusDot';
      wrap.appendChild(dot);
    }

    const current = state.me.status || 'online';
    dot.className = `v31-pinned-status-dot ${current}`;
    dot.title = statusLabel(current);

    const strong = meta?.querySelector('strong');
    const small = meta?.querySelector('small');
    if (strong) strong.textContent = state.me.nick || state.me.username || 'Usuário';
    if (small) {
      small.textContent = statusLabel(current);
      small.classList.add('v31-current-status-text');
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
  const timer = setInterval(sync, 900);
  window.addEventListener('beforeunload', () => clearInterval(timer), { once:true });
})();
