(() => {
  'use strict';

  const PERMISSIONS = [
    ['manageMessages','Gerenciar mensagens','Excluir mensagens de outros membros.'],
    ['manageChannels','Gerenciar canais','Criar canais de texto e voz.'],
    ['manageRoles','Gerenciar cargos','Criar, editar, excluir e atribuir cargos.'],
    ['manageMembers','Gerenciar membros','Permissão administrativa para membros (base para próximas ações).']
  ];

  let adminData = null;
  let adminServerId = null;
  let selectedRoleId = null;
  let activeTab = 'overview';
  let installedSocket = null;

  function esc(value) {
    const d = document.createElement('div');
    d.textContent = String(value ?? '');
    return d.innerHTML;
  }

  function hasPermission(key) {
    if (!adminData) return false;
    return !!adminData.isOwner || !!adminData.permissions?.[key];
  }

  function buildShell() {
    if (document.querySelector('#v19AdminBackdrop')) return;
    const backdrop = document.createElement('div');
    backdrop.id = 'v19AdminBackdrop';
    backdrop.className = 'v19-admin-backdrop hidden';
    backdrop.innerHTML = `
      <section class="v19-admin-modal" role="dialog" aria-modal="true" aria-label="Configurações do servidor">
        <aside class="v19-admin-nav">
          <h3>Servidor</h3>
          <button class="v19-admin-tab active" data-tab="overview">🏠 Visão geral</button>
          <button class="v19-admin-tab" data-tab="roles">🛡️ Cargos</button>
          <button class="v19-admin-tab" data-tab="members">👥 Membros</button>
        </aside>
        <main class="v19-admin-main">
          <button class="v19-admin-close" type="button">×</button>
          <div id="v19AdminContent"></div>
        </main>
      </section>`;
    document.body.appendChild(backdrop);

    backdrop.querySelector('.v19-admin-close').onclick = closeAdmin;
    backdrop.onclick = e => { if (e.target === backdrop) closeAdmin(); };
    backdrop.querySelectorAll('.v19-admin-tab').forEach(btn => {
      btn.onclick = () => selectTab(btn.dataset.tab);
    });
  }

  async function loadAdmin(serverId = state.currentServer?.id) {
    if (!serverId) return null;
    const data = await API(`/api/servers/${serverId}/admin`);
    adminData = data;
    adminServerId = serverId;
    state.v19ServerPermissions ||= {};
    state.v19ServerPermissions[serverId] = data.permissions || {};
    return data;
  }

  async function openAdmin(tab = 'overview') {
    if (!state.currentServer?.id) return;
    buildShell();
    try {
      await loadAdmin(state.currentServer.id);
    } catch (err) {
      toast(err.message || 'Não foi possível abrir as configurações do servidor.');
      return;
    }
    document.querySelector('#v19AdminBackdrop').classList.remove('hidden');
    selectTab(tab);
  }

  function closeAdmin() {
    document.querySelector('#v19AdminBackdrop')?.classList.add('hidden');
  }

  function selectTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.v19-admin-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    if (tab === 'roles') renderRoles();
    else if (tab === 'members') renderMembers();
    else renderOverview();
  }

  function renderOverview() {
    const box = document.querySelector('#v19AdminContent');
    if (!box || !adminData) return;
    const p = adminData.permissions || {};
    const allowedCount = Object.values(p).filter(Boolean).length;
    box.innerHTML = `
      <h2>${esc(adminData.server?.name || 'Servidor')}</h2>
      <p>Central de administração do servidor.</p>
      <div class="v19-summary-grid">
        <div class="v19-summary-card"><span>Membros</span><strong>${adminData.members?.length || 0}</strong></div>
        <div class="v19-summary-card"><span>Cargos</span><strong>${adminData.roles?.length || 0}</strong></div>
        <div class="v19-summary-card"><span>Suas permissões</span><strong>${adminData.isOwner ? 'Dono' : `${allowedCount}/4`}</strong></div>
      </div>
      <div class="v19-field">
        <label>PERMISSÕES ATIVAS PARA VOCÊ</label>
        <div class="v19-permissions">
          ${PERMISSIONS.map(([key,name,desc]) => `<div class="v19-permission"><input type="checkbox" ${adminData.isOwner || p[key] ? 'checked' : ''} disabled><div><strong>${name}</strong><small>${desc}</small></div></div>`).join('')}
        </div>
      </div>`;
  }

  function renderRoles() {
    const box = document.querySelector('#v19AdminContent');
    if (!box || !adminData) return;
    const canManage = hasPermission('manageRoles');
    if (!selectedRoleId && adminData.roles?.length) selectedRoleId = adminData.roles[0].id;
    const role = adminData.roles?.find(r => r.id === selectedRoleId) || null;

    box.innerHTML = `
      <h2>Cargos</h2>
      <p>Crie cargos e defina o que cada grupo de pessoas pode administrar.</p>
      <div class="v19-role-layout">
        <div class="v19-role-list">
          <div class="v19-role-list-head"><strong>CARGOS</strong>${canManage ? '<button id="v19NewRole" type="button">+</button>' : ''}</div>
          <div id="v19RoleItems">
            ${(adminData.roles || []).map(r => `<button class="v19-role-item ${r.id === selectedRoleId ? 'active' : ''}" data-role-id="${esc(r.id)}"><i class="v19-role-dot" style="background:${esc(r.color || '#745cff')}"></i><span>${esc(r.name)}</span></button>`).join('') || '<div class="v19-role-empty" style="min-height:180px">Nenhum cargo criado.</div>'}
          </div>
        </div>
        <div class="v19-role-editor">
          ${role ? roleEditorHtml(role, canManage) : '<div class="v19-role-empty">Selecione um cargo ou crie o primeiro.</div>'}
        </div>
      </div>`;

    box.querySelectorAll('[data-role-id]').forEach(btn => {
      btn.onclick = () => { selectedRoleId = btn.dataset.roleId; renderRoles(); };
    });
    box.querySelector('#v19NewRole')?.addEventListener('click', createRole);
    box.querySelector('#v19SaveRole')?.addEventListener('click', saveRole);
    box.querySelector('#v19DeleteRole')?.addEventListener('click', deleteRole);
  }

  function roleEditorHtml(role, canManage) {
    return `
      <div class="v19-field"><label>NOME DO CARGO</label><input id="v19RoleName" class="v19-input" maxlength="32" value="${esc(role.name || '')}" ${canManage ? '' : 'disabled'}></div>
      <div class="v19-field"><label>COR DO CARGO</label><div class="v19-color-row"><input id="v19RoleColor" class="v19-color-input" type="color" value="${esc(role.color || '#745cff')}" ${canManage ? '' : 'disabled'}><input id="v19RoleColorText" class="v19-input" value="${esc(role.color || '#745cff')}" disabled></div></div>
      <div class="v19-field"><label>PERMISSÕES</label><div class="v19-permissions">
        ${PERMISSIONS.map(([key,name,desc]) => `<label class="v19-permission"><input data-perm="${key}" type="checkbox" ${role.permissions?.[key] ? 'checked' : ''} ${canManage ? '' : 'disabled'}><div><strong>${name}</strong><small>${desc}</small></div></label>`).join('')}
      </div></div>
      ${canManage ? `<div class="v19-actions"><button id="v19SaveRole" class="v19-primary">Salvar cargo</button><button id="v19DeleteRole" class="v19-danger">Excluir cargo</button></div>` : ''}`;
  }

  async function createRole() {
    if (!adminServerId || !hasPermission('manageRoles')) return;
    try {
      const data = await API(`/api/servers/${adminServerId}/roles`, { method:'POST', body:{ name:'Novo cargo', color:'#745cff', permissions:{} } });
      selectedRoleId = data.role.id;
      await refreshAdmin();
      renderRoles();
      toast('Cargo criado.');
    } catch (err) { toast(err.message); }
  }

  function readRolePermissions() {
    const permissions = {};
    document.querySelectorAll('#v19AdminContent [data-perm]').forEach(input => permissions[input.dataset.perm] = input.checked);
    return permissions;
  }

  async function saveRole() {
    if (!selectedRoleId || !hasPermission('manageRoles')) return;
    try {
      await API(`/api/servers/${adminServerId}/roles/${selectedRoleId}`, {
        method:'PUT',
        body:{ name:document.querySelector('#v19RoleName')?.value, color:document.querySelector('#v19RoleColor')?.value, permissions:readRolePermissions() }
      });
      await refreshAdmin();
      renderRoles();
      toast('Cargo salvo.');
    } catch (err) { toast(err.message); }
  }

  async function deleteRole() {
    const role = adminData?.roles?.find(r => r.id === selectedRoleId);
    if (!role || !confirm(`Excluir o cargo “${role.name}”?`)) return;
    try {
      await API(`/api/servers/${adminServerId}/roles/${selectedRoleId}`, { method:'DELETE' });
      selectedRoleId = null;
      await refreshAdmin();
      renderRoles();
      toast('Cargo excluído.');
    } catch (err) { toast(err.message); }
  }

  function roleBadges(roleIds = []) {
    return (adminData?.roles || []).filter(role => roleIds.includes(role.id)).map(role => `<span class="v19-role-badge"><i style="background:${esc(role.color || '#745cff')}"></i>${esc(role.name)}</span>`).join('');
  }

  function renderMembers() {
    const box = document.querySelector('#v19AdminContent');
    if (!box || !adminData) return;
    const canManageRoles = hasPermission('manageRoles');
    box.innerHTML = `
      <h2>Membros</h2>
      <p>Atribua um ou mais cargos para cada pessoa do servidor.</p>
      <div class="v19-member-list">
        ${(adminData.members || []).map(member => `
          <div class="v19-member-card" data-member-id="${esc(member.id)}">
            <img src="${avatarUrl(member)}" alt="">
            <div class="v19-member-info">
              <strong>${esc(member.nick || member.username)} ${member.isOwner ? '👑' : ''}</strong>
              <small>@${esc(member.username)}</small>
              <div class="v19-role-badges">${member.isOwner ? '<span class="v19-role-badge">Dono</span>' : (roleBadges(member.roleIds) || '<span style="font-size:9px;color:var(--v17-muted)">Sem cargo</span>')}</div>
            </div>
            ${canManageRoles && !member.isOwner ? '<div class="v19-member-actions"><button data-edit-member>Editar cargos</button></div>' : ''}
          </div>`).join('')}
      </div>`;

    box.querySelectorAll('[data-edit-member]').forEach(btn => {
      btn.onclick = () => openMemberRoleEditor(btn.closest('[data-member-id]')?.dataset.memberId);
    });
  }

  function openMemberRoleEditor(userId) {
    const member = adminData?.members?.find(m => m.id === userId);
    if (!member) return;
    const card = document.querySelector(`.v19-member-card[data-member-id="${userId}"]`);
    document.querySelectorAll('.v19-role-assign').forEach(el => el.remove());
    const editor = document.createElement('div');
    editor.className = 'v19-role-assign';
    editor.innerHTML = `<h4>Cargos de ${esc(member.nick || member.username)}</h4><div class="v19-role-checks">
      ${(adminData.roles || []).map(role => `<label class="v19-role-check"><input type="checkbox" data-role-check="${esc(role.id)}" ${(member.roleIds || []).includes(role.id) ? 'checked' : ''}><i class="v19-role-dot" style="background:${esc(role.color || '#745cff')}"></i>${esc(role.name)}</label>`).join('') || '<span style="font-size:11px;color:var(--v17-muted)">Crie um cargo primeiro.</span>'}
    </div><div class="v19-actions"><button class="v19-primary" data-save-member-roles>Salvar cargos</button><button class="v19-secondary" data-cancel-member-roles>Cancelar</button></div>`;
    card.after(editor);
    editor.querySelector('[data-cancel-member-roles]').onclick = () => editor.remove();
    editor.querySelector('[data-save-member-roles]').onclick = async () => {
      const roleIds = [...editor.querySelectorAll('[data-role-check]:checked')].map(input => input.dataset.roleCheck);
      try {
        await API(`/api/servers/${adminServerId}/members/${userId}/roles`, { method:'PUT', body:{ roleIds } });
        await refreshAdmin();
        renderMembers();
        try { await loadMembers(); } catch {}
        toast('Cargos atualizados.');
      } catch (err) { toast(err.message); }
    };
  }

  async function refreshAdmin() {
    if (!adminServerId) return;
    await loadAdmin(adminServerId);
    try { await loadServers(); } catch {}
    if (state.currentServer?.id === adminServerId) state.currentServer = state.servers.find(s => s.id === adminServerId) || state.currentServer;
  }

  async function installServerButton() {
    const head = document.querySelector('.sidebar-head-actions');
    if (!head || !state.currentServer) return;
    let button = document.querySelector('#v19ServerSettingsBtn');
    if (!button) {
      button = document.createElement('button');
      button.id = 'v19ServerSettingsBtn';
      button.className = 'v19-server-settings-btn';
      button.title = 'Configurações do servidor';
      button.textContent = '⚙';
      button.onclick = () => openAdmin('overview');
      head.insertBefore(button, document.querySelector('#mobileDrawerCloseBtn'));
    }
    button.classList.toggle('hidden', !state.currentServer);
    try {
      const data = await loadAdmin(state.currentServer.id);
      const canAdmin = data.isOwner || Object.values(data.permissions || {}).some(Boolean);
      button.classList.toggle('hidden', !canAdmin);
    } catch { button.classList.add('hidden'); }
  }

  function decorateInlineRoles() {
    if (!adminData || adminServerId !== state.currentServer?.id) return;
    for (const member of state.serverMembers || []) {
      const row = document.querySelector(`.member-row[data-member-id="${member.id}"]`);
      if (!row) continue;
      row.querySelector('.v19-member-inline-roles')?.remove();
      const sourceMember = adminData.members?.find(m => m.id === member.id);
      if (!sourceMember?.roleIds?.length) continue;
      const wrap = document.createElement('div');
      wrap.className = 'v19-member-inline-roles';
      for (const role of adminData.roles.filter(r => sourceMember.roleIds.includes(r.id)).slice(0,3)) {
        const chip = document.createElement('span');
        chip.className = 'v19-mini-role';
        chip.innerHTML = `<i style="background:${esc(role.color || '#745cff')}"></i>${esc(role.name)}`;
        wrap.appendChild(chip);
      }
      row.querySelector('.member-meta')?.appendChild(wrap);
    }
  }

  // Permite que o cargo Gerenciar mensagens enxergue a opção Excluir no menu da V18.
  document.addEventListener('click', e => {
    const more = e.target.closest('.v18-message-more');
    if (!more || state.chatMode !== 'server') return;
    const row = more.closest('.msg');
    const message = row?.__v18Message;
    if (!message || message.userId === state.me?.id || state.currentServer?.ownerId === state.me?.id) return;
    const perms = state.v19ServerPermissions?.[state.currentServer?.id];
    if (!perms?.manageMessages) return;
    setTimeout(() => {
      const menu = document.querySelector('#v18MessageMenu');
      if (!menu || [...menu.querySelectorAll('button')].some(btn => btn.textContent.includes('Excluir mensagem'))) return;
      const hr = document.createElement('hr');
      const button = document.createElement('button');
      button.className = 'danger';
      button.innerHTML = '<span>🗑</span><span>Excluir mensagem</span>';
      button.onclick = () => {
        menu.remove();
        if (!confirm('Excluir esta mensagem?')) return;
        state.socket?.emit('message:delete',{ serverId:state.currentServer.id, channelId:state.currentChannel.id, messageId:message.id }, ack => {
          if (!ack?.ok) toast(ack?.error || 'Não foi possível excluir a mensagem.');
        });
      };
      menu.append(hr,button);
    },0);
  }, true);

  function attachSocket() {
    const socket = state.socket;
    if (!socket || socket === installedSocket) return;
    installedSocket = socket;
    socket.on('server:roles-update', async ({serverId}) => {
      if (state.currentServer?.id === serverId) {
        try {
          await loadAdmin(serverId);
          await loadMembers();
          decorateInlineRoles();
          if (!document.querySelector('#v19AdminBackdrop')?.classList.contains('hidden')) selectTab(activeTab);
        } catch {}
      }
    });
  }

  try {
    const originalOpenServer = openServer;
    openServer = async function(...args) {
      const result = await originalOpenServer.apply(this,args);
      await installServerButton();
      decorateInlineRoles();
      return result;
    };
  } catch {}

  try {
    const originalLoadMembers = loadMembers;
    loadMembers = async function(...args) {
      const result = await originalLoadMembers.apply(this,args);
      try {
        if (state.currentServer?.id) await loadAdmin(state.currentServer.id);
      } catch {}
      decorateInlineRoles();
      return result;
    };
  } catch {}

  buildShell();
  const timer = setInterval(() => {
    attachSocket();
    if (state.currentServer) installServerButton();
    else document.querySelector('#v19ServerSettingsBtn')?.classList.add('hidden');
  }, 1500);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.querySelector('#v19AdminBackdrop')?.classList.contains('hidden')) closeAdmin();
  });
  window.addEventListener('beforeunload',() => clearInterval(timer),{once:true});
})();
