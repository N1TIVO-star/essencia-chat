(() => {
  'use strict';

  let searchTimer = null;
  let requestSeq = 0;

  function esc(value='') {
    return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function picker() { return document.querySelector('#v17GifPicker'); }
  function grid() { return document.querySelector('#v17GifGrid'); }
  function searchInput() { return document.querySelector('#v17GifSearch'); }

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
    const search = searchInput();
    if (search) search.placeholder = 'Buscar GIFs no Tenor';
    document.querySelector('#v17GifUpload')?.remove();
    return true;
  }

  async function fetchTenor(query='') {
    const seq = ++requestSeq;
    const target = grid();
    if (!target) return;
    target.innerHTML = '<div class="v302-tenor-state">Carregando GIFs…</div>';

    try {
      const url = `/api/tenor/gifs${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`;
      const data = await API(url);
      if (seq !== requestSeq) return;
      const results = Array.isArray(data?.results) ? data.results : [];

      if (!results.length) {
        target.innerHTML = data?.needsKey
          ? '<div class="v302-tenor-state"><b>Tenor ainda não configurado.</b><br>Adicione a variável <code>TENOR_API_KEY</code> na Square Cloud para ativar a biblioteca.</div>'
          : '<div class="v302-tenor-state">Nenhum GIF encontrado.</div>';
        return;
      }

      target.innerHTML = results.map((item,index) => `
        <button class="v17-gif-tile v302-tenor-tile" data-v302-gif="${index}" type="button" title="${esc(item.title || 'GIF Tenor')}">
          <img src="${esc(item.preview || item.url)}" alt="${esc(item.title || 'GIF')}">
        </button>`).join('') + '<div class="v302-tenor-brand">GIFs por Tenor</div>';

      target.querySelectorAll('[data-v302-gif]').forEach(button => {
        button.onclick = () => {
          const item = results[Number(button.dataset.v302Gif)];
          if (!item?.url) return;
          sendCurrentMessage('', {
            url: item.url,
            name: item.title || 'GIF Tenor',
            type: 'image/gif',
            size: 0
          });
          picker()?.classList.add('hidden');
        };
      });
    } catch (err) {
      if (seq !== requestSeq) return;
      target.innerHTML = `<div class="v302-tenor-state">${esc(err?.message || 'Não foi possível carregar os GIFs do Tenor.')}</div>`;
    }
  }

  function install() {
    if (!preparePicker()) return false;

    const search = searchInput();
    if (search && !search.dataset.v302Tenor) {
      search.dataset.v302Tenor = '1';
      search.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => fetchTenor(search.value), 280);
      });
    }

    const gifBtn = document.querySelector('#gifBtn');
    if (gifBtn && !gifBtn.dataset.v302Tenor) {
      gifBtn.dataset.v302Tenor = '1';
      gifBtn.addEventListener('click', () => {
        setTimeout(() => {
          preparePicker();
          const input = searchInput();
          if (input) input.value = '';
          fetchTenor('');
        }, 0);
      }, true);
    }

    return true;
  }

  const timer = setInterval(() => {
    if (install()) {
      clearInterval(timer);
      const input = searchInput();
      if (input) input.placeholder = 'Buscar GIFs no Tenor';
    }
  }, 250);

  window.addEventListener('beforeunload', () => {
    clearInterval(timer);
    clearTimeout(searchTimer);
  }, { once:true });
})();
