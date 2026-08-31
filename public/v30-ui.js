(() => {
  'use strict';

  function refreshHomeButton() {
    const home = document.querySelector('#homeRailBtn');
    if (!home) return;
    home.classList.add('v30-home-e');
    if (!home.querySelector('.v30-home-e-letter')) {
      home.innerHTML = '<span class="v25-home-logo v30-brand-sentinel"></span><span class="v30-home-e-letter">E</span>';
    }
    home.title = 'Essência · Início';
    home.setAttribute('aria-label','Ir para o menu principal');
  }

  function mergeVoiceRows() {
    document.querySelectorAll('#voiceChannels .voice-channel-wrap.v23-channel-host').forEach(wrap => {
      const children = Array.from(wrap.children);
      const channel = children.find(el => el.classList.contains('channel-item'));
      const gear = children.find(el => el.classList.contains('v23-channel-gear'));
      if (!channel || !gear) return;
      let main = children.find(el => el.classList.contains('v30-channel-main'));
      if (!main) {
        main = document.createElement('div');
        main.className = 'v30-channel-main';
        wrap.insertBefore(main, channel);
      }
      if (channel.parentElement !== main) main.appendChild(channel);
      if (gear.parentElement !== main) main.appendChild(gear);
    });
  }

  function refresh() {
    refreshHomeButton();
    mergeVoiceRows();
    document.documentElement.classList.add('v30-ui');
  }

  refresh();
  const observer = new MutationObserver(refresh);
  observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('beforeunload',()=>observer.disconnect(),{once:true});
})();
