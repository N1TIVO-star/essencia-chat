(() => {
  'use strict';

  const esc = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const statusLabel = status => {
    if (status === 'dnd') return 'Não perturbar';
    if (status === 'invisible') return 'Invisível';
    return 'Disponível';
  };

  let inviteOverlay = null;
  let previewIconUrl = '';
  let previewBannerUrl = '';

  function cleanupPreviewUrls() {
    if (previewIconUrl) URL.revokeObjectURL(previewIconUrl);
    if (previewBannerUrl) URL.revokeObjectURL(previewBannerUrl);
    previewIconUrl = '';
    previewBannerUrl = '';
  }

  function syncMeBar() {
    const bar = document.querySelector('.me-bar');
    const avatar = document.querySelector('#meAvatar');
    const meta = bar?.querySelector('.me-meta');
    if (!bar || !avatar || !meta || !state.me) return;

    bar.classList.add('v31-me-status-bar');

    const strong = meta.querySelector('strong');
    const small = meta.querySelector('small');
    if (strong) strong.textContent = state.me.nick || state.me.username || 'Usuário';
    if (small) {
      small.textContent = statusLabel(state.me.status || 'online');
      small.classList.add('v31-current-status-text');
    }

    document.querySelector('#v21MeStatusDot')?.classList.add('v31-hide-old-status');

    let picker = bar.querySelector('#v31QuickStatusPicker');
    if (!picker) {
      picker = document.createElement('div');
      picker.id = 'v31QuickStatusPicker';
      picker.className = 'v31-quick-status-picker';
      picker.innerHTML = `
        <button type="button" data-v31-status="online" title="Disponível" aria-label="Disponível"><span class="v31-status-dot online"></span></button>
        <button type="button" data-v31-status="dnd" title="Não perturbar" aria-label="Não perturbar"><span class="v31-status-dot dnd"></span></button>
        <button type="button" data-v31-status="invisible" title="Invisível" aria-label="Invisível"><span class="v31-status-dot invisible"></span></button>`;
      avatar.insertAdjacentElement('afterend', picker);
      picker.querySelectorAll('[data-v31-status]').forEach(button => {
        button.onclick = async event => {
          event.stopPropagation();
          const status = button.dataset.v31Status;
          try {
            const data = await API('/api/status', { method:'POST', body:{ status } });
            state.me = data.user;
            try { updateMeUI(); } catch {}
            syncMeBar();
            toast(`Status: ${statusLabel(status)}.`);
          } catch (error) {
            toast(error.message || 'Não foi possível alterar o status.');
          }
        };
      });
    }

    const current = state.me.status || 'online';
    picker.querySelectorAll('[data-v31-status]').forEach(button => {
      button.classList.toggle('active', button.dataset.v31Status === current);
    });
  }

  function installMeBarHook() {
    try {
      const original = updateMeUI;
      if (!original || original.__v31SocialWrapped) return;
      const wrapped = function(...args) {
        const result = original.apply(this, args);
        queueMicrotask(syncMeBar);
        return result;
      };
      wrapped.__v31SocialWrapped = true;
      updateMeUI = wrapped;
    } catch {}
  }

  function applyServerPreview(event) {
    const input = event.target;
    const file = input?.files?.[0];
    if (!file) return;

    if (input.id === 'v21IconFile') {
      if (previewIconUrl) URL.revokeObjectURL(previewIconUrl);
      previewIconUrl = URL.createObjectURL(file);
      const box = document.querySelector('.v21-server-preview-icon');
      if (box) box.innerHTML = `<img src="${previewIconUrl}" alt="Prévia do ícone">`;
    }

    if (input.id === 'v21BannerFile') {
      if (previewBannerUrl) URL.revokeObjectURL(previewBannerUrl);
      previewBannerUrl = URL.createObjectURL(file);
      const box = document.querySelector('.v21-server-preview-banner');
      if (box) box.style.backgroundImage = `url('${previewBannerUrl}')`;
    }
  }

  document.addEventListener('change', event => {
    if (event.target?.id === 'v21IconFile' || event.target?.id === 'v21BannerFile') {
      applyServerPreview(event);
    }
  });

  document.addEventListener('input', event => {
    if (event.target?.id !== 'v21ServerName') return;
    const name = event.target.value.trim() || 'Servidor';
    const label = document.querySelector('.v21-server-preview-name');
    if (label) label.textContent = name;
  });

  function closeInviteOverlay() {
    inviteOverlay?.remove();
    inviteOverlay = null;
  }

  async function openInviteOverlay() {
    if (!state.currentServer?.id) return;

    try {
      await loadFriends();
      await loadMembers();
    } catch (error) {
      toast(error.message || 'Não foi possível carregar seus amigos.');
      return;
    }

    closeInviteOverlay();

    const memberIds = new Set((state.serverMembers || []).map(member => member.id));
    const friends = (state.friends?.friends || []).filter(friend => !memberIds.has(friend.id));

    inviteOverlay = document.createElement('div');
    inviteOverlay.className = 'v31-invite-overlay';
    inviteOverlay.innerHTML = `
      <section class="v31-invite-dialog" role="dialog" aria-modal="true" aria-label="Convidar amigos">
        <button type="button" class="v31-invite-close" aria-label="Fechar">×</button>
        <h2>Convidar amigos para ${esc(state.currentServer.name || 'o servidor')}</h2>
        <p>O convite chega no privado. A pessoa só entra depois de aceitar.</p>
        <div class="v31-invite-search-wrap">
          <input id="v31InviteSearch" type="search" placeholder="Buscar amigos">
        </div>
        <div id="v31InviteFriends" class="v31-invite-friends">
          ${friends.length ? friends.map(friend => `
            <div class="v31-invite-friend" data-search="${esc(`${friend.nick || ''} ${friend.username || ''}`.toLowerCase())}">
              <img src="${avatarUrl(friend)}" alt="">
              <div class="v31-invite-friend-meta">
                <strong>${esc(friend.nick || friend.username || 'Usuário')}</strong>
                <small>${esc(friend.username || '')}</small>
              </div>
              <button type="button" data-v31-invite-user="${esc(friend.id)}">Convidar</button>
            </div>`).join('') : '<div class="v31-invite-empty">Todos os seus amigos já estão neste servidor.</div>'}
        </div>
        <div class="v31-invite-note">Convites pendentes não adicionam ninguém automaticamente.</div>
      </section>`;

    document.body.appendChild(inviteOverlay);

    inviteOverlay.querySelector('.v31-invite-close').onclick = closeInviteOverlay;
    inviteOverlay.onclick = event => { if (event.target === inviteOverlay) closeInviteOverlay(); };

    const search = inviteOverlay.querySelector('#v31InviteSearch');
    search.oninput = () => {
      const term = search.value.trim().toLowerCase();
      inviteOverlay.querySelectorAll('.v31-invite-friend').forEach(row => {
        row.hidden = !!term && !row.dataset.search.includes(term);
      });
    };

    inviteOverlay.querySelectorAll('[data-v31-invite-user]').forEach(button => {
      button.onclick = async () => {
        const userId = button.dataset.v31InviteUser;
        button.disabled = true;
        button.textContent = 'Enviando…';
        try {
          await API(`/api/servers/${state.currentServer.id}/invites`, {
            method:'POST',
            body:{ userIds:[userId] }
          });
          button.textContent = 'Enviado';
          button.classList.add('sent');
          toast('Convite enviado no privado.');
        } catch (error) {
          const message = error.message || '';
          if (/pendente|já estão|já possui|não podem/i.test(message)) {
            button.textContent = 'Pendente';
            button.classList.add('sent');
          } else {
            button.disabled = false;
            button.textContent = 'Convidar';
            toast(message || 'Não foi possível enviar o convite.');
          }
        }
      };
    });
  }

  function installInviteButton() {
    const button = document.querySelector('#inviteMemberBtn');
    if (!button || button.__v31SocialInvite) return;
    button.__v31SocialInvite = true;
    button.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      openInviteOverlay();
    };
  }

  function polishInviteCards() {
    document.querySelectorAll('.v21-invite-card').forEach(card => {
      card.classList.add('v31-invite-card-polished');
      const heading = card.querySelector('.v21-invite-card-head strong');
      if (heading) heading.textContent = 'Você recebeu um convite';
      const accept = card.querySelector('.v21-invite-accept');
      if (accept) accept.textContent = 'Entrar no servidor';
      const reject = card.querySelector('.v21-invite-reject');
      if (reject) reject.textContent = 'Recusar';
    });
  }

  function syncUI() {
    installMeBarHook();
    syncMeBar();
    installInviteButton();
    polishInviteCards();

    const isolatedAdd = document.querySelector('#addFriendTopBtn');
    if (isolatedAdd) isolatedAdd.classList.add('v31-remove-isolated-add');
  }

  installMeBarHook();
  syncUI();
  const timer = setInterval(syncUI, 1200);

  window.addEventListener('beforeunload', () => {
    clearInterval(timer);
    cleanupPreviewUrls();
  }, { once:true });
})();
