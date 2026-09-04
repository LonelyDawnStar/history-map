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
  const STEP = 12;
  const MAX_RADIUS = 216;
  const GRID = 96;
  const IDLE_DELAY = 90;

  let timer = 0;
  let running = false;

  function mapNamesEnabled() {
    const toggle = document.getElementById('showNames');
    return toggle?.checked !== false && !document.body.classList.contains('hide-map-names');
  }

  function isMapName(el) {
    return el.classList.contains('map-name') ||
      el.classList.contains('reference-city-label') ||
      el.classList.contains('reference-river-label') ||
      el.classList.contains('reference-mountain-label');
  }

  function isVisible(el, namesEnabled = mapNamesEnabled()) {
    if (!el || !el.isConnected) return false;
    // When the master place-name switch is off, exclude place names before any
    // measurement/collision work. They must not move or hide country labels.
    if (!namesEnabled && isMapName(el) && !el.classList.contains('country-label')) return false;
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

  function offsets() {
    const out = [[0, 0]];
    for (let r = STEP; r <= MAX_RADIUS; r += STEP) {
      const n = Math.max(8, Math.ceil((Math.PI * 2 * r) / 24));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        out.push([Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)]);
      }
    }
    return out;
  }
  const OFFSETS = offsets();

  function rectMoved(base, dx, dy) {
    return { left: base.left + dx - PADDING, right: base.right + dx + PADDING, top: base.top + dy - PADDING, bottom: base.bottom + dy + PADDING };
  }

  function overlaps(a, b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }

  function cellsFor(rect) {
    const x0 = Math.floor(rect.left / GRID), x1 = Math.floor(rect.right / GRID);
    const y0 = Math.floor(rect.top / GRID), y1 = Math.floor(rect.bottom / GRID);
    const keys = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) keys.push(`${x}:${y}`);
    return keys;
  }

  function collides(rect, grid) {
    const checked = new Set();
    for (const key of cellsFor(rect)) {
      const bucket = grid.get(key);
      if (!bucket) continue;
      for (const placed of bucket) {
        if (checked.has(placed)) continue;
        checked.add(placed);
        if (overlaps(rect, placed)) return true;
      }
    }
    return false;
  }

  function addToGrid(rect, grid) {
    for (const key of cellsFor(rect)) {
      let bucket = grid.get(key);
      if (!bucket) grid.set(key, bucket = []);
      bucket.push(rect);
    }
  }

  function clearCollisionState(el) {
    el.style.translate = '';
    if (el.dataset.collisionHidden === '1') {
      el.style.visibility = '';
      delete el.dataset.collisionHidden;
    }
  }

  function run() {
    timer = 0;
    if (running) return;
    running = true;
    try {
      const allLabels = Array.from(new Set(document.querySelectorAll(LABEL_SELECTOR)));
      // Clear old collision state even for labels that have just been disabled.
      for (const label of allLabels) clearCollisionState(label);
      const namesEnabled = mapNamesEnabled();
      const labels = allLabels.filter(label => isVisible(label, namesEnabled)).sort((a, b) => priority(a) - priority(b));
      const measurements = labels.map(label => ({ label, rect: label.getBoundingClientRect() }));
      const grid = new Map();

      for (const { label, rect } of measurements) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        let chosen = null;
        for (const [dx, dy] of OFFSETS) {
          const candidate = rectMoved(rect, dx, dy);
          if (!collides(candidate, grid)) { chosen = { dx, dy, rect: candidate }; break; }
        }
        if (!chosen) {
          label.style.visibility = 'hidden';
          label.dataset.collisionHidden = '1';
          continue;
        }
        if (chosen.dx || chosen.dy) label.style.translate = `${chosen.dx}px ${chosen.dy}px`;
        addToGrid(chosen.rect, grid);
      }
    } finally { running = false; }
  }

  function schedule(delay = IDLE_DELAY) { clearTimeout(timer); timer = setTimeout(run, delay); }

  const observer = new MutationObserver(mutations => {
    if (running) return;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' || mutation.type === 'characterData') { schedule(); return; }
      if (mutation.type === 'attributes' && mutation.target?.matches?.(LABEL_SELECTOR)) { schedule(); return; }
    }
  });

  observer.observe(document.getElementById('worldMap') || document.body, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['x', 'y', 'class', 'display', 'visibility']
  });

  window.addEventListener('resize', () => schedule(120), { passive: true });
  document.getElementById('showNames')?.addEventListener('change', () => schedule(0));
  document.getElementById('showCountryNames')?.addEventListener('change', () => schedule(0));
  document.getElementById('showCities')?.addEventListener('change', () => schedule(0));
  document.getElementById('showRivers')?.addEventListener('change', () => schedule(0));
  document.getElementById('showMountains')?.addEventListener('change', () => schedule(0));

  window.historyMapLabelCollision = { schedule, run };
  schedule(0);
})();
