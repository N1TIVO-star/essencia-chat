(() => {
  'use strict';

  let panel = null;
  let box = null;
  let input = null;
  let panelInput = null;
  let resultsBox = null;
  let currentType = 'all';
  let currentOnly = false;
  let debounce = null;
  let lastQuery = '';
  let searchGeneration = 0;

  function esc(value) {
    const d = document.createElement('div');
    d.textContent = String(value ?? '');
    return d.innerHTML;
  }

  function buildUI() {
    if (document.querySelector('#v20SearchBox')) {
      box = document.querySelector('#v20SearchBox');
      panel = document.querySelector('#v20SearchPanel');
      input = document.querySelector('#v20SearchInput');
      panelInput = document.querySelector('#v20SearchPanelInput');
      resultsBox = document.querySelector('#v20SearchResults');
      return;
    }

    const actions = document.querySelector('.top-actions');
    if (!actions) return;

    box = document.createElement('div');
    box.id = 'v20SearchBox';
    box.className = 'v20-search-box hidden';
    box.innerHTML = `
      <span>⌕</span>
      <input id="v20SearchInput" type="search" placeholder="Pesquisar no servidor">
      <button id="v20SearchClear" class="v20-search-clear hidden" type="button">×</button>`;
    actions.insertBefore(box, actions.firstChild);

    panel = document.createElement('aside');
    panel.id = 'v20SearchPanel';
    panel.className = 'v20-search-panel hidden';
    panel.innerHTML = `
      <div class="v20-search-head">
        <div><strong>Pesquisar no servidor</strong><small id="v20SearchSubtitle">Mensagens, imagens e arquivos</small></div>
        <button id="v20SearchClose" class="v20-search-close" type="button">×</button>
      </div>
      <div class="v20-search-controls">
        <input id="v20SearchPanelInput" class="v20-search-panel-input" type="search" placeholder="Digite texto, nome do arquivo ou usuário">
        <div class="v20-search-filters">
          <button class="v20-search-chip active" data-type="all">Tudo</button>
          <button class="v20-search-chip" data-type="messages">Mensagens</button>
          <button class="v20-search-chip" data-type="images">Imagens</button>
          <button class="v20-search-chip" data-type="files">Arquivos</button>
        </div>
        <label class="v20-search-scope"><input id="v20CurrentChannelOnly" type="checkbox"> Somente este canal</label>
      </div>
      <div class="v20-search-meta"><span id="v20SearchCount">Digite para pesquisar</span><span id="v20SearchScopeLabel"></span></div>
      <div id="v20SearchResults" class="v20-search-results"><div class="v20-search-empty">Pesquise mensagens, imagens e arquivos de todos os canais de texto do servidor.</div></div>`;
    document.body.appendChild(panel);

    input = document.querySelector('#v20SearchInput');
    panelInput = document.querySelector('#v20SearchPanelInput');
    resultsBox = document.querySelector('#v20SearchResults');

    box.addEventListener('click', e => {
      if (window.innerWidth <= 760 && e.target !== input) openPanel();
    });
    input.addEventListener('focus', openPanel);
    input.addEventListener('input', () => syncQuery(input.value, 'top'));
    panelInput.addEventListener('input', () => syncQuery(panelInput.value, 'panel'));

    document.querySelector('#v20SearchClear').onclick = e => {
      e.stopPropagation();
      input.value = '';
      panelInput.value = '';
      updateClear();
      lastQuery = '';
      searchGeneration++;
      renderIdle();
      input.focus();
    };
    document.querySelector('#v20SearchClose').onclick = closePanel;

    panel.querySelectorAll('[data-type]').forEach(btn => {
      btn.onclick = () => {
        currentType = btn.dataset.type;
        panel.querySelectorAll('[data-type]').forEach(item => item.classList.toggle('active', item === btn));
        if (lastQuery.trim()) scheduleSearch();
      };
    });

    document.querySelector('#v20CurrentChannelOnly').onchange = e => {
      currentOnly = e.target.checked;
      updateScopeLabel();
      if (lastQuery.trim()) scheduleSearch();
    };

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && panel && !panel.classList.contains('hidden')) closePanel();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && state.currentServer) {
        e.preventDefault();
        openPanel();
        setTimeout(() => panelInput?.focus(), 0);
      }
    });
  }

  function updateClear() {
    document.querySelector('#v20SearchClear')?.classList.toggle('hidden', !String(input?.value || '').length);
  }

  function syncQuery(value, source) {
    lastQuery = String(value || '');
    if (source !== 'top' && input) input.value = lastQuery;
    if (source !== 'panel' && panelInput) panelInput.value = lastQuery;
    updateClear();
    scheduleSearch();
  }

  function scheduleSearch() {
    clearTimeout(debounce);
    debounce = setTimeout(runSearch, 220);
  }

  function renderIdle() {
    if (!resultsBox) return;
    document.querySelector('#v20SearchCount').textContent = 'Digite para pesquisar';
    resultsBox.innerHTML = '<div class="v20-search-empty">Pesquise mensagens, imagens e arquivos de todos os canais de texto do servidor.</div>';
  }

  function openPanel() {
    if (!state.currentServer) return;
    buildUI();
    panel?.classList.remove('hidden');
    document.querySelector('#v20SearchSubtitle').textContent = state.currentServer?.name || 'Servidor';
    updateScopeLabel();
    if (window.innerWidth <= 760) setTimeout(() => panelInput?.focus(), 20);
  }

  function closePanel() {
    panel?.classList.add('hidden');
  }

  function updateScopeLabel() {
    const label = document.querySelector('#v20SearchScopeLabel');
    if (!label) return;
    label.textContent = currentOnly && state.currentChannel?.type === 'text' ? `#${state.currentChannel.name}` : (state.currentServer?.name || '');
  }

  function messageMatches(message, q) {
    const user = message.user || {};
    const attachment = message.attachment || {};
    const haystack = [message.text, user.nick, user.username, attachment.name].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q.toLowerCase());
  }

  function typeMatches(message) {
    const type = String(message.attachment?.type || '');
    if (currentType === 'messages') return !!String(message.text || '').trim();
    if (currentType === 'images') return type.startsWith('image/');
    if (currentType === 'files') return !!message.attachment && !type.startsWith('image/');
    return true;
  }

  async function runSearch() {
    if (!state.currentServer || !resultsBox) return;
    const q = lastQuery.trim();
    if (!q) { renderIdle(); return; }

    const generation = ++searchGeneration;
    const server = state.currentServer;
    resultsBox.innerHTML = '<div class="v20-search-loading">Pesquisando…</div>';
    document.querySelector('#v20SearchCount').textContent = 'Pesquisando';

    try {
      let channels = (server.channels || []).filter(channel => channel.type === 'text');
      if (currentOnly && state.currentChannel?.type === 'text') channels = channels.filter(channel => channel.id === state.currentChannel.id);

      const batches = await Promise.all(channels.map(async channel => {
        try {
          const data = await API(`/api/servers/${server.id}/channels/${channel.id}/messages`);
          return (data.messages || []).map(message => ({ ...message, channelId:channel.id, channelName:channel.name }));
        } catch {
          return [];
        }
      }));

      if (generation !== searchGeneration || state.currentServer?.id !== server.id) return;

      const results = batches.flat()
        .filter(message => messageMatches(message, q) && typeMatches(message))
        .sort((a,b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
        .slice(0,100);

      renderResults(results, results.length);
    } catch (err) {
      if (generation !== searchGeneration) return;
      resultsBox.innerHTML = `<div class="v20-search-error">${esc(err.message || 'Não foi possível pesquisar.')}</div>`;
      document.querySelector('#v20SearchCount').textContent = 'Erro na pesquisa';
    }
  }

  function renderResults(results, total) {
    document.querySelector('#v20SearchCount').textContent = `${total} ${total === 1 ? 'resultado' : 'resultados'}`;
    if (!results.length) {
      resultsBox.innerHTML = '<div class="v20-search-empty">Nenhum resultado encontrado com esses filtros.</div>';
      return;
    }

    resultsBox.innerHTML = results.map((result, index) => {
      const user = result.user || {};
      const type = String(result.attachment?.type || '');
      const isImage = type.startsWith('image/');
      const isFile = !!result.attachment && !isImage;
      return `
        <button class="v20-search-result" data-result-index="${index}" type="button">
          <div class="v20-result-head">
            <img src="${avatarUrl(user)}" alt="">
            <div class="v20-result-head-main"><strong>${esc(user.nick || user.username || 'Usuário')}</strong><small>#${esc(result.channelName || 'canal')} · ${esc(state.currentServer?.name || '')}</small></div>
            <span class="v20-result-time">${new Date(result.createdAt).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</span>
          </div>
          ${result.text ? `<div class="v20-result-text">${esc(result.text)}</div>` : ''}
          ${isImage ? `<img class="v20-result-image" src="${esc(result.attachment.url)}" alt="${esc(result.attachment.name || 'imagem')}">` : ''}
          ${isFile ? `<div class="v20-result-file"><span>📎</span><b>${esc(result.attachment.name || 'arquivo')}</b></div>` : ''}
        </button>`;
    }).join('');

    resultsBox.querySelectorAll('[data-result-index]').forEach((button, index) => {
      button.onclick = () => jumpToResult(results[index]);
    });
  }

  async function jumpToResult(result) {
    if (!result?.channelId || !state.currentServer) return;
    try {
      await openChannel(result.channelId);
      closePanel();
      const row = document.querySelector(`#messages .msg[data-msg="${cssEscape(result.id)}"]`);
      if (row) {
        row.scrollIntoView({ behavior:'smooth', block:'center' });
        row.classList.remove('v20-search-hit');
        requestAnimationFrame(() => row.classList.add('v20-search-hit'));
      } else {
        toast('Resultado encontrado, mas a mensagem não está mais disponível.');
      }
    } catch (err) {
      toast(err.message || 'Não foi possível abrir o resultado.');
    }
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/["\\]/g,'\\$&');
  }

  function updateVisibility() {
    buildUI();
    const visible = !!state.currentServer;
    box?.classList.toggle('hidden', !visible);
    if (!visible) closePanel();
    if (visible) {
      document.querySelector('#v20SearchSubtitle').textContent = state.currentServer?.name || 'Servidor';
      updateScopeLabel();
    }
  }

  try {
    const original = openServer;
    openServer = async function(...args) {
      const result = await original.apply(this,args);
      updateVisibility();
      return result;
    };
  } catch {}

  try {
    const original = showHome;
    showHome = function(...args) {
      const result = original.apply(this,args);
      updateVisibility();
      return result;
    };
  } catch {}

  try {
    const original = openDM;
    openDM = async function(...args) {
      const result = await original.apply(this,args);
      updateVisibility();
      return result;
    };
  } catch {}

  try {
    const original = openChannel;
    openChannel = async function(...args) {
      const result = await original.apply(this,args);
      updateScopeLabel();
      return result;
    };
  } catch {}

  const timer = setInterval(() => updateVisibility(),900);
  window.addEventListener('beforeunload',() => { clearInterval(timer); clearTimeout(debounce); },{once:true});
  buildUI();
  updateVisibility();
})();
