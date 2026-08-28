(() => {
  'use strict';

  let permissions = null;
  let permissionsServerId = null;
  let backdrop = null;
  let selectedChannel = null;

  function canManageChannels() {
    if (!state.currentServer) return false;
    if (state.currentServer.ownerId === state.me?.id) return true;
    if (permissionsServerId === state.currentServer.id && permissions) return !!permissions.manageChannels;
    const cached = state.v19ServerPermissions?.[state.currentServer.id];
    return !!cached?.manageChannels;
  }

  async function refreshPermissions() {
    if (!state.currentServer?.id) return;
    try {
      const data = await API(`/api/servers/${state.currentServer.id}/admin`);
      permissions = data.permissions || {};
      permissionsServerId = state.currentServer.id;
    } catch {
      permissions = null;
      permissionsServerId = state.currentServer.id;
    }
  }

  function buildModal() {
    if (backdrop) return;
    backdrop = document.createElement('div');
    backdrop.className = 'v23-channel-backdrop hidden';
    backdrop.innerHTML = `
      <section class="v23-channel-modal" role="dialog" aria-modal="true" aria-label="Configurações do canal">
        <div class="v23-channel-head">
          <div><h3>Configurações do canal</h3><small id="v23ChannelSubtitle"></small></div>
          <button class="v23-channel-close" type="button">×</button>
        </div>
        <div class="v23-channel-body">
          <div class="v23-channel-field">
            <label>NOME DO CANAL</label>
            <input id="v23ChannelName" class="v23-channel-input" maxlength="32">
          </div>
          <div class="v23-channel-field">
            <label>TIPO</label>
            <div id="v23ChannelType" class="v23-channel-type"></div>
          </div>
          <div class="v23-channel-actions">
            <button class="v23-channel-cancel" type="button">Cancelar</button>
            <button class="v23-channel-save" type="button">Salvar alterações</button>
          </div>
          <div class="v23-channel-danger-zone">
            <strong>ZONA DE PERIGO</strong>
            <p>Excluir o canal remove ele do servidor. Essa ação não pode ser desfeita.</p>
            <button class="v23-channel-delete" type="button">Excluir canal</button>
          </div>
        </div>
      </section>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('.v23-channel-close').onclick = closeModal;
    backdrop.querySelector('.v23-channel-cancel').onclick = closeModal;
    backdrop.querySelector('.v23-channel-save').onclick = saveChannel;
    backdrop.querySelector('.v23-channel-delete').onclick = deleteChannel;
    backdrop.onclick = e => { if (e.target === backdrop) closeModal(); };
  }

  function openModal(channel) {
    if (!channel || !canManageChannels()) return;
    buildModal();
    selectedChannel = channel;
    document.querySelector('#v23ChannelSubtitle').textContent = `${state.currentServer?.name || 'Servidor'} · ${channel.type === 'voice' ? 'Canal de voz' : 'Canal de texto'}`;
    document.querySelector('#v23ChannelName').value = channel.name || '';
    document.querySelector('#v23ChannelType').innerHTML = channel.type === 'voice'
      ? '<span>🔊</span><span>Canal de voz</span>'
      : '<span>#</span><span>Canal de texto</span>';
    backdrop.classList.remove('hidden');
    setTimeout(() => document.querySelector('#v23ChannelName')?.focus(), 0);
  }

  function closeModal() {
    backdrop?.classList.add('hidden');
    selectedChannel = null;
  }

  async function saveChannel() {
    if (!selectedChannel || !state.currentServer?.id) return;
    const name = document.querySelector('#v23ChannelName')?.value?.trim();
    if (!name) return toast('Informe um nome para o canal.');
    const button = backdrop.querySelector('.v23-channel-save');
    button.disabled = true;
    button.textContent = 'Salvando…';
    try {
      await API(`/api/servers/${state.currentServer.id}/channels/${selectedChannel.id}`, { method:'PUT', body:{ name } });
      await loadServers();
      state.currentServer = state.servers.find(s => s.id === state.currentServer?.id) || state.currentServer;
      renderChannels();
      if (state.currentChannel?.id === selectedChannel.id) {
        state.currentChannel = state.currentServer?.channels?.find(ch => ch.id === selectedChannel.id) || state.currentChannel;
        document.querySelector('#topTitle').textContent = state.currentChannel?.name || name;
      }
      toast('Canal atualizado.');
      closeModal();
    } catch (err) {
      toast(err.message || 'Não foi possível atualizar o canal.');
      button.disabled = false;
      button.textContent = 'Salvar alterações';
    }
  }

  async function deleteChannel() {
    if (!selectedChannel || !state.currentServer?.id) return;
    const label = selectedChannel.type === 'voice' ? 'canal de voz' : 'canal de texto';
    if (!confirm(`Excluir o ${label} “${selectedChannel.name}”?`)) return;
    try {
      await API(`/api/servers/${state.currentServer.id}/channels/${selectedChannel.id}`, { method:'DELETE' });
      const deletedId = selectedChannel.id;
      closeModal();
      await loadServers();
      state.currentServer = state.servers.find(s => s.id === state.currentServer?.id) || state.currentServer;
      if (state.currentChannel?.id === deletedId) {
        state.currentChannel = null;
        state.chatMode = null;
        document.querySelector('#chatView')?.classList.add('hidden');
        document.querySelector('#voiceView')?.classList.add('hidden');
        document.querySelector('#homeView')?.classList.remove('hidden');
      }
      renderChannels();
      toast('Canal excluído.');
    } catch (err) {
      toast(err.message || 'Não foi possível excluir o canal.');
    }
  }

  function findChannel(channelId) {
    return state.currentServer?.channels?.find(ch => ch.id === channelId) || null;
  }

  function decorateChannels() {
    if (!state.currentServer || !canManageChannels()) return;

    document.querySelectorAll('#textChannels .channel-item').forEach(button => {
      const id = button.dataset.channel;
      if (!id || button.closest('.v23-channel-row')) return;
      const row = document.createElement('div');
      row.className = 'v23-channel-row';
      button.parentNode.insertBefore(row, button);
      row.appendChild(button);
      const gear = document.createElement('button');
      gear.className = 'v23-channel-gear';
      gear.type = 'button';
      gear.title = 'Configurações do canal';
      gear.setAttribute('aria-label','Configurações do canal');
      gear.textContent = '⚙';
      gear.onclick = e => { e.preventDefault(); e.stopPropagation(); openModal(findChannel(id)); };
      row.appendChild(gear);
    });

    document.querySelectorAll('#voiceChannels .voice-channel-wrap').forEach(wrap => {
      const button = wrap.querySelector('.channel-item');
      const id = button?.dataset.channel;
      if (!id || wrap.querySelector('.v23-channel-gear')) return;
      wrap.classList.add('v23-channel-host');
      const gear = document.createElement('button');
      gear.className = 'v23-channel-gear';
      gear.type = 'button';
      gear.title = 'Configurações do canal';
      gear.setAttribute('aria-label','Configurações do canal');
      gear.textContent = '⚙';
      gear.onclick = e => { e.preventDefault(); e.stopPropagation(); openModal(findChannel(id)); };
      wrap.appendChild(gear);
    });
  }

  try {
    const original = renderChannels;
    renderChannels = function(...args) {
      const result = original.apply(this,args);
      queueMicrotask(decorateChannels);
      return result;
    };
  } catch {}

  try {
    const original = openServer;
    openServer = async function(...args) {
      const result = await original.apply(this,args);
      await refreshPermissions();
      decorateChannels();
      return result;
    };
  } catch {}

  const timer = setInterval(async () => {
    if (!state.currentServer?.id) return;
    if (permissionsServerId !== state.currentServer.id) await refreshPermissions();
    decorateChannels();
  }, 1200);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && backdrop && !backdrop.classList.contains('hidden')) closeModal();
  });

  window.addEventListener('beforeunload',() => clearInterval(timer),{once:true});
})();
