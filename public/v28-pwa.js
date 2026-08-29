(() => {
  'use strict';

  let deferredInstallPrompt = null;
  let installButton = null;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try { await navigator.serviceWorker.register('/sw.js', { scope:'/' }); } catch {}
  }

  function ensureManifest() {
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = '/manifest.webmanifest?v=28';
      document.head.appendChild(link);
    }
    let theme = document.querySelector('meta[name="theme-color"]');
    if (!theme) {
      theme = document.createElement('meta');
      theme.name = 'theme-color';
      document.head.appendChild(theme);
    }
    theme.content = '#745cff';
  }

  function makeButton() {
    if (installButton || document.querySelector('#v28InstallApp')) return;
    const homeSidebar = document.querySelector('#homeSidebar');
    if (!homeSidebar) return;

    installButton = document.createElement('button');
    installButton.id = 'v28InstallApp';
    installButton.className = 'v28-install-btn';
    installButton.innerHTML = `
      <span class="v28-install-icon">⇩</span>
      <span class="v28-install-copy"><strong>Baixar Essência</strong><small>Instalar como aplicativo</small></span>`;
    installButton.onclick = installApp;

    const section = homeSidebar.querySelector('.sidebar-section');
    homeSidebar.insertBefore(installButton, section || null);
    refreshButton();
  }

  function refreshButton() {
    if (!installButton) return;
    if (isStandalone()) {
      installButton.classList.add('installed');
      installButton.disabled = true;
      installButton.querySelector('strong').textContent = 'Essência instalado';
      installButton.querySelector('small').textContent = 'Você está usando o aplicativo';
    } else {
      installButton.classList.remove('installed');
      installButton.disabled = false;
      installButton.querySelector('strong').textContent = 'Baixar Essência';
      installButton.querySelector('small').textContent = deferredInstallPrompt ? 'Instalar agora' : 'Instalar como aplicativo';
    }
  }

  function showInstructions() {
    document.querySelector('#v28InstallModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'v28InstallModal';
    modal.className = 'v28-install-modal';

    const ua = navigator.userAgent || '';
    const isiOS = /iPhone|iPad|iPod/i.test(ua);
    const isFirefox = /Firefox/i.test(ua);
    let instructions = 'No menu do navegador, escolha a opção <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>.';
    if (isiOS) instructions = 'No Safari, toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.';
    else if (isFirefox) instructions = 'No navegador, abra o menu e procure <b>Instalar</b> ou <b>Adicionar à tela inicial</b>. Se não aparecer, use Chrome ou Edge para instalação completa.';

    modal.innerHTML = `
      <div class="v28-install-card">
        <div class="v28-install-brand"><img src="/essencia-icon.svg?v=28" alt="Essência"><div><h3>Instalar Essência</h3><p>Use o Essência como um aplicativo separado do navegador.</p></div></div>
        <p>${instructions}</p>
        <p>Depois de instalado ele abre em uma janela própria, com ícone no computador ou celular.</p>
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
    refreshButton();
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    makeButton();
    refreshButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    refreshButton();
    try { toast('Essência instalado com sucesso.'); } catch {}
  });

  ensureManifest();
  registerServiceWorker();
  makeButton();

  const observer = new MutationObserver(() => makeButton());
  observer.observe(document.body, { childList:true, subtree:true });
  window.addEventListener('beforeunload', () => observer.disconnect(), { once:true });
})();
