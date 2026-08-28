(() => {
  'use strict';

  const PERMISSIONS = [
    ['manageMessages','Gerenciar mensagens','Excluir mensagens de outros membros.'],
    ['manageChannels','Gerenciar canais','Criar, editar e excluir canais.'],
    ['manageRoles','Gerenciar cargos','Criar, editar, excluir e atribuir cargos.'],
    ['manageMembers','Gerenciar membros','Silenciar, expulsar e banir membros.']
  ];

  let data = null;
  let selectedRoleId = null;

  const esc = value => {
    const d = document.createElement('div');
    d.textContent = String(value ?? '');
    return d.innerHTML;
  };

  function canManageRoles() {
    return !!data?.isOwner || !!data?.permissions?.manageRoles;
  }

  function hideRemovedTabs() {
    document.querySelectorAll('.v21-admin-nav [data-tab="channels"], .v21-admin-nav [data-tab="invites"]').forEach(el => el.remove());
  }

  async function loadRolesData() {
    if (!state.currentServer?.id) throw new Error('Servidor não selecionado.');
    data = await API(`/api/servers/${state.currentServer.id}/admin`);
    if (!selectedRoleId || !data.roles?.some(r => r.id === selectedRoleId)) {
      selectedRoleId = data.roles?.[0]?.id || null;
    }
    return data;
  }

  function roleEditor(role) {
    if (!role) return '<div class="v19-role-empty">Selecione um cargo ou crie o primeiro.</div>';
    const editable = canManageRoles();
    return `
      <div class="v19-field"><label>NOME DO CARGO</label><input id="v24RoleName" class="v19-input" maxlength="32" value="${esc(role.name || '')}" ${editable?'':'disabled'}></div>
      <div class="v19-field"><label>COR DO CARGO</label><div class="v19-color-row"><input id="v24RoleColor" class="v19-color-input" type="color" value="${esc(role.color || '#745cff')}" ${editable?'':'disabled'}><input class="v19-input" value="${esc(role.color || '#745cff')}" disabled></div></div>
      <div class="v19-field"><label>PERMISSÕES</label><div class="v19-permissions">
        ${PERMISSIONS.map(([key,name,desc]) => `<label class="v19-permission"><input data-v24-perm="${key}" type="checkbox" ${role.permissions?.[key]?'checked':''} ${editable?'':'disabled'}><div><strong>${name}</strong><small>${desc}</small></div></label>`).join('')}
      </div></div>
      ${editable ? `<div class="v19-actions"><button id="v24SaveRole" class="v19-primary">Salvar cargo</button><button id="v24DeleteRole" class="v19-danger">Excluir cargo</button></div>` : ''}`;
  }

  function roleBadges(roleIds = []) {
    return (data?.roles || []).filter(r => roleIds.includes(r.id)).map(r => `<span class="v19-role-badge"><i style="background:${esc(r.color || '#745cff')}"></i>${esc(r.name)}</span>`).join('');
  }

  function renderRoles() {
    const box = document.querySelector('#v21AdminContent');
    if (!box || !data) return;
    const editable = canManageRoles();
    const role = data.roles?.find(r => r.id === selectedRoleId) || null;

    box.innerHTML = `
      <h2>Cargos</h2>
      <p>Crie cargos, escolha as permissões e defina quais membros recebem cada cargo.</p>
      <div class="v24-role-note">O dono do servidor sempre mantém todas as permissões. Um cargo de ADM pode receber permissões de mensagens, canais, cargos e membros.</div>
      <div class="v24-roles-wrap">
        <div class="v19-role-layout">
          <div class="v19-role-list">
            <div class="v19-role-list-head"><strong>CARGOS</strong>${editable?'<button id="v24NewRole" type="button">+</button>':''}</div>
            <div>
              ${(data.roles || []).map(r => `<button class="v19-role-item ${r.id===selectedRoleId?'active':''}" data-v24-role="${esc(r.id)}"><i class="v19-role-dot" style="background:${esc(r.color || '#745cff')}"></i><span>${esc(r.name)}</span></button>`).join('') || '<div class="v19-role-empty" style="min-height:170px">Nenhum cargo criado.</div>'}
            </div>
          </div>
          <div class="v19-role-editor">${roleEditor(role)}</div>
        </div>

        <div class="v24-role-members">
          <h3>Membros e cargos</h3>
          <p>Atribua um ou mais cargos para cada membro.</p>
          <div>
            ${(data.members || []).map(member => `
              <div class="v24-role-member" data-v24-member="${esc(member.id)}">
                <img src="${avatarUrl(member)}" alt="">
                <div class="v24-role-member-info">
                  <strong>${esc(member.nick || member.username)} ${member.isOwner?'👑':''}</strong>
                  <small>@${esc(member.username)}</small>
                  <div class="v19-role-badges" style="margin-top:5px">${member.isOwner?'<span class="v19-role-badge">Dono</span>':(roleBadges(member.roleIds)||'<span style="font-size:9px;color:var(--v17-muted)">Sem cargo</span>')}</div>
                </div>
                ${editable && !member.isOwner ? '<button data-v24-edit-member>Editar cargos</button>' : ''}
              </div>`).join('')}
          </div>
        </div>
      </div>`;

    box.querySelectorAll('[data-v24-role]').forEach(btn => btn.onclick = () => { selectedRoleId = btn.dataset.v24Role; renderRoles(); });
    box.querySelector('#v24NewRole')?.addEventListener('click', createRole);
    box.querySelector('#v24SaveRole')?.addEventListener('click', saveRole);
    box.querySelector('#v24DeleteRole')?.addEventListener('click', deleteRole);
    box.querySelectorAll('[data-v24-edit-member]').forEach(btn => {
      btn.onclick = () => openMemberEditor(btn.closest('[data-v24-member]')?.dataset.v24Member);
    });
  }

  async function refresh() {
    await loadRolesData();
    renderRoles();
    try { await loadMembers(); } catch {}
  }

  async function createRole() {
    if (!canManageRoles()) return;
    try {
      const result = await API(`/api/servers/${state.currentServer.id}/roles`, { method:'POST', body:{ name:'Novo cargo', color:'#745cff', permissions:{} } });
      selectedRoleId = result.role.id;
      await refresh();
      toast('Cargo criado.');
    } catch (err) { toast(err.message); }
  }

  function readPermissions() {
    const permissions = {};
    document.querySelectorAll('#v21AdminContent [data-v24-perm]').forEach(input => permissions[input.dataset.v24Perm] = input.checked);
    return permissions;
  }

  async function saveRole() {
    if (!selectedRoleId || !canManageRoles()) return;
    try {
      await API(`/api/servers/${state.currentServer.id}/roles/${selectedRoleId}`, {
        method:'PUT',
        body:{ name:document.querySelector('#v24RoleName')?.value, color:document.querySelector('#v24RoleColor')?.value, permissions:readPermissions() }
      });
      await refresh();
      toast('Cargo salvo.');
    } catch (err) { toast(err.message); }
  }

  async function deleteRole() {
    const role = data?.roles?.find(r => r.id === selectedRoleId);
    if (!role || !confirm(`Excluir o cargo “${role.name}”?`)) return;
    try {
      await API(`/api/servers/${state.currentServer.id}/roles/${selectedRoleId}`, { method:'DELETE' });
      selectedRoleId = null;
      await refresh();
      toast('Cargo excluído.');
    } catch (err) { toast(err.message); }
  }

  function openMemberEditor(userId) {
    const member = data?.members?.find(m => m.id === userId);
    const row = document.querySelector(`[data-v24-member="${CSS.escape(userId)}"]`);
    if (!member || !row) return;
    document.querySelectorAll('.v24-role-editor-inline').forEach(el => el.remove());
    const editor = document.createElement('div');
    editor.className = 'v24-role-editor-inline';
    editor.innerHTML = `
      <strong>Cargos de ${esc(member.nick || member.username)}</strong>
      <div class="v24-role-checks">
        ${(data.roles || []).map(role => `<label class="v24-role-check"><input type="checkbox" data-v24-role-check="${esc(role.id)}" ${(member.roleIds || []).includes(role.id)?'checked':''}><i class="v19-role-dot" style="background:${esc(role.color || '#745cff')}"></i>${esc(role.name)}</label>`).join('') || '<span style="font-size:10px;color:var(--v17-muted)">Crie um cargo primeiro.</span>'}
      </div>
      <div class="v19-actions"><button class="v19-primary" data-v24-save-member>Salvar cargos</button><button class="v19-secondary" data-v24-cancel-member>Cancelar</button></div>`;
    row.after(editor);
    editor.querySelector('[data-v24-cancel-member]').onclick = () => editor.remove();
    editor.querySelector('[data-v24-save-member]').onclick = async () => {
      const roleIds = [...editor.querySelectorAll('[data-v24-role-check]:checked')].map(input => input.dataset.v24RoleCheck);
      try {
        await API(`/api/servers/${state.currentServer.id}/members/${userId}/roles`, { method:'PUT', body:{ roleIds } });
        await refresh();
        toast('Cargos do membro atualizados.');
      } catch (err) { toast(err.message); }
    };
  }

  async function openRolesInsideV21() {
    try {
      hideRemovedTabs();
      await loadRolesData();
      document.querySelectorAll('.v21-admin-nav [data-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === 'roles'));
      renderRoles();
    } catch (err) { toast(err.message || 'Não foi possível abrir os cargos.'); }
  }

  // Intercepta antes do handler V21 antigo, que fechava a janela e reabria outra configuração.
  document.addEventListener('click', event => {
    const roles = event.target.closest('.v21-admin-nav [data-tab="roles"]');
    if (!roles) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openRolesInsideV21();
  }, true);

  // Remove Canais e Convites assim que a janela de configuração for criada.
  const observer = new MutationObserver(() => hideRemovedTabs());
  observer.observe(document.documentElement, { childList:true, subtree:true });
  hideRemovedTabs();
})();
