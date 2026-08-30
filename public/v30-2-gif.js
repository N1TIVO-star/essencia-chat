(() => {
  'use strict';

  const RECENT_GIFS_KEY = 'essencia_recent_gifs_v17';

  function esc(value='') {
    return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function picker() { return document.querySelector('#v17GifPicker'); }
  function grid() { return document.querySelector('#v17GifGrid'); }
  function linkInput() { return document.querySelector('#v17GifSearch'); }

  function recentGifs() {
    try {
      const value = JSON.parse(localStorage.getItem(RECENT_GIFS_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function rememberGif(url, name='GIF') {
    if (!url) return;
    const current = recentGifs().filter(item => item?.url !== url);
    current.unshift({ url, name });
    localStorage.setItem(RECENT_GIFS_KEY, JSON.stringify(current.slice(0, 30)));
  }

  function discoverGifs() {
    const found = [...recentGifs()];
    const seen = new Set(found.map(item => item?.url).filter(Boolean));
    document.querySelectorAll('.msg-image').forEach(img => {
      const src = img.getAttribute('src') || '';
      if (!src || !/\.gif(?:$|[?#])/i.test(src) || seen.has(src)) return;
      seen.add(src);
      found.push({ url: src, name: img.alt || 'GIF da conversa' });
    });
    return found.filter(item => item?.url);
  }

  function closePicker() {
    picker()?.classList.add('hidden');
  }

  function positionPicker() {
    const box = picker();
    const button = document.querySelector('#gifBtn');
    if (!box || !button) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(520, window.innerWidth - 20);
    const estimatedHeight = Math.min(590, window.innerHeight * .82);
    const left = Math.max(10, Math.min(rect.right - width, window.innerWidth - width - 10));
    let top = rect.top - estimatedHeight - 10;
    if (top < 10) top = 10;
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
  }

  function renderRecentGifs() {
    const target = grid();
    if (!target) return;
    const gifs = discoverGifs();
    if (!gifs.length) {
      target.innerHTML = `
        <div class="v303-gif-empty">
          <b>Adicione seu primeiro GIF.</b>
          <span>Cole um link direto terminado em <code>.gif</code> ou envie um arquivo do computador/celular.</span>
        </div>`;
      return;
    }

    target.innerHTML = gifs.map((item,index) => `
      <button class="v17-gif-tile v303-gif-tile" data-v303-gif="${index}" type="button" title="${esc(item.name || 'GIF')}">
        <img src="${esc(item.url)}" alt="${esc(item.name || 'GIF')}">
      </button>`).join('');

    target.querySelectorAll('[data-v303-gif]').forEach(button => {
      button.onclick = () => {
        const item = gifs[Number(button.dataset.v303Gif)];
        if (!item?.url) return;
        rememberGif(item.url, item.name || 'GIF');
        sendCurrentMessage('', {
          url: item.url,
          name: item.name || 'GIF',
          type: 'image/gif',
          size: 0
        });
        closePicker();
      };
    });
  }

  function validDirectGifUrl(value) {
    try {
      const parsed = new URL(String(value || '').trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      if (!/\.gif$/i.test(parsed.pathname)) return null;
      return parsed.href;
    } catch {
      return null;
    }
  }

  function sendGifFromLink() {
    const input = linkInput();
    const url = validDirectGifUrl(input?.value);
    if (!url) {
      toast('Cole um link direto de GIF terminado em .gif');
      input?.focus();
      return;
    }

    const name = (() => {
      try {
        const file = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'GIF');
        return file || 'GIF';
      } catch { return 'GIF'; }
    })();

    rememberGif(url, name);
    sendCurrentMessage('', { url, name, type:'image/gif', size:0 });
    if (input) input.value = '';
    closePicker();
  }

  function preparePicker() {
    const box = picker();
    if (!box) return false;

    box.dataset.mode = 'gifs';
    box.querySelector('[data-v17-picker-tab="emoji"]')?.remove();

    const gifsTab = box.querySelector('[data-v17-picker-tab="gifs"]');
    if (gifsTab) {
      gifsTab.classList.add('active');
      gifsTab.textContent = 'GIFs';
    }

    const oldSearch = linkInput();
    if (oldSearch && !oldSearch.dataset.v303Link) {
      const fresh = oldSearch.cloneNode(false);
      fresh.dataset.v303Link = '1';
      fresh.type = 'url';
      fresh.autocomplete = 'off';
      fresh.placeholder = 'Cole o link direto do GIF (.gif)';
      fresh.value = '';
      oldSearch.replaceWith(fresh);
      fresh.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendGifFromLink();
        }
      });
    }

    document.querySelector('#v17GifUpload')?.remove();

    if (!box.querySelector('.v303-gif-actions')) {
      const actions = document.createElement('div');
      actions.className = 'v303-gif-actions';
      actions.innerHTML = `
        <button class="v303-gif-link" type="button">🔗 Adicionar por link</button>
        <button class="v303-gif-device" type="button">＋ Enviar do dispositivo</button>`;
      linkInput()?.insertAdjacentElement('afterend', actions);
      actions.querySelector('.v303-gif-link').onclick = sendGifFromLink;
      actions.querySelector('.v303-gif-device').onclick = () => {
        closePicker();
        document.querySelector('#gifInput')?.click();
      };
    }

    renderRecentGifs();
    return true;
  }

  function openPicker() {
    if (!preparePicker()) return;
    const box = picker();
    box.classList.remove('hidden');
    positionPicker();
    const input = linkInput();
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  function install() {
    if (!preparePicker()) return false;
    const gifBtn = document.querySelector('#gifBtn');
    if (!gifBtn) return false;
    gifBtn.dataset.v303Gif = '1';
    gifBtn.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      openPicker();
    };
    return true;
  }

  const timer = setInterval(() => {
    if (install()) clearInterval(timer);
  }, 250);

  window.addEventListener('resize', () => {
    const box = picker();
    if (box && !box.classList.contains('hidden')) positionPicker();
  });

  window.addEventListener('beforeunload', () => clearInterval(timer), { once:true });
})();
