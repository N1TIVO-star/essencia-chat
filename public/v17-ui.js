(() => {
  'use strict';

  const profileCache = new Map();
  const THEME_KEY = 'essencia_theme_v17';
  const RECENT_GIFS_KEY = 'essencia_recent_gifs_v17';
  const EMOJIS = [
    '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚',
    '😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣',
    '😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗',
    '🤔','🫡','🤭','🫢','🤫','🤥','😶','🫠','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤',
    '😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👻','💀','☠️','👽','🤖','🎃',
    '😺','😸','😹','😻','😼','😽','🙀','😿','😾','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥',
    '💯','💢','💥','💫','💦','💨','🔥','✨','⭐','🌟','🎉','🎊','✅','❌','⚠️','👍','👎','👌','🤌','🤏',
    '✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤝','👏','🙌','🫶',
    '🙏','💪','🫵','👀','👁️','🧠','🫀','🫡','🎮','🎧','🎵','🎶','⚽','🏆','🚀','💎','🔒','🔔','📌','💬'
  ];

  function applyTheme(theme) {
    const normalized = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.essenciaTheme = normalized;
    localStorage.setItem(THEME_KEY, normalized);
    document.querySelectorAll('.v17-theme-card').forEach(card => {
      card.classList.toggle('active', card.dataset.theme === normalized);
    });
  }

  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');

  function cacheUser(user) {
    if (user?.id) profileCache.set(user.id, user);
    return user;
  }

  function refreshProfileCache() {
    cacheUser(state.me);
    for (const friend of state.friends?.friends || []) cacheUser(friend);
    for (const member of state.serverMembers || []) cacheUser(member);
    for (const user of state.peerUsers?.values?.() || []) cacheUser(user);
    for (const member of state.activeCallMembers || []) cacheUser(member?.user);
  }

  function findUser(userId) {
    refreshProfileCache();
    if (!userId) return null;
    if (state.me?.id === userId) return state.me;
    return profileCache.get(userId) || null;
  }

  function isUserOnline(userId) {
    if (!userId) return false;
    if (userId === state.me?.id) return true;
    if (document.querySelector(`[data-user-id="${cssEscape(userId)}"].presence-online-row`)) return true;
    if (document.querySelector(`.member-row[data-member-id="${cssEscape(userId)}"].member-presence-online`)) return true;
    for (const user of state.peerUsers?.values?.() || []) if (user?.id === userId) return true;
    return false;
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function avatar(user) {
    return avatarUrl(user);
  }

  function buildShells() {
    if (!document.querySelector('#v17SettingsBackdrop')) {
      const settings = document.createElement('div');
      settings.id = 'v17SettingsBackdrop';
      settings.className = 'v17-backdrop hidden';
      settings.innerHTML = `
        <section class="v17-settings" role="dialog" aria-modal="true" aria-label="Configurações do usuário">
          <aside class="v17-settings-nav">
            <h3>Configurações</h3>
            <button class="v17-settings-tab active" data-tab="account">👤 Minha conta</button>
            <button class="v17-settings-tab" data-tab="profile">🖼️ Perfil</button>
            <button class="v17-settings-tab" data-tab="appearance">🎨 Aparência</button>
            <button class="v17-settings-tab danger" data-tab="logout">↪ Sair</button>
          </aside>
          <main class="v17-settings-main">
            <button class="v17-settings-close" type="button" aria-label="Fechar">×</button>
            <div id="v17SettingsContent"></div>
          </main>
        </section>`;
      document.body.appendChild(settings);
    }

    if (!document.querySelector('#v17ProfilePopover')) {
      const pop = document.createElement('div');
      pop.id = 'v17ProfilePopover';
      pop.className = 'v17-profile-popover hidden';
      document.body.appendChild(pop);
    }

    if (!document.querySelector('#v17GifPicker')) {
      const picker = document.createElement('div');
      picker.id = 'v17GifPicker';
      picker.className = 'v17-picker hidden';
      picker.innerHTML = `
        <div class="v17-picker-head">
          <div class="v17-picker-tabs">
            <button class="v17-picker-tab active" data-v17-picker-tab="gifs">GIFs</button>
            <button class="v17-picker-tab" data-v17-picker-tab="emoji">Emoji</button>
          </div>
          <button class="v17-picker-close" type="button">×</button>
        </div>
        <input id="v17GifSearch" class="v17-picker-search" placeholder="Buscar GIF já usado nesta conversa">
        <div id="v17GifGrid" class="v17-gif-grid"></div>
        <button id="v17GifUpload" class="v17-gif-upload" type="button">＋ Enviar GIF do dispositivo</button>`;
      document.body.appendChild(picker);
    }

    if (!document.querySelector('#v17ImageViewer')) {
      const viewer = document.createElement('div');
      viewer.id = 'v17ImageViewer';
      viewer.className = 'v17-image-viewer hidden';
      viewer.innerHTML = `
        <button class="v17-viewer-close" type="button" aria-label="Fechar imagem">×</button>
        <img id="v17ViewerImage" alt="Imagem ampliada">
        <a id="v17ViewerOpen" class="v17-viewer-open" target="_blank" rel="noopener">Abrir arquivo original</a>`;
      document.body.appendChild(viewer);
    }
  }

  buildShells();

  function renderAccountSettings() {
    const me = state.me || {};
    const box = document.querySelector('#v17SettingsContent');
    box.innerHTML = `
      <h2>Minha conta</h2>
      <p>Controle suas informações e personalize a forma como o Essência aparece para você.</p>
      <div class="v17-profile-editor">
        <div class="v17-profile-banner" style="${me.banner ? `background-image:url('${escapeAttr(me.banner)}')` : ''}"></div>
        <div class="v17-profile-editor-body">
          <img class="v17-profile-editor-avatar" src="${avatar(me)}" alt="Avatar">
          <h3 style="margin:0 0 3px">${escapeHtml(me.nick || me.username || 'Usuário')}</h3>
          <div style="color:var(--v17-muted);font-size:12px">@${escapeHtml(me.username || '')}</div>
          <p class="v17-note" style="margin-top:14px">${escapeHtml(me.bio || 'Adicione uma bio para deixar seu perfil mais completo.')}</p>
          <div class="v17-profile-actions">
            <button class="v17-save-btn" data-open-profile-settings>Editar perfil</button>
            <button class="v17-ghost-btn" data-open-appearance>Aparência</button>
          </div>
        </div>
      </div>`;
    box.querySelector('[data-open-profile-settings]').onclick = () => selectSettingsTab('profile');
    box.querySelector('[data-open-appearance]').onclick = () => selectSettingsTab('appearance');
  }

  function renderAppearanceSettings() {
    const theme = document.documentElement.dataset.essenciaTheme || 'dark';
    const box = document.querySelector('#v17SettingsContent');
    box.innerHTML = `
      <h2>Aparência</h2>
      <p>Escolha o visual do Essência. A preferência fica salva neste dispositivo.</p>
      <section class="v17-setting-section">
        <label>TEMA</label>
        <div class="v17-theme-grid">
          <button class="v17-theme-card ${theme === 'dark' ? 'active' : ''}" data-theme="dark">
            <span class="v17-theme-preview dark"></span>
            <strong>Dark Preto</strong>
            <small>Interface escura, contraste alto.</small>
          </button>
          <button class="v17-theme-card ${theme === 'light' ? 'active' : ''}" data-theme="light">
            <span class="v17-theme-preview light"></span>
            <strong>Light Branco</strong>
            <small>Interface clara e limpa.</small>
          </button>
        </div>
      </section>`;
    box.querySelectorAll('.v17-theme-card').forEach(card => {
      card.onclick = () => applyTheme(card.dataset.theme);
    });
  }

  function renderProfileSettings() {
    const me = state.me || {};
    const box = document.querySelector('#v17SettingsContent');
    box.innerHTML = `
      <h2>Editar perfil</h2>
      <p>Avatar GIF, foto, banner e bio aparecem no seu cartão de perfil.</p>
      <div class="v17-profile-editor">
        <div id="v17ProfileBannerPreview" class="v17-profile-banner" style="${me.banner ? `background-image:url('${escapeAttr(me.banner)}')` : ''}"></div>
        <div class="v17-profile-editor-body">
          <img id="v17ProfileAvatarPreview" class="v17-profile-editor-avatar" src="${avatar(me)}" alt="Avatar">
          <div class="v17-profile-fields">
            <div class="v17-setting-section">
              <label>NOME EXIBIDO</label>
              <input id="v17NickInput" class="v17-input" maxlength="28" value="${escapeAttr(me.nick || '')}">
            </div>
            <div class="v17-setting-section">
              <label>BIO</label>
              <textarea id="v17BioInput" class="v17-textarea" maxlength="190" placeholder="Conte algo sobre você">${escapeHtml(me.bio || '')}</textarea>
            </div>
            <div class="v17-setting-section">
              <label>AVATAR / GIF</label>
              <div class="v17-file-row">
                <button id="v17ChooseAvatar" class="v17-file-btn" type="button">Escolher foto ou GIF</button>
                <input id="v17AvatarFile" type="file" accept="image/*,.gif" hidden>
              </div>
              <div class="v17-note">GIFs animados são aceitos normalmente, além de PNG, JPG e WEBP.</div>
            </div>
            <div class="v17-setting-section">
              <label>BANNER DO PERFIL</label>
              <div class="v17-file-row">
                <button id="v17ChooseBanner" class="v17-file-btn" type="button">Escolher banner</button>
                <input id="v17BannerFile" type="file" accept="image/*,.gif" hidden>
              </div>
            </div>
          </div>
          <div class="v17-profile-actions">
            <button id="v17SaveProfile" class="v17-save-btn" type="button">Salvar alterações</button>
          </div>
        </div>
      </div>`;

    const avatarInput = box.querySelector('#v17AvatarFile');
    const bannerInput = box.querySelector('#v17BannerFile');
    box.querySelector('#v17ChooseAvatar').onclick = () => avatarInput.click();
    box.querySelector('#v17ChooseBanner').onclick = () => bannerInput.click();

    avatarInput.onchange = () => {
      const file = avatarInput.files?.[0];
      if (file) box.querySelector('#v17ProfileAvatarPreview').src = URL.createObjectURL(file);
    };
    bannerInput.onchange = () => {
      const file = bannerInput.files?.[0];
      if (file) box.querySelector('#v17ProfileBannerPreview').style.backgroundImage = `url('${URL.createObjectURL(file)}')`;
    };

    box.querySelector('#v17SaveProfile').onclick = saveV17Profile;
  }

  async function saveV17Profile() {
    const button = document.querySelector('#v17SaveProfile');
    if (!button) return;
    const form = new FormData();
    form.append('nick', document.querySelector('#v17NickInput')?.value || '');
    form.append('bio', document.querySelector('#v17BioInput')?.value || '');
    const avatarFile = document.querySelector('#v17AvatarFile')?.files?.[0];
    const bannerFile = document.querySelector('#v17BannerFile')?.files?.[0];
    if (avatarFile) form.append('avatar', avatarFile);
    if (bannerFile) form.append('banner', bannerFile);

    button.disabled = true;
    button.textContent = 'Salvando…';
    try {
      const data = await API('/api/profile', { method:'POST', body:form });
      state.me = data.user;
      cacheUser(state.me);
      updateMeUI();
      try { await loadFriends(); } catch {}
      try { if (state.currentServer) await loadMembers(); } catch {}
      toast('Perfil atualizado.');
      renderProfileSettings();
    } catch (err) {
      toast(err.message || 'Não foi possível salvar o perfil.');
      button.disabled = false;
      button.textContent = 'Salvar alterações';
    }
  }

  function selectSettingsTab(tab) {
    const backdrop = document.querySelector('#v17SettingsBackdrop');
    if (!backdrop) return;
    backdrop.querySelectorAll('.v17-settings-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    if (tab === 'appearance') renderAppearanceSettings();
    else if (tab === 'profile') renderProfileSettings();
    else if (tab === 'logout') logoutV17();
    else renderAccountSettings();
  }

  function openSettings(tab = 'account') {
    buildShells();
    document.querySelector('#v17SettingsBackdrop')?.classList.remove('hidden');
    selectSettingsTab(tab);
  }

  function closeSettings() {
    document.querySelector('#v17SettingsBackdrop')?.classList.add('hidden');
  }

  async function logoutV17() {
    if (!confirm('Sair da sua conta do Essência?')) {
      selectSettingsTab('account');
      return;
    }
    try { await API('/api/logout', { method:'POST' }); } catch {}
    try { state.socket?.disconnect(); } catch {}
    state.token = '';
    localStorage.removeItem('essencia_token');
    location.reload();
  }

  const settingsBackdrop = document.querySelector('#v17SettingsBackdrop');
  settingsBackdrop?.querySelectorAll('.v17-settings-tab').forEach(btn => {
    btn.onclick = () => selectSettingsTab(btn.dataset.tab);
  });
  settingsBackdrop?.querySelector('.v17-settings-close')?.addEventListener('click', closeSettings);
  settingsBackdrop?.addEventListener('click', e => {
    if (e.target === settingsBackdrop) closeSettings();
  });

  function installSettingsButtons() {
    const profileBtn = document.querySelector('#profileBtn');
    const openProfileBtn = document.querySelector('#openProfileBtn');
    if (profileBtn) {
      profileBtn.title = 'Configurações do usuário';
      profileBtn.onclick = e => { e.preventDefault(); openSettings('account'); };
    }
    if (openProfileBtn) {
      openProfileBtn.title = 'Configurações do usuário';
      openProfileBtn.onclick = e => { e.preventDefault(); openSettings('account'); };
    }
  }

  installSettingsButtons();

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g,'&#96;');
  }

  function openProfileCard(user, anchor) {
    if (!user) return;
    cacheUser(user);
    const pop = document.querySelector('#v17ProfilePopover');
    const online = isUserOnline(user.id);
    const isMe = user.id === state.me?.id;
    const isFriend = (state.friends?.friends || []).some(friend => friend.id === user.id);
    pop.innerHTML = `
      <div class="v17-pop-banner" style="${user.banner ? `background-image:url('${escapeAttr(user.banner)}')` : ''}"></div>
      <div class="v17-pop-body">
        <img class="v17-pop-avatar" src="${avatar(user)}" alt="Avatar de ${escapeAttr(user.nick || user.username || 'usuário')}">
        <span class="v17-pop-presence ${online ? '' : 'offline'}" title="${online ? 'Online' : 'Offline'}"></span>
        <h3 class="v17-pop-name">${escapeHtml(user.nick || user.username || 'Usuário')}</h3>
        <div class="v17-pop-username">@${escapeHtml(user.username || '')} · ${online ? 'Online' : 'Offline'}</div>
        <div class="v17-pop-bio">${escapeHtml(user.bio || 'Sem bio definida.')}</div>
        <div class="v17-pop-actions">
          ${isMe ? '<button data-v17-edit-profile>Editar perfil</button>' : ''}
          ${!isMe && isFriend ? '<button data-v17-message-user>Mensagem</button>' : ''}
        </div>
      </div>`;

    pop.classList.remove('hidden');
    const rect = anchor?.getBoundingClientRect?.();
    const width = 330;
    let left = rect ? rect.right + 10 : Math.max(12,(window.innerWidth - width)/2);
    let top = rect ? rect.top : 80;
    if (left + width > window.innerWidth - 10) left = Math.max(10,(rect?.left || window.innerWidth) - width - 10);
    top = Math.max(10,Math.min(top,window.innerHeight - 470));
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;

    pop.querySelector('[data-v17-edit-profile]')?.addEventListener('click', () => {
      pop.classList.add('hidden');
      openSettings('profile');
    });
    pop.querySelector('[data-v17-message-user]')?.addEventListener('click', () => {
      pop.classList.add('hidden');
      const friend = (state.friends?.friends || []).find(item => item.id === user.id);
      if (friend) openDM(friend);
    });
  }

  document.addEventListener('pointerdown', e => {
    const pop = document.querySelector('#v17ProfilePopover');
    if (!pop || pop.classList.contains('hidden')) return;
    if (!pop.contains(e.target) && !e.target.closest('[data-v17-profile-target]')) pop.classList.add('hidden');
  });

  function decorateFriendRows() {
    const friends = state.friends?.friends || [];
    const homeRows = [...document.querySelectorAll('#homeContent .person-row')].filter(row => row.querySelector('[data-message]'));
    friends.forEach((friend,index) => {
      cacheUser(friend);
      const row = homeRows[index];
      if (!row) return;
      row.dataset.userId = friend.id;
      row.querySelector('.avatar')?.setAttribute('data-v17-profile-target', friend.id);
    });
    const dmRows = [...document.querySelectorAll('#dmFriends .dm-item')];
    friends.forEach((friend,index) => {
      const row = dmRows[index];
      if (!row) return;
      row.dataset.userId = friend.id;
      row.querySelector('.avatar')?.setAttribute('data-v17-profile-target', friend.id);
    });
  }

  function decorateMemberRows() {
    for (const member of state.serverMembers || []) {
      cacheUser(member);
      const row = document.querySelector(`.member-row[data-member-id="${cssEscape(member.id)}"]`);
      if (!row) continue;
      row.dataset.userId = member.id;
      row.querySelector('.avatar')?.setAttribute('data-v17-profile-target', member.id);
    }
  }

  try {
    const original = renderHomeContent;
    renderHomeContent = function(...args) {
      const result = original.apply(this,args);
      queueMicrotask(decorateFriendRows);
      return result;
    };
  } catch {}

  try {
    const original = renderDmFriends;
    renderDmFriends = function(...args) {
      const result = original.apply(this,args);
      queueMicrotask(decorateFriendRows);
      return result;
    };
  } catch {}

  try {
    const original = renderMembersList;
    renderMembersList = function(...args) {
      const result = original.apply(this,args);
      queueMicrotask(decorateMemberRows);
      return result;
    };
  } catch {}

  try {
    const original = appendMessage;
    appendMessage = function(message,...args) {
      cacheUser(message?.user);
      const result = original.call(this,message,...args);
      queueMicrotask(() => {
        const row = document.querySelector(`#messages .msg[data-msg="${cssEscape(message?.id || '')}"]`);
        if (!row) return;
        if (message?.user?.id) {
          row.dataset.userId = message.user.id;
          row.querySelector('.avatar')?.setAttribute('data-v17-profile-target', message.user.id);
        }
        const text = row.querySelector('.msg-text');
        if (text && isEmojiOnly(message?.text || '')) text.classList.add('v17-emoji-only');
      });
      return result;
    };
  } catch {}

  document.addEventListener('click', e => {
    const target = e.target.closest('[data-v17-profile-target]');
    if (!target) return;
    const user = findUser(target.getAttribute('data-v17-profile-target'));
    if (!user) return;
    e.preventDefault();
    e.stopPropagation();
    openProfileCard(user,target);
  });

  function isEmojiOnly(text) {
    const value = String(text || '').trim();
    if (!value || value.length > 28) return false;
    try {
      return /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji_Modifier}|[\u200d\ufe0f\s])+$/u.test(value);
    } catch {
      return false;
    }
  }

  function upgradeEmojiPopover() {
    const popover = document.querySelector('#emojiPopover');
    if (!popover) return;
    popover.innerHTML = EMOJIS.map(emoji => `<button type="button">${emoji}</button>`).join('');
    popover.onclick = e => {
      const button = e.target.closest('button');
      if (!button) return;
      e.stopPropagation();
      const input = document.querySelector('#messageInput');
      if (!input) return;
      input.value += button.textContent;
      input.focus();
    };
  }

  upgradeEmojiPopover();

  function recentGifs() {
    try {
      const value = JSON.parse(localStorage.getItem(RECENT_GIFS_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function rememberGif(url,name='GIF') {
    if (!url?.startsWith('/uploads/')) return;
    const current = recentGifs().filter(item => item.url !== url);
    current.unshift({ url,name });
    localStorage.setItem(RECENT_GIFS_KEY,JSON.stringify(current.slice(0,18)));
  }

  function discoverGifs() {
    const found = [...recentGifs()];
    const seen = new Set(found.map(item => item.url));
    document.querySelectorAll('.msg-image').forEach(img => {
      const src = img.getAttribute('src') || '';
      if (!src || !/\.gif(?:$|\?)/i.test(src) || seen.has(src)) return;
      seen.add(src);
      found.push({ url:src,name:img.alt || 'GIF da conversa' });
    });
    return found;
  }

  function positionPicker() {
    const picker = document.querySelector('#v17GifPicker');
    const button = document.querySelector('#gifBtn');
    if (!picker || !button) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(520,window.innerWidth - 20);
    let left = Math.max(10,Math.min(rect.right - width,window.innerWidth - width - 10));
    let top = rect.top - Math.min(620,window.innerHeight * .84) - 10;
    if (top < 10) top = 10;
    picker.style.left = `${left}px`;
    picker.style.top = `${top}px`;
  }

  function renderGifGrid(filter='') {
    const grid = document.querySelector('#v17GifGrid');
    if (!grid) return;
    const term = filter.trim().toLowerCase();
    const gifs = discoverGifs().filter(item => !term || String(item.name || '').toLowerCase().includes(term));
    if (!gifs.length) {
      grid.innerHTML = `<div class="v17-gif-empty">Nenhum GIF salvo ainda.<br>Envie um GIF pelo dispositivo; depois ele aparece aqui como recente.</div>`;
      return;
    }
    grid.innerHTML = gifs.map((item,index) => `
      <button class="v17-gif-tile" data-gif-index="${index}" type="button" title="${escapeAttr(item.name || 'GIF')}">
        <img src="${escapeAttr(item.url)}" alt="${escapeAttr(item.name || 'GIF')}">
      </button>`).join('');
    grid.querySelectorAll('[data-gif-index]').forEach((tile,index) => {
      tile.onclick = () => {
        const item = gifs[index];
        if (!item) return;
        rememberGif(item.url,item.name);
        sendCurrentMessage('',{ url:item.url,name:item.name || 'GIF',type:'image/gif',size:0 });
        closeGifPicker();
      };
    });
  }

  function renderPickerEmoji() {
    const grid = document.querySelector('#v17GifGrid');
    grid.innerHTML = EMOJIS.map(emoji => `<button class="v17-gif-tile" type="button" style="min-height:72px;font-size:34px;display:grid;place-items:center">${emoji}</button>`).join('');
    grid.querySelectorAll('button').forEach(button => {
      button.onclick = () => {
        const input = document.querySelector('#messageInput');
        if (input) { input.value += button.textContent; input.focus(); }
        closeGifPicker();
      };
    });
  }

  function openGifPicker() {
    buildShells();
    const picker = document.querySelector('#v17GifPicker');
    picker.classList.remove('hidden');
    picker.dataset.mode = 'gifs';
    picker.querySelectorAll('.v17-picker-tab').forEach(tab => tab.classList.toggle('active',tab.dataset.v17PickerTab === 'gifs'));
    const search = document.querySelector('#v17GifSearch');
    search.value = '';
    search.placeholder = 'Buscar GIF já usado nesta conversa';
    search.classList.remove('hidden');
    document.querySelector('#v17GifUpload')?.classList.remove('hidden');
    renderGifGrid();
    positionPicker();
    setTimeout(() => search.focus(),0);
  }

  function closeGifPicker() {
    document.querySelector('#v17GifPicker')?.classList.add('hidden');
  }

  const picker = document.querySelector('#v17GifPicker');
  picker?.querySelector('.v17-picker-close')?.addEventListener('click',closeGifPicker);
  picker?.querySelectorAll('.v17-picker-tab').forEach(tab => {
    tab.onclick = () => {
      picker.querySelectorAll('.v17-picker-tab').forEach(item => item.classList.toggle('active',item === tab));
      const mode = tab.dataset.v17PickerTab;
      picker.dataset.mode = mode;
      const search = document.querySelector('#v17GifSearch');
      const upload = document.querySelector('#v17GifUpload');
      if (mode === 'emoji') {
        search.classList.add('hidden');
        upload.classList.add('hidden');
        renderPickerEmoji();
      } else {
        search.classList.remove('hidden');
        upload.classList.remove('hidden');
        renderGifGrid(search.value);
      }
    };
  });
  document.querySelector('#v17GifSearch')?.addEventListener('input',e => renderGifGrid(e.target.value));
  document.querySelector('#v17GifUpload')?.addEventListener('click',() => {
    closeGifPicker();
    document.querySelector('#gifInput')?.click();
  });

  const gifBtn = document.querySelector('#gifBtn');
  if (gifBtn) gifBtn.onclick = e => { e.preventDefault(); e.stopPropagation(); openGifPicker(); };

  document.addEventListener('pointerdown',e => {
    const current = document.querySelector('#v17GifPicker');
    if (!current || current.classList.contains('hidden')) return;
    if (!current.contains(e.target) && !e.target.closest('#gifBtn')) closeGifPicker();
  });

  function openImageViewer(src) {
    const viewer = document.querySelector('#v17ImageViewer');
    const img = document.querySelector('#v17ViewerImage');
    const link = document.querySelector('#v17ViewerOpen');
    if (!viewer || !img || !src) return;
    img.src = src;
    link.href = src;
    viewer.classList.remove('hidden');
  }

  function closeImageViewer() {
    const viewer = document.querySelector('#v17ImageViewer');
    if (!viewer) return;
    viewer.classList.add('hidden');
    const img = document.querySelector('#v17ViewerImage');
    if (img) img.src = '';
  }

  document.querySelector('#v17ImageViewer .v17-viewer-close')?.addEventListener('click',closeImageViewer);
  document.querySelector('#v17ImageViewer')?.addEventListener('click',e => {
    if (e.target.id === 'v17ImageViewer') closeImageViewer();
  });

  document.addEventListener('click',e => {
    const image = e.target.closest('.msg-image');
    if (!image) return;
    e.preventDefault();
    e.stopPropagation();
    if (/\.gif(?:$|\?)/i.test(image.getAttribute('src') || '')) rememberGif(image.getAttribute('src'),image.alt || 'GIF');
    openImageViewer(image.src || image.getAttribute('src'));
  },true);

  document.addEventListener('keydown',e => {
    if (e.key !== 'Escape') return;
    if (!document.querySelector('#v17ImageViewer')?.classList.contains('hidden')) { closeImageViewer(); return; }
    if (!document.querySelector('#v17GifPicker')?.classList.contains('hidden')) { closeGifPicker(); return; }
    if (!document.querySelector('#v17ProfilePopover')?.classList.contains('hidden')) { document.querySelector('#v17ProfilePopover').classList.add('hidden'); return; }
    if (!document.querySelector('#v17SettingsBackdrop')?.classList.contains('hidden')) closeSettings();
  });

  const decorateTimer = setInterval(() => {
    if (!state.me) return;
    installSettingsButtons();
    decorateFriendRows();
    decorateMemberRows();
    refreshProfileCache();
  },1200);

  window.addEventListener('beforeunload',() => clearInterval(decorateTimer),{ once:true });
})();
