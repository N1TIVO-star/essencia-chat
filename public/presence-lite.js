(() => {
  let onlineIds = new Set();
  let installedSocket = null;
  let attachTimer = null;

  function userOnline(userId) {
    return !!userId && (userId === state.me?.id || onlineIds.has(userId));
  }

  function applyFriendsPresence() {
    const friends = state.friends?.friends || [];

    const homeRows = [...document.querySelectorAll('#homeContent .person-row')]
      .filter(row => row.querySelector('[data-message]'));

    friends.forEach((friend, index) => {
      const row = homeRows[index];
      if (!row) return;
      const online = userOnline(friend.id);
      row.dataset.userId = friend.id;
      row.classList.toggle('presence-online-row', online);
      row.classList.toggle('presence-offline-row', !online);

      const dot = row.querySelector('.status-dot');
      if (dot) dot.classList.toggle('presence-offline-dot', !online);

      const small = row.querySelector('.person-meta small');
      if (small) {
        let badge = small.querySelector('.presence-label');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'presence-label';
          small.appendChild(badge);
        }
        badge.textContent = online ? ' • Online' : ' • Offline';
        badge.classList.toggle('online', online);
        badge.classList.toggle('offline', !online);
      }
    });

    const dmButtons = [...document.querySelectorAll('#dmFriends .dm-item')];
    friends.forEach((friend, index) => {
      const button = dmButtons[index];
      if (!button) return;
      const online = userOnline(friend.id);
      button.classList.toggle('presence-offline-row', !online);
      let dot = button.querySelector('.dm-presence-lite');
      if (!dot) {
        dot = document.createElement('i');
        dot.className = 'dm-presence-lite';
        button.appendChild(dot);
      }
      dot.classList.toggle('offline', !online);
      button.title = `${friend.nick || friend.username} • ${online ? 'Online' : 'Offline'}`;
    });
  }

  function applyMembersPresence() {
    for (const member of state.serverMembers || []) {
      const row = document.querySelector(`#membersList .member-row[data-member-id="${CSS.escape(member.id)}"]`);
      if (!row) continue;
      const online = userOnline(member.id);
      row.classList.toggle('member-presence-online', online);
      row.classList.toggle('member-presence-offline', !online);
      const dot = row.querySelector('.member-presence');
      if (dot) dot.classList.toggle('presence-offline-dot', !online);
      row.title = `${member.nick || member.username} • ${online ? 'Online' : 'Offline'}`;
    }
  }

  function applyPresence() {
    applyFriendsPresence();
    applyMembersPresence();
  }

  async function refreshPresence() {
    if (!state.token) return;
    try {
      const data = await API('/api/presence');
      onlineIds = new Set(data.onlineUserIds || []);
      applyPresence();
    } catch {}
  }

  const originalRenderHomeContent = renderHomeContent;
  renderHomeContent = function(...args) {
    const result = originalRenderHomeContent.apply(this, args);
    queueMicrotask(applyFriendsPresence);
    return result;
  };

  const originalRenderDmFriends = renderDmFriends;
  renderDmFriends = function(...args) {
    const result = originalRenderDmFriends.apply(this, args);
    queueMicrotask(applyFriendsPresence);
    return result;
  };

  const originalRenderMembersList = renderMembersList;
  renderMembersList = function(...args) {
    const result = originalRenderMembersList.apply(this, args);
    queueMicrotask(applyMembersPresence);
    return result;
  };

  function attachSocket() {
    if (!state.socket || state.socket === installedSocket) return !!installedSocket;
    installedSocket = state.socket;
    installedSocket.on('presence:update', payload => {
      if (Array.isArray(payload?.onlineUserIds)) {
        onlineIds = new Set(payload.onlineUserIds);
        applyPresence();
      } else {
        refreshPresence();
      }
    });
    installedSocket.on('connect', refreshPresence);
    refreshPresence();
    return true;
  }

  attachTimer = setInterval(() => {
    if (attachSocket()) {
      clearInterval(attachTimer);
      attachTimer = null;
    }
  }, 250);

  window.addEventListener('beforeunload', () => {
    if (attachTimer) clearInterval(attachTimer);
  }, { once: true });
})();
