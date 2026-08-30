(() => {
  'use strict';

  let deferredInstallPrompt = null;
  let installButtons = [];

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js?v=3012', { scope:'/', updateViaCache:'none' });
      reg.update().catch(() => {});
    } catch {}
  }

  function ensureManifest() {
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    if (link.getAttribute('href') !== '/manifest.webmanifest?v=29') {
      link.href = '/manifest.webmanifest?v=29';
    }

    let theme = document.querySelector('meta[name="theme-color"]');
    if (!theme) {
      theme = document.createElement('meta');
      theme.name = 'theme-color';
      document.head.appendChild(theme);
    }
    if (theme.content !== '#745cff') theme.content = '#745cff';
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

  function setTextIfChanged(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }

  function refreshButtons() {
    collectButtons();
    const standalone = isStandalone();
    for (const button of installButtons) {
      const strong = button.querySelector('strong');
      const small = button.querySelector('small');
      if (standalone) {
        button.classList.add('installed');
        button.disabled = true;
        setTextIfChanged(strong, 'Essência instalado');
        setTextIfChanged(small, 'Você está usando o aplicativo');
      } else {
        button.classList.remove('installed');
        button.disabled = false;
        setTextIfChanged(strong, 'Baixar Essência');
        setTextIfChanged(small, deferredInstallPrompt ? 'Instalar agora' : 'Instalar aplicativo');
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

  // IMPORTANTE: sem MutationObserver global aqui.
  // A versão anterior reescrevia textos dentro do próprio observer, gerando
  // novas mutações continuamente e podendo deixar a página em 100% de loop.
  ensureManifest();
  registerServiceWorker();
  makeButtons();
})();
