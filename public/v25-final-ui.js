(() => {
  'use strict';

  function brandSvg(id, className = '') {
    return `<svg class="${className}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="${id}-g" x1="12" y1="14" x2="88" y2="88" gradientUnits="userSpaceOnUse">
          <stop stop-color="#22c8ff"/><stop offset=".48" stop-color="#6560ff"/><stop offset="1" stop-color="#c54cff"/>
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="43" fill="#080b1c" stroke="url(#${id}-g)" stroke-width="4"/>
      <rect x="47.8" y="22" width="4.4" height="18" rx="2.2" fill="#8d72ff"/>
      <rect x="39" y="27" width="4" height="11" rx="2" fill="#47a9ff"/>
      <rect x="57" y="27" width="4" height="11" rx="2" fill="#b85dff"/>
      <circle cx="29" cy="50" r="9" fill="#27bfff"/>
      <circle cx="50" cy="54" r="10" fill="#8a5cff"/>
      <circle cx="71" cy="50" r="9" fill="#c24cff"/>
      <path d="M12 72c4-13 13-20 25-18 9 2 16 9 20 19-8 5-15 11-20 19-10-4-18-10-25-20z" fill="#2687ff"/>
      <path d="M36 88c2-17 6-26 14-26s12 9 14 26L50 97 36 88z" fill="#6b4cff"/>
      <path d="M88 72c-4-13-13-20-25-18-9 2-16 9-20 19 8 5 15 11 20 19 10-4 18-10 25-20z" fill="#984cff"/>
    </svg>`;
  }

  function installBranding() {
    const sidebarTitle = document.querySelector('#sidebarTitle');
    if (sidebarTitle && !sidebarTitle.dataset.v25Brand) {
      sidebarTitle.dataset.v25Brand = '1';
      sidebarTitle.innerHTML = `<span class="v25-brand-word">${brandSvg('v25-side','v25-brand-inline')}<span class="v25-brand-text">Essência</span></span>`;
    }

    const homeRail = document.querySelector('#homeRailBtn');
    if (homeRail) {
      if (!homeRail.querySelector('.v25-home-logo')) {
        homeRail.innerHTML = brandSvg('v25-home','v25-home-logo');
      }
      homeRail.setAttribute('aria-label','Essência');
      homeRail.title = 'Essência · Início';
    }

    const brandMark = document.querySelector('.brand-mark');
    if (brandMark) {
      if (!brandMark.querySelector('.v25-login-logo')) {
        brandMark.innerHTML = brandSvg('v25-login','v25-login-logo');
      }
      brandMark.style.backgroundImage = 'none';
      brandMark.style.background = 'transparent';
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
