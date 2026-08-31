(() => {
  'use strict';

  let deferredPrompt = null;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function ensureManifest() {
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    link.href = '/manifest.webmanifest?v=30safe';
  }

  async function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        if (reg.active?.scriptURL && !reg.active.scriptURL.includes('/sw-safe.js')) {
          await reg.unregister().catch(() => {});
        }
      }
      await navigator.serviceWorker.register('/sw-safe.js?v=30safe', { scope:'/', updateViaCache:'none' });
    } catch (err) {
      console.warn('PWA segura indisponível:', err);
    }
  }

  function makeButton(id, compact = false) {
    if (document.getElementById(id)) return document.getElementById(id);
    const btn = document.createElement('button');
    btn.id = id;
    btn.type = 'button';
    btn.className = 'v30-safe-install-btn';
    btn.innerHTML = `<span class="v30-safe-install-icon">⇩</span><span><strong>${isStandalone() ? 'Essência instalado' : 'Baixar Essência'}</strong><small>${isStandalone() ? 'Você está usando o aplicativo' : (compact ? 'Instalar aplicativo' : 'Instalar como aplicativo')}</small></span>`;
    btn.disabled = isStandalone();
    btn.addEventListener('click', installApp);
    return btn;
  }

  function mountButtons() {
    const homeSidebar = document.querySelector('#homeSidebar');
    if (homeSidebar && !document.querySelector('#v30SafeInstallSidebar')) {
      const btn = makeButton('v30SafeInstallSidebar');
      const firstSection = homeSidebar.querySelector('.sidebar-section');
      homeSidebar.insertBefore(btn, firstSection || null);
    }

    const brandCard = document.querySelector('#authScreen .brand-card');
    if (brandCard && !document.querySelector('#v30SafeInstallLogin')) {
      const btn = makeButton('v30SafeInstallLogin', true);
      const copy = brandCard.querySelector('div:last-child') || brandCard;
      copy.appendChild(btn);
    }
  }

  function refreshButtons() {
    document.querySelectorAll('.v30-safe-install-btn').forEach(btn => {
      const strong = btn.querySelector('strong');
      const small = btn.querySelector('small');
      if (isStandalone()) {
        btn.disabled = true;
        if (strong) strong.textContent = 'Essência instalado';
        if (small) small.textContent = 'Você está usando o aplicativo';
      } else {
        btn.disabled = false;
        if (strong) strong.textContent = 'Baixar Essência';
        if (small) small.textContent = deferredPrompt ? 'Instalar agora' : 'Instalar aplicativo';
      }
    });
  }

  function showInstructions() {
    document.querySelector('#v30SafeInstallModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'v30SafeInstallModal';
    modal.className = 'v30-safe-install-modal';
    const isiOS = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    const text = isiOS
      ? 'No Safari, toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.'
      : 'No menu do navegador, escolha <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>.';
    modal.innerHTML = `<div class="v30-safe-install-card"><div class="v30-safe-install-brand"><img src="/essencia-icon.svg?v=30safe" alt="Essência"><div><h3>Instalar Essência</h3><p>Use o Essência em uma janela própria, como aplicativo.</p></div></div><p>${text}</p><div class="v30-safe-install-actions"><button type="button" data-close>Fechar</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close]').onclick = () => modal.remove();
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
  }

  async function installApp() {
    if (isStandalone()) return;
    if (!deferredPrompt) {
      showInstructions();
      return;
    }
    try {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch {}
    deferredPrompt = null;
    refreshButtons();
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    refreshButtons();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    refreshButtons();
  });

  ensureManifest();
  mountButtons();
  refreshButtons();
  registerSW();
})();
