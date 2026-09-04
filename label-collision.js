(() => {
  const LABEL_SELECTOR = [
    'text.country-label',
    'text.reference-city-label',
    'text.reference-river-label',
    'text.reference-mountain-label',
    'text.event-label',
    'text.map-name'
  ].join(',');

  const PADDING = 4;
  const STEP = 10;
  const MAX_RADIUS = 220;
  let frame = 0;
  let running = false;

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0;
  }

  function priority(el) {
    if (el.classList.contains('country-label')) return 0;
    if (el.closest?.('.capital-city')) return 1;
    if (el.classList.contains('reference-city-label')) return 2;
    if (el.classList.contains('event-label')) return 3;
    if (el.classList.contains('reference-mountain-label')) return 4;
    if (el.classList.contains('reference-river-label')) return 5;
    return 6;
  }

  function paddedRect(rect) {
    return {
      left: rect.left - PADDING,
      right: rect.right + PADDING,
      top: rect.top - PADDING,
      bottom: rect.bottom + PADDING
    };
  }

  function overlaps(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function collides(rect, placed) {
    for (let i = 0; i < placed.length; i++) if (overlaps(rect, placed[i])) return true;
    return false;
  }

  function candidateOffsets() {
    const out = [[0, 0]];
    for (let r = STEP; r <= MAX_RADIUS; r += STEP) {
      const n = Math.max(8, Math.round((2 * Math.PI * r) / STEP));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        out.push([Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)]);
      }
    }
    return out;
  }

  const OFFSETS = candidateOffsets();

  function resetLabel(el) {
    el.style.translate = '';
    el.style.removeProperty('--collision-hidden');
    if (el.dataset.collisionHidden === '1') {
      el.style.visibility = '';
      delete el.dataset.collisionHidden;
    }
  }

  function placeLabel(el, placed) {
    resetLabel(el);
    if (!isVisible(el)) return;

    for (const [dx, dy] of OFFSETS) {
      el.style.translate = dx || dy ? `${dx}px ${dy}px` : '';
      const rect = paddedRect(el.getBoundingClientRect());
      if (rect.width <= 0 || rect.height <= 0) return;
      if (!collides(rect, placed)) {
        placed.push(rect);
        return;
      }
    }

    // If the map is too dense to fit everything even after searching a wide
    // radius, hide the lowest-priority label rather than allowing overlap.
    el.style.translate = '';
    el.style.visibility = 'hidden';
    el.dataset.collisionHidden = '1';
  }

  function run() {
    frame = 0;
    if (running) return;
    running = true;
    try {
      const labels = Array.from(new Set(document.querySelectorAll(LABEL_SELECTOR)))
        .filter(isVisible)
        .sort((a, b) => priority(a) - priority(b));
      const placed = [];
      for (const label of labels) placeLabel(label, placed);
    } finally {
      running = false;
    }
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(run);
  }

  const observer = new MutationObserver(mutations => {
    if (running) return;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' || mutation.type === 'characterData') {
        schedule();
        return;
      }
      if (mutation.type === 'attributes') {
        const target = mutation.target;
        if (target?.matches?.(LABEL_SELECTOR) || target?.id === 'viewport' || target?.closest?.('#viewport')) {
          schedule();
          return;
        }
      }
    }
  });

  observer.observe(document.getElementById('worldMap') || document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['x', 'y', 'transform', 'class', 'display', 'visibility']
  });

  window.addEventListener('resize', schedule, { passive: true });
  document.getElementById('showNames')?.addEventListener('change', schedule);
  document.getElementById('showCountryNames')?.addEventListener('change', schedule);
  document.getElementById('showCities')?.addEventListener('change', schedule);
  document.getElementById('showRivers')?.addEventListener('change', schedule);
  document.getElementById('showMountains')?.addEventListener('change', schedule);

  window.historyMapLabelCollision = { schedule, run };
  schedule();
})();
