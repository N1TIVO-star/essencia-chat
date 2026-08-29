(() => {
  'use strict';

  let deferredInstallPrompt = null;
  let installButtons = [];

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try { await navigator.serviceWorker.register('/sw.js?v=29', { scope:'/' }); } catch {}
  }

  function ensureManifest() {
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    link.href = '/manifest.webmanifest?v=29';

    let theme = document.querySelector('meta[name="theme-color"]');
    if (!theme) {
      theme = document.createElement('meta');
      theme.name = 'theme-color';
      document.head.appendChild(theme);
    }
    theme.content = '#745cff';
  }

  function buttonMarkup(compact = false) {
    return `
      <span class="v28-install-icon">⇩</span>
      <span class="v28-install-copy"><strong>Baixar Essência</strong><small>${compact ? 'Instalar aplicativo' : 'Instalar como aplicativo'}</small></span>`;
  }

  function makeSidebarButton() {
    if (document.querySelector('#v28InstallApp')) return;
    const homeSidebar = document.querySelector('#homeSidebar');
    if (!homeSidebar) return;
    const button = document.createElement('button');
    button.id = 'v28InstallApp';
    button.className = 'v28-install-btn';
    button.innerHTML = buttonMarkup(false);
    button.onclick = installApp;
    const section = homeSidebar.querySelector('.sidebar-section');
    homeSidebar.insertBefore(button, section || null);
  }

  function makeLoginButton() {
    if (document.querySelector('#v29InstallLogin')) return;
    const brandCard = document.querySelector('#authScreen .brand-card');
    if (!brandCard) return;
    const copy = brandCard.querySelector('div:last-child') || brandCard;
    const button = document.createElement('button');
    button.id = 'v29InstallLogin';
    button.type = 'button';
    button.className = 'v28-install-btn v29-login-install';
    button.innerHTML = buttonMarkup(true);
    button.onclick = installApp;
    copy.appendChild(button);
  }

  function collectButtons() {
    installButtons = [...document.querySelectorAll('#v28InstallApp,#v29InstallLogin')];
  }

  function refreshButtons() {
    collectButtons();
    for (const button of installButtons) {
      const strong = button.querySelector('strong');
      const small = button.querySelector('small');
      if (isStandalone()) {
        button.classList.add('installed');
        button.disabled = true;
        if (strong) strong.textContent = 'Essência instalado';
        if (small) small.textContent = 'Você está usando o aplicativo';
      } else {
        button.classList.remove('installed');
        button.disabled = false;
        if (strong) strong.textContent = 'Baixar Essência';
        if (small) small.textContent = deferredInstallPrompt ? 'Instalar agora' : 'Instalar aplicativo';
      }
    }
  }

  function makeButtons() {
    makeSidebarButton();
    makeLoginButton();
    refreshButtons();
  }

  function showInstructions() {
    document.querySelector('#v28InstallModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'v28InstallModal';
    modal.className = 'v28-install-modal';

    const ua = navigator.userAgent || '';
    const isiOS = /iPhone|iPad|iPod/i.test(ua);
    const isFirefox = /Firefox/i.test(ua);
    let instructions = 'No menu do navegador, escolha <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>.';
    if (isiOS) instructions = 'No Safari, toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.';
    else if (isFirefox) instructions = 'Abra o menu e procure <b>Instalar</b> ou <b>Adicionar à tela inicial</b>. Para instalação completa no computador, prefira Chrome ou Edge.';

    modal.innerHTML = `
      <div class="v28-install-card">
        <div class="v28-install-brand"><img src="/essencia-icon.svg?v=29" alt="Essência"><div><h3>Instalar Essência</h3><p>Use o Essência em uma janela própria, como aplicativo.</p></div></div>
        <p>${instructions}</p>
        <p>Depois de instalado, o Essência aparece com ícone próprio no computador ou celular.</p>
        <div class="v28-install-actions"><button class="secondary" data-close>Fechar</button></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close]').onclick = () => modal.remove();
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
  }

  async function installApp() {
    if (isStandalone()) return;
    if (!deferredInstallPrompt) {
      showInstructions();
      return;
    }
    try {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
    } catch {}
    deferredInstallPrompt = null;
    refreshButtons();
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    makeButtons();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    refreshButtons();
    try { toast('Essência instalado com sucesso.'); } catch {}
  });

  ensureManifest();
  registerServiceWorker();
  makeButtons();

  const observer = new MutationObserver(() => makeButtons());
  observer.observe(document.body, { childList:true, subtree:true });
  window.addEventListener('beforeunload', () => observer.disconnect(), { once:true });
})();
