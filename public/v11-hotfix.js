(() => {
  const overlay = document.querySelector("#streamOverlay");
  const closeBtn = document.querySelector("#closeStreamOverlayBtn");
  const fullscreenBtn = document.querySelector("#browserFullscreenBtn");
  const video = document.querySelector("#streamOverlayVideo");
  if (!overlay || !closeBtn || !video) return;

  const makeInteractive = () => {
    if (overlay.classList.contains("hidden")) return;
    overlay.style.pointerEvents = "auto";
    overlay.style.visibility = "visible";
    overlay.removeAttribute("aria-hidden");
    try { overlay.inert = false; } catch {}
  };

  const makeInactive = () => {
    overlay.style.pointerEvents = "none";
    overlay.style.visibility = "hidden";
    overlay.setAttribute("aria-hidden", "true");
    try { overlay.inert = true; } catch {}
  };

  async function closeOverlayHard() {
    try {
      const fs = document.fullscreenElement;
      if (fs && (fs === overlay || overlay.contains(fs))) {
        await document.exitFullscreen();
      }
    } catch {}

    try { video.pause(); } catch {}
    try { video.srcObject = null; } catch {}

    try {
      if (typeof state !== "undefined") state.streamOverlayPeer = null;
    } catch {}

    overlay.classList.add("hidden");
    document.querySelector("#streamOverlayEmpty")?.classList.add("hidden");
    document.querySelector("#streamOverlayVolumeBar")?.classList.add("hidden");

    try {
      if (typeof closeStreamVolumeContext === "function") closeStreamVolumeContext();
    } catch {}

    makeInactive();
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";

    requestAnimationFrame(() => {
      const fallback = document.querySelector("#voiceView:not(.hidden) button, #chatView:not(.hidden) button, #app button");
      try { fallback?.focus({ preventScroll: true }); } catch {}
    });
  }

  closeBtn.onclick = async event => {
    event.preventDefault();
    event.stopPropagation();
    await closeOverlayHard();
  };

  if (fullscreenBtn) {
    fullscreenBtn.onclick = async event => {
      event.preventDefault();
      try {
        if (!document.fullscreenElement) await overlay.requestFullscreen?.();
        else await document.exitFullscreen?.();
      } catch {}
    };
  }

  document.addEventListener("fullscreenchange", () => {
    if (overlay.classList.contains("hidden")) makeInactive();
    else makeInteractive();
  });

  const observer = new MutationObserver(() => {
    if (overlay.classList.contains("hidden")) makeInactive();
    else {
      makeInteractive();
      document.querySelector("#streamOverlayVolumeBar")?.classList.add("hidden");
      const stream = video.srcObject;
      const track = stream?.getVideoTracks?.()[0];
      if (track && !track.__essenciaV11Bound) {
        track.__essenciaV11Bound = true;
        track.addEventListener("ended", closeOverlayHard, { once: true });
      }
    }
  });
  observer.observe(overlay, { attributes: true, attributeFilter: ["class"] });

  if (overlay.classList.contains("hidden")) makeInactive();
  else makeInteractive();

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (document.fullscreenElement) return;
    if (!overlay.classList.contains("hidden")) closeOverlayHard();
  });
})();
