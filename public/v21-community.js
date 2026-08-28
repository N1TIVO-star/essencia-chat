(() => {
  'use strict';

  const presence = { statuses: {}, onlineUserIds: new Set() };
  const mediaStates = new Map();
  let selfPopover = null;
  let adminShell = null;
  let adminData = null;
  let adminTab = 'profile';
  let currentHomeTab = 'available';
  let friendSearch = '';
  let deafened = false;
  let installedSocket = null;

  const escHtml = value => {
    const d = document.createElement('div');
    d.textContent = String(value ?? '');
    return d.innerHTML;
  };
  const cssEscape = value => window.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g,'\\$&');

  function statusOf(userId) {
    if (!userId) return 'offline';
    if (!presence.onlineUserIds.has(userId)) return 'offline';
    return presence.statuses[userId] || 'online';
  }

  async function refreshPresence() {
    try {
      const data = await API('/api/presence');
      presence.onlineUserIds = new Set(data.onlineUserIds || []);
      presence.statuses = data.statuses || {};
      paintPresence();
      if (!document.querySelector('#homeView')?.classList.contains('hidden')) renderV21Home();
    } catch {}
  }

  function statusLabel(status) {
    if (status === 'dnd') return 'Não perturbar';
    if (status === 'invisible') return 'Invisível';
    if (status === 'offline') return 'Offline';
    return 'Disponível';
  }

  function paintPresence() {
    document.querySelectorAll('[data-user-id], [data-member-id]').forEach(row => {
      const userId = row.dataset.userId || row.dataset.memberId;
      const status = statusOf(userId);
      row.dataset.v21Status = status;
      const dot = row.querySelector('.member-presence,.status-dot,.dm-presence-lite');
      if (dot) {
        dot.classList.remove('online','dnd','invisible','offline');
        dot.classList.add('v21-presence-dot', status);
      }
    });
    const meDot = document.querySelector('#v21MeStatusDot');
    if (meDot) {
      const status = state.me?.status || 'online';
      meDot.className = `v21-presence-dot ${status}`;
      meDot.title = statusLabel(status);
    }
  }

  function syncMembersLayout() {
    const app = document.querySelector('#app');
    const panel = document.querySelector('#membersPanel');
    if (!app || !panel) return;
    const open = !panel.classList.contains('hidden') && window.innerWidth > 760;
    app.classList.toggle('v21-members-open', open);
  }

  const observer = new MutationObserver(syncMembersLayout);
  const membersPanel = document.querySelector('#membersPanel');
  if (membersPanel) observer.observe(membersPanel,{attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',syncMembersLayout);
  syncMembersLayout();

  function userFromRow(row) {
    const id = row?.dataset?.memberId || row?.dataset?.userId;
    if (!id) return null;
    if (state.me?.id === id) return state.me;
    return (state.serverMembers || []).find(u => u.id === id)
      || (state.friends?.friends || []).find(u => u.id === id)
      || [...(state.peerUsers?.values?.() || [])].find(u => u.id === id)
      || null;
  }

  document.addEventListener('click', e => {
    const memberRow = e.target.closest('.member-row,.voice-participant');
    if (!memberRow || e.target.closest('button,input,label,a')) return;
    const id = memberRow.dataset.memberId || memberRow.dataset.userId || memberRow.querySelector('[data-v17-profile-target]')?.getAttribute('data-v17-profile-target');
    const user = id ? userFromRow({dataset:{memberId:id}}) : null;
    const avatar = memberRow.querySelector('.avatar');
    if (avatar && user) {
      avatar.setAttribute('data-v17-profile-target', user.id);
      avatar.click();
    }
  });

  function ensureMeControls() {
    const bar = document.querySelector('.me-bar');
    if (!bar || document.querySelector('#v21DeafenBtn')) return;
    bar.classList.add('v21-me-wrap');
    const meta = bar.querySelector('.me-meta');
    if (meta) {
      const dot = document.createElement('span');
      dot.id = 'v21MeStatusDot';
      dot.className = `v21-presence-dot ${state.me?.status || 'online'}`;
      dot.style.marginLeft = '2px';
      meta.appendChild(dot);
      meta.style.cursor = 'pointer';
      meta.onclick = e => { e.stopPropagation(); openSelfPopover(meta); };
    }
    const avatar = document.querySelector('#meAvatar');
    if (avatar) {
      avatar.style.cursor = 'pointer';
      avatar.onclick = e => { e.stopPropagation(); openSelfPopover(avatar); };
    }
    const gear = document.querySelector('#openProfileBtn');
    const deafen = document.createElement('button');
    deafen.id = 'v21DeafenBtn';
    deafen.className = 'v21-deafen-btn';
    deafen.title = 'Desativar áudio';
    deafen.textContent = '🎧';
    deafen.onclick = toggleDeafen;
    bar.insertBefore(deafen, gear || null);
    paintPresence();
  }

  function openSelfPopover(anchor) {
    closeSelfPopover();
    selfPopover = document.createElement('div');
    selfPopover.className = 'v21-self-pop';
    const me = state.me || {};
    const status = me.status || 'online';
    selfPopover.innerHTML = `
      <div class="v21-self-banner" style="${me.banner ? `background-image:url('${escHtml(me.banner)}')` : ''}"></div>
      <div class="v21-self-body">
        <img class="v21-self-avatar" src="${avatarUrl(me)}" alt="">
        <div class="v21-self-title">${escHtml(me.nick || me.username || 'Usuário')}</div>
        <div class="v21-self-user">@${escHtml(me.username || '')}</div>
        <div class="v21-self-status">
          <button class="v21-status-option ${status==='online'?'active':''}" data-status="online"><span class="v21-presence-dot online"></span><span>Disponível</span><small>Online</small></button>
          <button class="v21-status-option ${status==='dnd'?'active':''}" data-status="dnd"><span class="v21-presence-dot dnd"></span><span>Não perturbar</span><small>Sem alertas</small></button>
          <button class="v21-status-option ${status==='invisible'?'active':''}" data-status="invisible"><span class="v21-presence-dot invisible"></span><span>Invisível</span><small>Aparece offline</small></button>
        </div>
      </div>`;
    document.body.appendChild(selfPopover);
    selfPopover.querySelectorAll('[data-status]').forEach(btn => btn.onclick = () => setStatus(btn.dataset.status));
    const r = anchor.getBoundingClientRect();
    const w = 310;
    let left = Math.max(8, r.left);
    if (left + w > innerWidth - 8) left = innerWidth - w - 8;
    let top = r.top - selfPopover.offsetHeight - 10;
    if (top < 8) top = Math.min(innerHeight - selfPopover.offsetHeight - 8, r.bottom + 8);
    selfPopover.style.left = `${left}px`;
    selfPopover.style.top = `${Math.max(8,top)}px`;
  }

  function closeSelfPopover() { selfPopover?.remove(); selfPopover = null; }

  async function setStatus(status) {
    try {
      const data = await API('/api/status',{method:'POST',body:{status}});
      state.me = data.user;
      updateMeUI();
      closeSelfPopover();
      paintPresence();
      toast(`Status: ${statusLabel(status)}.`);
    } catch (err) { toast(err.message); }
  }

  function applyDeafen() {
    for (const [socketId, media] of state.remoteMedia || []) {
      const user = state.peerUsers?.get(socketId);
      if (deafened) {
        if (media?.voiceGain) media.voiceGain.gain.value = 0;
        if (media?.screenGain) media.screenGain.gain.value = 0;
        const tile = document.querySelector(`[data-peer="${cssEscape(socketId)}"]`);
        tile?.querySelectorAll('audio').forEach(a => a.muted = true);
      } else if (user) {
        try { applyPeerVolumesByUser(user); } catch {}
      }
    }
    const btn = document.querySelector('#v21DeafenBtn');
    if (btn) {
      btn.classList.toggle('active',deafened);
      btn.textContent = deafened ? '🔇' : '🎧';
      btn.title = deafened ? 'Ativar áudio' : 'Desativar áudio';
    }
    broadcastV21MediaState();
    decorateVoiceFlags();
  }

  function toggleDeafen() { deafened = !deafened; applyDeafen(); }

  function broadcastV21MediaState(clear=false) {
    if (!state.socket) return;
    state.socket.emit('v21:media-state',{
      muted: !!state.muted,
      deafened: !!deafened,
      sharing: !!state.screenStream?.getVideoTracks?.().length,
      clear
    });
    mediaStates.set(state.me?.id,{muted:!!state.muted,deafened:!!deafened,sharing:!!state.screenStream?.getVideoTracks?.().length});
  }

  function decorateVoiceFlags() {
    document.querySelectorAll('.voice-participant').forEach(item => {
      let id = item.dataset.userId || item.querySelector('[data-v17-profile-target]')?.getAttribute('data-v17-profile-target');
      if (!id) {
        const nick = item.querySelector('span')?.textContent?.trim();
        id = [...(state.peerUsers?.values?.() || [])].find(u => u.nick === nick)?.id || (state.me?.nick === nick ? state.me.id : null);
        if (id) item.dataset.userId = id;
      }
      item.querySelector('.v21-voice-flags')?.remove();
      const st = mediaStates.get(id);
      if (!st) return;
      const flags = document.createElement('div');
      flags.className = 'v21-voice-flags';
      if (st.sharing) flags.innerHTML += '<span class="v21-voice-flag live" title="Transmitindo">🖥</span>';
      if (st.muted) flags.innerHTML += '<span class="v21-voice-flag muted" title="Microfone desativado">🎙̸</span>';
      if (st.deafened) flags.innerHTML += '<span class="v21-voice-flag deaf" title="Áudio desativado">🔇</span>';
      item.appendChild(flags);
    });

    document.querySelectorAll('.active-call-person').forEach(item => {
      const name = item.querySelector('span')?.textContent?.trim();
      const id = (name === state.me?.nick ? state.me?.id : [...(state.peerUsers?.values?.() || [])].find(u => u.nick === name)?.id);
      const st = mediaStates.get(id);
      item.querySelector('.v21-voice-flags')?.remove();
      if (!st) return;
      const flags = document.createElement('span');
      flags.className = 'v21-voice-flags';
      if (st.sharing) flags.innerHTML += '<span class="v21-voice-flag live">🖥</span>';
      if (st.muted) flags.innerHTML += '<span class="v21-voice-flag muted">🎙̸</span>';
      if (st.deafened) flags.innerHTML += '<span class="v21-voice-flag deaf">🔇</span>';
      item.appendChild(flags);
    });
  }

  function ensureHomeUI() {
    const home = document.querySelector('#homeView');
    if (!home || document.querySelector('#v21HomeTabs')) return;
    home.querySelector('.home-hero')?.classList.add('hidden');
    const tabs = document.createElement('div');
    tabs.id = 'v21HomeTabs';
    tabs.className = 'v21-home-tabs';
    tabs.innerHTML = `
      <span class="v21-home-label">👥 Amigos</span>
      <button class="v21-home-tab active" data-home-tab="available">Disponível</button>
      <button class="v21-home-tab" data-home-tab="all">Todos</button>
      <button class="v21-home-tab" data-home-tab="pending">Pendentes</button>
      <button class="v21-home-tab add" data-home-tab="add">Adicionar amigo</button>`;
    home.insertBefore(tabs, home.firstChild);
    const searchWrap = document.createElement('div');
    searchWrap.id = 'v21FriendSearchWrap';
    searchWrap.className = 'v21-friend-search-wrap';
    searchWrap.innerHTML = '<input id="v21FriendSearch" class="v21-friend-search" placeholder="Buscar amigos">';
    home.insertBefore(searchWrap, document.querySelector('#homeContent'));
    tabs.querySelectorAll('[data-home-tab]').forEach(btn => btn.onclick = () => {
      currentHomeTab = btn.dataset.homeTab;
      tabs.querySelectorAll('.v21-home-tab').forEach(x => x.classList.toggle('active',x===btn));
      renderV21Home();
    });
    searchWrap.querySelector('input').oninput = e => { friendSearch = e.target.value; renderV21Home(); };
  }

  function renderFriendRows(rows, pending=false) {
    const box = document.querySelector('#homeContent');
    box.innerHTML = '';
    if (!rows.length) {
      box.innerHTML = `<div class="v21-home-empty">${pending ? 'Nenhuma solicitação pendente.' : 'Nenhum amigo encontrado.'}</div>`;
      return;
    }
    rows.forEach(item => {
      const friend = pending ? item.from : item;
      const row = document.createElement('div');
      row.className = 'person-row';
      row.dataset.userId = friend.id;
      const status = statusOf(friend.id);
      row.innerHTML = `
        <img class="avatar" data-v17-profile-target="${escHtml(friend.id)}" src="${avatarUrl(friend)}">
        <span class="v21-presence-dot ${status}"></span>
        <div class="person-meta"><strong>${escHtml(friend.nick || friend.username)}</strong><small>@${escHtml(friend.username)} · ${statusLabel(status)}</small></div>
        ${pending ? '<button data-accept>✓ Aceitar</button><button data-reject>×</button>' : '<button data-message>Mensagem</button><button data-call>📞</button>'}`;
      if (pending) {
        row.querySelector('[data-accept]').onclick = async e => { e.stopPropagation(); await API(`/api/friends/${item.id}/accept`,{method:'POST'}); await loadFriends(); renderV21Home(); };
        row.querySelector('[data-reject]').onclick = async e => { e.stopPropagation(); await API(`/api/friends/${item.id}/reject`,{method:'POST'}); await loadFriends(); renderV21Home(); };
      } else {
        row.querySelector('[data-message]').onclick = e => { e.stopPropagation(); openDM(friend); };
        row.querySelector('[data-call]').onclick = e => { e.stopPropagation(); startDmCall(friend,true); };
        row.onclick = e => {
          if (e.target.closest('button')) return;
          row.querySelector('.avatar')?.click();
        };
      }
      box.appendChild(row);
    });
  }

  function renderV21Home() {
    if (!state.friends || document.querySelector('#homeView')?.classList.contains('hidden')) return;
    ensureHomeUI();
    const box = document.querySelector('#homeContent');
    const searchWrap = document.querySelector('#v21FriendSearchWrap');
    const q = friendSearch.trim().toLowerCase();
    if (currentHomeTab === 'add') {
      searchWrap?.classList.add('hidden');
      box.innerHTML = `<div class="v21-add-friend"><h2>Adicionar amigo</h2><p>Digite o nome exato de usuário para enviar uma solicitação.</p><div class="v21-add-row"><input id="v21AddFriendInput" placeholder="Nome de usuário"><button id="v21AddFriendBtn">Enviar pedido</button></div></div>`;
      box.querySelector('#v21AddFriendBtn').onclick = async () => {
        const username = box.querySelector('#v21AddFriendInput').value.trim();
        if (!username) return;
        try { await API('/api/friends/request',{method:'POST',body:{username}}); toast('Solicitação enviada.'); } catch(err){ toast(err.message); }
      };
      return;
    }
    searchWrap?.classList.remove('hidden');
    if (currentHomeTab === 'pending') {
      const pending = (state.friends.incoming || []).filter(r => !q || `${r.from.nick} ${r.from.username}`.toLowerCase().includes(q));
      renderFriendRows(pending,true);
      return;
    }
    let rows = [...(state.friends.friends || [])];
    if (currentHomeTab === 'available') rows = rows.filter(f => statusOf(f.id) === 'online');
    if (q) rows = rows.filter(f => `${f.nick} ${f.username}`.toLowerCase().includes(q));
    renderFriendRows(rows,false);
  }

  function forceHomeAvailable() {
    currentHomeTab = 'available';
    document.querySelectorAll('.v21-home-tab').forEach(btn => btn.classList.toggle('active',btn.dataset.homeTab==='available'));
    renderV21Home();
  }

  function makeServerIcon(server) {
    if (server.icon) return `<img src="${escHtml(server.icon)}" alt="">`;
    return escHtml(server.name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase());
  }

  function decorateServerIcons() {
    const buttons = [...document.querySelectorAll('#serverIcons .server-icon')];
    (state.servers || []).forEach((server,i) => {
      const btn = buttons[i];
      if (!btn) return;
      if (server.icon) btn.innerHTML = `<img src="${escHtml(server.icon)}" alt="${escHtml(server.name)}">`;
    });
  }

  function ensureAdminShell() {
    if (adminShell) return adminShell;
    adminShell = document.createElement('div');
    adminShell.className = 'v21-admin-shell hidden';
    adminShell.innerHTML = `
      <section class="v21-admin">
        <aside class="v21-admin-nav">
          <h3>Servidor</h3>
          <button data-tab="profile" class="active">🖼 Perfil</button>
          <button data-tab="channels"># Canais</button>
          <button data-tab="members">👥 Moderação</button>
          <button data-tab="invites">✉ Convites</button>
          <button data-tab="bans">⛔ Banimentos</button>
          <button data-tab="roles">🛡 Cargos</button>
        </aside>
        <main class="v21-admin-main"><button class="v21-admin-close">×</button><div id="v21AdminContent"></div></main>
      </section>`;
    document.body.appendChild(adminShell);
    adminShell.querySelector('.v21-admin-close').onclick = closeV21Admin;
    adminShell.onclick = e => { if (e.target === adminShell) closeV21Admin(); };
    adminShell.querySelectorAll('[data-tab]').forEach(btn => btn.onclick = () => {
      adminTab = btn.dataset.tab;
      adminShell.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===btn));
      renderAdminTab();
    });
    return adminShell;
  }

  async function loadV21Admin() {
    if (!state.currentServer?.id) return null;
    adminData = await API(`/api/servers/${state.currentServer.id}/v21`);
    return adminData;
  }

  async function openV21Admin(tab='profile') {
    try {
      await loadV21Admin();
      ensureAdminShell().classList.remove('hidden');
      adminTab = tab;
      adminShell.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));
      renderAdminTab();
    } catch(err){ toast(err.message); }
  }
  function closeV21Admin(){ adminShell?.classList.add('hidden'); }

  function canManage(key) { return !!adminData?.isOwner || !!adminData?.permissions?.[key]; }

  function renderAdminTab() {
    if (!adminData) return;
    if (adminTab === 'channels') return renderAdminChannels();
    if (adminTab === 'members') return renderAdminMembers();
    if (adminTab === 'invites') return renderAdminInvites();
    if (adminTab === 'bans') return renderAdminBans();
    if (adminTab === 'roles') {
      closeV21Admin();
      document.querySelector('#v19ServerSettingsBtn')?.click();
      setTimeout(()=>document.querySelector('.v19-admin-tab[data-tab="roles"]')?.click(),50);
      return;
    }
    renderAdminProfile();
  }

  function renderAdminProfile() {
    const c = adminShell.querySelector('#v21AdminContent');
    const s = adminData.server;
    const editable = canManage('manageMembers');
    c.innerHTML = `
      <h2>Perfil do servidor</h2><p>Nome, ícone e banner do servidor.</p>
      <div class="v21-server-preview"><div class="v21-server-preview-banner" style="${s.banner?`background-image:url('${escHtml(s.banner)}')`:''}"></div><div class="v21-server-preview-icon">${s.icon?`<img src="${escHtml(s.icon)}" style="width:100%;height:100%;object-fit:cover;border-radius:14px">`:makeServerIcon(s)}</div><div class="v21-server-preview-name">${escHtml(s.name)}</div></div>
      <div class="v21-field"><label>NOME</label><input id="v21ServerName" value="${escHtml(s.name)}" ${editable?'':'disabled'}></div>
      ${editable?`<div class="v21-card"><strong>Ícone e banner</strong><div class="v21-upload-row" style="margin-top:12px"><button class="v21-secondary" id="v21ChooseIcon">Escolher ícone</button><button class="v21-secondary" id="v21ChooseBanner">Escolher banner</button><input hidden id="v21IconFile" type="file" accept="image/*,.gif"><input hidden id="v21BannerFile" type="file" accept="image/*,.gif"></div><div class="v21-upload-row" style="margin-top:10px"><button class="v21-primary" id="v21SaveServer">Salvar alterações</button><button class="v21-danger" id="v21RemoveIcon">Remover ícone</button><button class="v21-danger" id="v21RemoveBanner">Remover banner</button></div></div>`:''}`;
    if (!editable) return;
    const icon = c.querySelector('#v21IconFile'), banner = c.querySelector('#v21BannerFile');
    c.querySelector('#v21ChooseIcon').onclick=()=>icon.click(); c.querySelector('#v21ChooseBanner').onclick=()=>banner.click();
    c.querySelector('#v21SaveServer').onclick=()=>saveServerProfile(false,false);
    c.querySelector('#v21RemoveIcon').onclick=()=>saveServerProfile(true,false);
    c.querySelector('#v21RemoveBanner').onclick=()=>saveServerProfile(false,true);
  }

  async function saveServerProfile(removeIcon,removeBanner) {
    const c = adminShell.querySelector('#v21AdminContent');
    const form = new FormData();
    form.append('name',c.querySelector('#v21ServerName')?.value || '');
    const icon = c.querySelector('#v21IconFile')?.files?.[0], banner = c.querySelector('#v21BannerFile')?.files?.[0];
    if (icon) form.append('icon',icon); if (banner) form.append('banner',banner);
    if (removeIcon) form.append('removeIcon','1'); if (removeBanner) form.append('removeBanner','1');
    try {
      await API(`/api/servers/${state.currentServer.id}/profile`,{method:'POST',body:form});
      await loadServers(); await loadV21Admin(); renderAdminProfile(); decorateServerIcons(); toast('Servidor atualizado.');
    } catch(err){ toast(err.message); }
  }

  function renderAdminChannels() {
    const c = adminShell.querySelector('#v21AdminContent');
    c.innerHTML = `<h2>Canais</h2><p>Edite o nome dos canais de texto e voz.</p><div class="v21-card">${(adminData.channels||[]).map(ch=>`<div class="v21-channel-row"><div><strong>${ch.type==='voice'?'🔊':'#'} ${escHtml(ch.name)}</strong><small style="display:block;color:var(--v17-muted);margin-top:3px">${ch.type==='voice'?'Canal de voz':'Canal de texto'}</small></div>${canManage('manageChannels')?`<div class="v21-row-actions"><button data-edit-channel="${escHtml(ch.id)}">Editar</button></div>`:''}</div>`).join('')}</div>`;
    c.querySelectorAll('[data-edit-channel]').forEach(btn=>btn.onclick=()=>editChannel(btn.dataset.editChannel));
  }

  async function editChannel(channelId) {
    const ch = adminData.channels.find(x=>x.id===channelId); if(!ch)return;
    const name = prompt('Novo nome do canal:',ch.name); if(!name||name===ch.name)return;
    try { await API(`/api/servers/${state.currentServer.id}/channels/${channelId}`,{method:'PUT',body:{name}}); await loadServers(); await loadV21Admin(); renderAdminChannels(); renderChannels(); toast('Canal atualizado.'); } catch(err){toast(err.message);}
  }

  function roleNames(member) {
    return (adminData.roles||[]).filter(r=>(member.roleIds||[]).includes(r.id)).map(r=>r.name).join(', ') || 'Sem cargo';
  }

  function renderAdminMembers() {
    const c = adminShell.querySelector('#v21AdminContent');
    c.innerHTML = `<h2>Moderação</h2><p>Expulse, bana ou silencie membros quando você tiver a permissão necessária.</p><div class="v21-card">${(adminData.members||[]).map(m=>`<div class="v21-member-admin-row"><img src="${avatarUrl(m)}"><div><strong>${escHtml(m.nick||m.username)} ${m.isOwner?'👑':''}</strong><small style="display:block;color:var(--v17-muted);margin-top:3px">@${escHtml(m.username)} · ${escHtml(roleNames(m))}${m.muted?' · Silenciado':''}</small></div>${canManage('manageMembers')&&!m.isOwner&&m.id!==state.me.id?`<div class="v21-row-actions"><button data-mute="${m.id}">${m.muted?'Desmutar':'Silenciar'}</button><button data-kick="${m.id}">Expulsar</button><button class="danger" data-ban="${m.id}">Banir</button></div>`:''}</div>`).join('')}</div>`;
    c.querySelectorAll('[data-mute]').forEach(b=>b.onclick=()=>moderate(b.dataset.mute,'mute'));
    c.querySelectorAll('[data-kick]').forEach(b=>b.onclick=()=>moderate(b.dataset.kick,'kick'));
    c.querySelectorAll('[data-ban]').forEach(b=>b.onclick=()=>moderate(b.dataset.ban,'ban'));
  }

  async function moderate(userId,action) {
    const member = adminData.members.find(m=>m.id===userId); if(!member)return;
    if ((action==='kick'||action==='ban') && !confirm(`${action==='ban'?'Banir':'Expulsar'} ${member.nick||member.username}?`)) return;
    try {
      if(action==='mute') await API(`/api/servers/${state.currentServer.id}/members/${userId}/mute`,{method:'POST',body:{muted:!member.muted}});
      else await API(`/api/servers/${state.currentServer.id}/members/${userId}/${action}`,{method:'POST'});
      await loadV21Admin(); try{await loadMembers();}catch{} renderAdminMembers(); toast('Ação aplicada.');
    } catch(err){toast(err.message);}
  }

  function renderAdminInvites() {
    const c = adminShell.querySelector('#v21AdminContent');
    const members = new Set((adminData.members||[]).map(m=>m.id));
    const friends = (state.friends?.friends||[]).filter(f=>!members.has(f.id));
    c.innerHTML = `<h2>Convites</h2><p>Agora a pessoa só entra depois de aceitar o convite no PV.</p><div class="v21-card"><div class="v21-invite-list">${friends.map(f=>`<label class="v21-invite-friend"><img src="${avatarUrl(f)}"><span><strong>${escHtml(f.nick||f.username)}</strong><small style="display:block;color:var(--v17-muted)">@${escHtml(f.username)}</small></span><input type="checkbox" data-invite-user="${f.id}"></label>`).join('')||'<div style="color:var(--v17-muted);font-size:12px">Todos os seus amigos já estão no servidor.</div>'}</div>${friends.length?'<button id="v21SendInvites" class="v21-primary" style="margin-top:12px">Enviar convites</button>':''}</div>`;
    c.querySelector('#v21SendInvites')?.addEventListener('click',sendServerInvites);
  }

  async function sendServerInvites() {
    const ids=[...adminShell.querySelectorAll('[data-invite-user]:checked')].map(x=>x.dataset.inviteUser); if(!ids.length){toast('Selecione alguém.');return;}
    try{const data=await API(`/api/servers/${state.currentServer.id}/invites`,{method:'POST',body:{userIds:ids}});toast(`${data.invites?.length||0} convite(s) enviado(s) no PV.`);renderAdminInvites();}catch(err){toast(err.message);}
  }

  function renderAdminBans() {
    const c=adminShell.querySelector('#v21AdminContent');
    c.innerHTML=`<h2>Banimentos</h2><p>Usuários banidos não podem aceitar novos convites enquanto o banimento estiver ativo.</p><div class="v21-card">${(adminData.bannedUsers||[]).map(u=>`<div class="v21-ban-row"><div style="flex:1"><strong>${escHtml(u.nick||u.username)}</strong><small style="display:block;color:var(--v17-muted)">@${escHtml(u.username)}</small></div>${canManage('manageMembers')?`<button class="v21-secondary" data-unban="${u.id}">Remover ban</button>`:''}</div>`).join('')||'<div style="color:var(--v17-muted);font-size:12px">Nenhum usuário banido.</div>'}</div>`;
    c.querySelectorAll('[data-unban]').forEach(b=>b.onclick=async()=>{try{await API(`/api/servers/${state.currentServer.id}/bans/${b.dataset.unban}/unban`,{method:'POST'});await loadV21Admin();renderAdminBans();toast('Banimento removido.');}catch(err){toast(err.message);}});
  }

  function installServerAdminButton() {
    const existing=document.querySelector('#v19ServerSettingsBtn');
    if(existing&&!existing.__v21){existing.__v21=true;existing.onclick=e=>{e.preventDefault();openV21Admin('profile');};}
  }

  function decorateInviteCard(message) {
    if (!message?.serverInvite?.id) return;
    const row=document.querySelector(`#messages .msg[data-msg="${cssEscape(message.id)}"]`); if(!row||row.querySelector('.v21-invite-card'))return;
    const inv=message.serverInvite;
    const card=document.createElement('div');card.className='v21-invite-card';
    const status=inv.status||'pending';
    card.innerHTML=`<div class="v21-invite-card-banner" style="${inv.serverBanner?`background-image:url('${escHtml(inv.serverBanner)}')`:''}"></div><div class="v21-invite-card-body"><div class="v21-invite-card-head">${inv.serverIcon?`<img class="v21-invite-card-icon" src="${escHtml(inv.serverIcon)}">`:'<div class="v21-invite-card-icon"></div>'}<div><strong>Convite para servidor</strong><div>${escHtml(inv.serverName||'Servidor')}</div></div></div>${status==='pending'&&message.userId!==state.me?.id?`<div class="v21-invite-card-actions"><button class="v21-invite-accept">Aceitar</button><button class="v21-invite-reject">Recusar</button></div>`:`<div class="v21-invite-status">${status==='accepted'?'Convite aceito':status==='rejected'?'Convite recusado':'Convite enviado'}</div>`}</div>`;
    row.querySelector('.msg-body')?.appendChild(card);
    card.querySelector('.v21-invite-accept')?.addEventListener('click',()=>respondInvite(inv.id,true,card));
    card.querySelector('.v21-invite-reject')?.addEventListener('click',()=>respondInvite(inv.id,false,card));
  }

  async function respondInvite(id,accept,card){try{await API(`/api/server-invites/${id}/${accept?'accept':'reject'}`,{method:'POST'});card.querySelector('.v21-invite-card-actions')?.remove();const s=document.createElement('div');s.className='v21-invite-status';s.textContent=accept?'Convite aceito':'Convite recusado';card.querySelector('.v21-invite-card-body').appendChild(s);if(accept)await loadServers();toast(accept?'Você entrou no servidor.':'Convite recusado.');}catch(err){toast(err.message);}}

  try {
    const originalAppend=appendMessage;
    appendMessage=function(message,...args){const result=originalAppend.call(this,message,...args);queueMicrotask(()=>decorateInviteCard(message));return result;};
  } catch{}

  try {
    const originalRenderChannels=renderChannels;
    renderChannels=function(...args){const result=originalRenderChannels.apply(this,args);queueMicrotask(()=>{decorateVoiceFlags();paintPresence();});return result;};
  } catch{}

  try {
    const originalRenderMembers=renderMembersList;
    renderMembersList=function(...args){const result=originalRenderMembers.apply(this,args);queueMicrotask(()=>{document.querySelectorAll('.member-row').forEach(row=>row.dataset.userId=row.dataset.memberId||'');paintPresence();});return result;};
  } catch{}

  try {
    const originalRenderServers=renderServerIcons;
    renderServerIcons=function(...args){const result=originalRenderServers.apply(this,args);queueMicrotask(decorateServerIcons);return result;};
  } catch{}

  try {
    const originalShowHome=showHome;
    showHome=async function(kind='friends'){const result=await originalShowHome.call(this,kind==='requests'?'requests':'friends');ensureHomeUI();if(kind==='requests')currentHomeTab='pending';else if(!['available','all','pending','add'].includes(currentHomeTab))currentHomeTab='available';queueMicrotask(renderV21Home);return result;};
  } catch{}

  function attachSocket() {
    if (!state.socket || state.socket===installedSocket) return;
    installedSocket=state.socket;
    state.socket.on('presence:update',data=>{
      presence.onlineUserIds=new Set(data?.onlineUserIds||[]);presence.statuses=data?.statuses||presence.statuses;paintPresence();renderV21Home();
    });
    state.socket.on('v21:media-state',payload=>{if(payload?.userId){if(payload.clear)mediaStates.delete(payload.userId);else mediaStates.set(payload.userId,{muted:!!payload.muted,deafened:!!payload.deafened,sharing:!!payload.sharing});decorateVoiceFlags();}});
    state.socket.on('server:moderation-error',payload=>toast(payload?.error||'Ação bloqueada pelo servidor.'));
    state.socket.on('server:removed',async payload=>{toast(payload?.reason==='ban'?'Você foi banido do servidor.':'Você foi removido do servidor.');await loadServers();if(state.currentServer?.id===payload.serverId)showHome('friends');});
    state.socket.on('server:moderation',payload=>{if(payload?.muted!==undefined)toast(payload.muted?'Você foi silenciado neste servidor.':'Seu silêncio foi removido.');});
  }

  document.addEventListener('pointerdown',e=>{if(selfPopover&&!selfPopover.contains(e.target)&&!e.target.closest('.me-bar'))closeSelfPopover();});

  const timer=setInterval(()=>{
    ensureMeControls(); ensureHomeUI(); installServerAdminButton(); attachSocket(); syncMembersLayout(); paintPresence();
    if(state.inVoice){broadcastV21MediaState();decorateVoiceFlags();}
  },900);

  refreshPresence(); ensureMeControls(); ensureHomeUI(); installServerAdminButton(); attachSocket();
  window.addEventListener('beforeunload',()=>{clearInterval(timer);try{broadcastV21MediaState(true);}catch{}},{once:true});
})();
