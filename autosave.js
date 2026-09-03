(() => {
  const STORAGE_KEY = 'history-map-autosave-v1';
  let restoring = false;
  let lastSaved = '';
  let saveTimer = null;

  function serialize() {
    return JSON.stringify({
      version: 2,
      savedAt: new Date().toISOString(),
      year: state.year,
      countries: state.countries,
      borders: state.borders,
      fills: state.fills,
      events: state.events,
      cities: state.cities || [],
      rivers: state.rivers || [],
      mountains: state.mountains || [],
      activeCountryId: state.activeCountryId,
      view: {
        x: currentTransform.x,
        y: currentTransform.y,
        k: currentTransform.k
      }
    });
  }

  function saveNow() {
    if (restoring) return;
    try {
      const raw = serialize();
      if (raw === lastSaved) return;
      localStorage.setItem(STORAGE_KEY, raw);
      lastSaved = raw;
    } catch (err) {
      console.warn('자동저장 실패:', err);
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 180);
  }

  function restore() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      restoring = true;
      state.countries = Array.isArray(data.countries) ? data.countries : [];
      state.borders = Array.isArray(data.borders) ? data.borders : [];
      state.fills = Array.isArray(data.fills) ? data.fills : [];
      state.events = Array.isArray(data.events) ? data.events : [];
      state.cities = Array.isArray(data.cities) ? data.cities : [];
      state.rivers = Array.isArray(data.rivers) ? data.rivers : [];
      state.mountains = Array.isArray(data.mountains) ? data.mountains : [];
      state.activeCountryId = data.activeCountryId || state.countries[0]?.id || null;
      state.year = Number(data.year ?? 1936);
      yearInput.value = state.year;
      if (state.year >= 1800 && state.year <= 2100) timeline.value = state.year;

      if (data.view && Number.isFinite(data.view.k)) {
        const next = d3.zoomIdentity
          .translate(Number(data.view.x) || 0, Number(data.view.y) || 0)
          .scale(Math.max(0.7, Math.min(14, Number(data.view.k) || 1)));
        svg.call(zoom.transform, next);
      }

      renderAll();
      window.historyMapGeography?.render();
      lastSaved = serialize();
      return true;
    } catch (err) {
      console.warn('자동저장 복구 실패:', err);
      return false;
    } finally {
      restoring = false;
    }
  }

  const observer = setInterval(() => {
    if (restoring) return;
    let raw;
    try { raw = serialize(); } catch (_) { return; }
    if (raw !== lastSaved) scheduleSave();
  }, 500);

  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });

  setTimeout(() => {
    const restored = restore();
    if (restored) setTimeout(() => renderAll(), 700);
  }, 0);

  window.historyMapAutosave = {
    save: saveNow,
    clear() {
      localStorage.removeItem(STORAGE_KEY);
      lastSaved = '';
    },
    stop() { clearInterval(observer); }
  };
})();
