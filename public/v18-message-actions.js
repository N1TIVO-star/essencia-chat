(() => {
  'use strict';

  let replyDraft = null;
  let openMenuMessage = null;

  function escHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function currentMessageContext() {
    if (state.chatMode === 'server' && state.currentServer && state.currentChannel?.type === 'text') {
      return { kind:'server', serverId:state.currentServer.id, channelId:state.currentChannel.id };
    }
    if (state.chatMode === 'dm' && state.currentDM) {
      return { kind:'dm', friendId:state.currentDM.id };
    }
    return null;
  }

  function canDelete(message) {
    if (!message?.userId || !state.me?.id) return false;
    if (message.userId === state.me.id) return true;
    if (state.chatMode === 'server' && state.currentServer?.ownerId === state.me.id) return true;
    return false;
  }

  function getMessageText(message) {
    const text = String(message?.text || '').trim();
    if (text) return text;
    if (message?.attachment?.name) return `[Arquivo] ${message.attachment.name}`;
    return 'Mensagem';
  }

  function findRenderedMessage(messageId) {
    return document.querySelector(`#messages .msg[data-msg="${cssEscape(messageId)}"]`);
  }

  function ensureReplyDraftBar() {
    let bar = document.querySelector('#v18ReplyDraft');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'v18ReplyDraft';
    bar.className = 'v18-reply-draft hidden';
    bar.innerHTML = `
      <span class="v18-reply-draft-icon">↩</span>
      <div class="v18-reply-draft-text"></div>
      <button type="button" aria-label="Cancelar resposta">×</button>`;
    const composer = document.querySelector('#chatView .composer');
    composer?.parentNode?.insertBefore(bar, composer);
    bar.querySelector('button').onclick = clearReplyDraft;
    return bar;
  }

  function setReplyDraft(message) {
    replyDraft = {
      id: message.id,
      userId: message.userId,
      userNick: message.user?.nick || message.user?.username || 'Usuário',
      text: getMessageText(message).slice(0,160)
    };
    const bar = ensureReplyDraftBar();
    bar.querySelector('.v18-reply-draft-text').innerHTML = `Respondendo a <strong>${escHtml(replyDraft.userNick)}</strong> · ${escHtml(replyDraft.text)}`;
    bar.classList.remove('hidden');
    document.querySelector('#chatView')?.classList.add('v18-replying');
    document.querySelector('#messageInput')?.focus();
  }

  function clearReplyDraft() {
    replyDraft = null;
    document.querySelector('#v18ReplyDraft')?.classList.add('hidden');
    document.querySelector('#chatView')?.classList.remove('v18-replying');
  }

  function attachReplyPreview(row, message) {
    row.querySelector('.v18-reply-preview')?.remove();
    const reply = message?.replyTo;
    if (!reply) return;
    const preview = document.createElement('div');
    preview.className = 'v18-reply-preview';
    preview.innerHTML = `<strong>${escHtml(reply.userNick || 'Usuário')}</strong><span>${escHtml(reply.text || 'Mensagem')}</span>`;
    const body = row.querySelector('.msg-body');
    body?.insertBefore(preview, body.firstChild);
    preview.onclick = () => {
      const original = findRenderedMessage(reply.id);
      if (!original) return;
      original.scrollIntoView({ behavior:'smooth', block:'center' });
      original.animate?.([{ background:'rgba(116,92,255,.25)' },{ background:'transparent' }],{ duration:850 });
    };
  }

  function messageActionButton(label, icon, action, danger = false) {
    const button = document.createElement('button');
    button.type = 'button';
    if (danger) button.className = 'danger';
    button.innerHTML = `<span>${icon}</span><span>${label}</span>`;
    button.onclick = () => { closeMessageMenu(); action(); };
    return button;
  }

  function closeMessageMenu() {
    document.querySelector('#v18MessageMenu')?.remove();
    document.querySelectorAll('.v18-message-more.open').forEach(btn => btn.classList.remove('open'));
    openMenuMessage = null;
  }

  function openMessageMenu(message, button) {
    closeMessageMenu();
    openMenuMessage = message;
    button.classList.add('open');

    const menu = document.createElement('div');
    menu.id = 'v18MessageMenu';
    menu.className = 'v18-message-menu';
    menu.appendChild(messageActionButton('Responder','↩',() => setReplyDraft(message)));
    menu.appendChild(messageActionButton('Encaminhar','↗',() => openForwardModal(message)));
    menu.appendChild(messageActionButton('Copiar texto','⧉',() => copyMessageText(message)));
    if (canDelete(message)) {
      const hr = document.createElement('hr');
      menu.appendChild(hr);
      menu.appendChild(messageActionButton('Excluir mensagem','🗑',() => deleteMessage(message),true));
    }
    document.body.appendChild(menu);

    const rect = button.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let left = rect.right - menuRect.width;
    let top = rect.bottom + 5;
    if (left < 8) left = 8;
    if (left + menuRect.width > window.innerWidth - 8) left = window.innerWidth - menuRect.width - 8;
    if (top + menuRect.height > window.innerHeight - 8) top = rect.top - menuRect.height - 5;
    menu.style.left = `${Math.max(8,left)}px`;
    menu.style.top = `${Math.max(8,top)}px`;
  }

  async function copyMessageText(message) {
    const text = getMessageText(message);
    try {
      await navigator.clipboard.writeText(text);
      toast('Texto copiado.');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); toast('Texto copiado.'); } catch { toast('Não foi possível copiar.'); }
      area.remove();
    }
  }

  function ensureForwardModal() {
    let backdrop = document.querySelector('#v18ForwardBackdrop');
    if (backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.id = 'v18ForwardBackdrop';
    backdrop.className = 'v18-forward-backdrop hidden';
    backdrop.innerHTML = `
      <section class="v18-forward-modal" role="dialog" aria-modal="true" aria-label="Encaminhar mensagem">
        <div class="v18-forward-head"><h3>Encaminhar mensagem</h3><button type="button">×</button></div>
        <input id="v18ForwardSearch" class="v18-forward-search" placeholder="Buscar conversa ou canal">
        <div id="v18ForwardList" class="v18-forward-list"></div>
      </section>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('.v18-forward-head button').onclick = closeForwardModal;
    backdrop.onclick = e => { if (e.target === backdrop) closeForwardModal(); };
    backdrop.querySelector('#v18ForwardSearch').oninput = () => renderForwardDestinations(openMenuMessage);
    return backdrop;
  }

  function closeForwardModal() {
    document.querySelector('#v18ForwardBackdrop')?.classList.add('hidden');
  }

  function openForwardModal(message) {
    openMenuMessage = message;
    const backdrop = ensureForwardModal();
    backdrop.classList.remove('hidden');
    const search = backdrop.querySelector('#v18ForwardSearch');
    search.value = '';
    renderForwardDestinations(message);
    setTimeout(() => search.focus(),0);
  }

  function renderForwardDestinations(message) {
    const list = document.querySelector('#v18ForwardList');
    if (!list) return;
    const term = String(document.querySelector('#v18ForwardSearch')?.value || '').trim().toLowerCase();
    list.innerHTML = '';
    let count = 0;

    const addSection = label => {
      const div = document.createElement('div');
      div.className = 'v18-forward-section';
      div.textContent = label;
      list.appendChild(div);
    };

    const friends = (state.friends?.friends || []).filter(friend => !term || `${friend.nick} ${friend.username}`.toLowerCase().includes(term));
    if (friends.length) {
      addSection('MENSAGENS DIRETAS');
      for (const friend of friends) {
        const btn = document.createElement('button');
        btn.className = 'v18-forward-destination';
        btn.innerHTML = `<img src="${avatarUrl(friend)}"><div><strong>${escHtml(friend.nick || friend.username)}</strong><small>@${escHtml(friend.username)}</small></div>`;
        btn.onclick = () => forwardToDm(message, friend);
        list.appendChild(btn);
        count++;
      }
    }

    const destinations = [];
    for (const server of state.servers || []) {
      for (const channel of server.channels || []) {
        if (channel.type !== 'text') continue;
        const hay = `${server.name} ${channel.name}`.toLowerCase();
        if (term && !hay.includes(term)) continue;
        destinations.push({ server, channel });
      }
    }
    if (destinations.length) {
      addSection('CANAIS DE TEXTO');
      for (const {server,channel} of destinations) {
        const btn = document.createElement('button');
        btn.className = 'v18-forward-destination';
        btn.innerHTML = `<span class="v18-dest-icon">#</span><div><strong>#${escHtml(channel.name)}</strong><small>${escHtml(server.name)}</small></div>`;
        btn.onclick = () => forwardToChannel(message, server, channel);
        list.appendChild(btn);
        count++;
      }
    }

    if (!count) list.innerHTML = '<div class="v18-forward-empty">Nenhuma conversa encontrada.</div>';
  }

  function forwardPayload(message) {
    const author = message?.user?.nick || message?.user?.username || 'Usuário';
    const original = String(message?.text || '').trim();
    const text = original ? `↗ Encaminhada de ${author}\n${original}` : `↗ Encaminhada de ${author}`;
    return { text, attachment:message?.attachment || null };
  }

  function forwardToDm(message, friend) {
    const payload = forwardPayload(message);
    state.socket?.emit('dm:send',{ friendId:friend.id, text:payload.text, attachment:payload.attachment });
    closeForwardModal();
    toast(`Encaminhada para ${friend.nick || friend.username}.`);
  }

  function forwardToChannel(message, server, channel) {
    const payload = forwardPayload(message);
    state.socket?.emit('message:send',{ serverId:server.id, channelId:channel.id, text:payload.text, attachment:payload.attachment });
    closeForwardModal();
    toast(`Encaminhada para #${channel.name}.`);
  }

  function deleteMessage(message) {
    if (!message?.id || !confirm('Excluir esta mensagem?')) return;
    const context = currentMessageContext();
    if (!context) return;
    if (context.kind === 'server') {
      state.socket.emit('message:delete',{ serverId:context.serverId, channelId:context.channelId, messageId:message.id },ack => {
        if (!ack?.ok) toast(ack?.error || 'Não foi possível excluir a mensagem.');
      });
    } else {
      state.socket.emit('dm:delete',{ friendId:context.friendId, messageId:message.id },ack => {
        if (!ack?.ok) toast(ack?.error || 'Não foi possível excluir a mensagem.');
      });
    }
  }

  function decorateMessage(message) {
    if (!message?.id) return;
    const row = findRenderedMessage(message.id);
    if (!row) return;
    row.__v18Message = message;
    attachReplyPreview(row,message);
    if (row.querySelector('.v18-message-more')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'v18-message-more';
    button.title = 'Mais ações';
    button.setAttribute('aria-label','Mais ações da mensagem');
    button.textContent = '⋯';
    button.onclick = e => {
      e.stopPropagation();
      openMessageMenu(message,button);
    };
    row.appendChild(button);
  }

  try {
    const originalAppend = appendMessage;
    appendMessage = function(message,...args) {
      const result = originalAppend.call(this,message,...args);
      queueMicrotask(() => decorateMessage(message));
      return result;
    };
  } catch {}

  try {
    const originalSend = sendCurrentMessage;
    sendCurrentMessage = function(textOverride = null, attachment = null) {
      const text = textOverride === null ? document.querySelector('#messageInput')?.value.trim() : String(textOverride || '').trim();
      if (!text && !attachment) return;
      const replyTo = replyDraft ? { ...replyDraft } : null;
      if (state.chatMode === 'server' && state.currentServer && state.currentChannel?.type === 'text') {
        state.socket.emit('message:send',{ serverId:state.currentServer.id, channelId:state.currentChannel.id, text, attachment, replyTo });
      } else if (state.chatMode === 'dm' && state.currentDM) {
        state.socket.emit('dm:send',{ friendId:state.currentDM.id, text, attachment, replyTo });
      } else return;
      const input = document.querySelector('#messageInput');
      if (input) input.value = '';
      clearReplyDraft();
    };
  } catch {}

  const clearOnNavigation = () => { clearReplyDraft(); closeMessageMenu(); closeForwardModal(); };
  try {
    const original = openDM;
    openDM = async function(...args) { clearOnNavigation(); return original.apply(this,args); };
  } catch {}
  try {
    const original = openChannel;
    openChannel = async function(...args) { clearOnNavigation(); return original.apply(this,args); };
  } catch {}

  function attachSocket() {
    if (!state.socket || state.socket.__v18MessageActions) return;
    state.socket.__v18MessageActions = true;
    state.socket.on('message:deleted',({ serverId,channelId,messageId }) => {
      if (state.currentServer?.id === serverId && state.currentChannel?.id === channelId) {
        findRenderedMessage(messageId)?.remove();
      }
    });
    state.socket.on('dm:deleted',({ friendId,messageId }) => {
      if (state.currentDM?.id === friendId) findRenderedMessage(messageId)?.remove();
    });
  }

  const socketTimer = setInterval(() => {
    if (state.socket) attachSocket();
  },300);

  document.addEventListener('pointerdown',e => {
    const menu = document.querySelector('#v18MessageMenu');
    if (menu && !menu.contains(e.target) && !e.target.closest('.v18-message-more')) closeMessageMenu();
  });
  window.addEventListener('resize',closeMessageMenu);
  window.addEventListener('blur',closeMessageMenu);
  document.addEventListener('keydown',e => {
    if (e.key !== 'Escape') return;
    if (!document.querySelector('#v18ForwardBackdrop')?.classList.contains('hidden')) { closeForwardModal(); return; }
    if (document.querySelector('#v18MessageMenu')) { closeMessageMenu(); return; }
    if (replyDraft) clearReplyDraft();
  });

  ensureReplyDraftBar();
  window.addEventListener('beforeunload',() => clearInterval(socketTimer),{ once:true });
})();
