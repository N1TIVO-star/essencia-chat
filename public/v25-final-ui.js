(() => {
  'use strict';

  function installBranding() {
    const sidebarTitle = document.querySelector('#sidebarTitle');
    if (sidebarTitle && !sidebarTitle.dataset.v25Brand) {
      sidebarTitle.dataset.v25Brand = '1';
      sidebarTitle.innerHTML = '<span class="v25-brand-word"><img src="/essencia-icon.svg" alt=""><span class="v25-brand-text">Essência</span></span>';
    }

    const homeRail = document.querySelector('#homeRailBtn');
    if (homeRail) {
      homeRail.textContent = '';
      homeRail.setAttribute('aria-label','Essência');
      homeRail.title = 'Essência · Início';
    }

    const brandMark = document.querySelector('.brand-mark');
    if (brandMark) {
      brandMark.textContent = '';
      brandMark.setAttribute('aria-label','Essência');
    }

    document.documentElement.classList.add('v25-final');
  }

  function polishDynamicUI() {
    document.querySelectorAll('.server-icon,.rail-add,.channel-item,.dm-item,.member-row,.person-row').forEach(el => {
      el.classList.add('v25-polished');
    });
  }

  installBranding();
  polishDynamicUI();

  const observer = new MutationObserver(() => {
    installBranding();
    polishDynamicUI();
  });
  observer.observe(document.body,{childList:true,subtree:true});

  window.addEventListener('beforeunload',()=>observer.disconnect(),{once:true});
})();
