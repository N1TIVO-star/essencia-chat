(() => {
  'use strict';

  let deferredInstallPrompt = null;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        if (reg.active?.scriptURL && !reg.active.scriptURL.includes('/sw.js?v=301restore1')) {
          await reg.unregister().catch(() => {});
        }
      }
      const reg = await navigator.serviceWorker.register('/sw.js?v=301restore1', { scope:'/', updateViaCache:'none' });
      reg.update().catch(() => {});
    } catch (err) {
      console.warn('PWA indisponível:', err);
    }
  }

  function buttonMarkup(compact = false) {
    return `<span class="v28-install-icon">⇩</span><span class="v28-install-copy"><strong>Baixar Essência</strong><small>${compact ? 'Instalar aplicativo' : 'Instalar como aplicativo'}</small></span>`;
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

  function refreshButtons() {
    document.querySelectorAll('#v28InstallApp,#v29InstallLogin').forEach(button => {
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
    });
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
    modal.innerHTML = `<div class="v28-install-card"><div class="v28-install-brand"><img src="/essencia-icon.svg?v=301restore1" alt="Essência"><div><h3>Instalar Essência</h3><p>Use o Essência em uma janela própria, como aplicativo.</p></div></div><p>${instructions}</p><p>Depois de instalado, o Essência aparece com ícone próprio no computador ou celular.</p><div class="v28-install-actions"><button class="secondary" data-close>Fechar</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close]').onclick = () => modal.remove();
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
  }

  async function installApp() {
    if (isStandalone()) return;
    if (!deferredInstallPrompt) return showInstructions();
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

  // Sem MutationObserver global: ele foi o principal candidato ao congelamento.
  makeButtons();
  registerServiceWorker();
})();
