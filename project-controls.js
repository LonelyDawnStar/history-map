(() => {
  const MIN_YEAR = -3000;
  const MAX_YEAR = 3000;
  const DEFAULT_YEAR = 1936;

  const clampYear = value => Math.max(MIN_YEAR, Math.min(MAX_YEAR, Number(value) || 0));

  // Keep every year control on the same supported range.
  yearInput.min = String(MIN_YEAR);
  yearInput.max = String(MAX_YEAR);
  timeline.min = String(MIN_YEAR);
  timeline.max = String(MAX_YEAR);
  timeline.step = '1';

  // app.js already owns all listeners; replacing the global function avoids
  // adding duplicate input/change handlers and keeps the year update cheap.
  const baseSetYear = setYear;
  setYear = function boundedSetYear(value) {
    const year = clampYear(value);
    baseSetYear(year);
    timeline.value = String(year);
    yearInput.value = String(year);
    return year;
  };

  // Normalize a restored/imported year once without extra rendering when possible.
  if (state.year < MIN_YEAR || state.year > MAX_YEAR) setYear(state.year);
  else {
    yearInput.value = String(state.year);
    timeline.value = String(state.year);
  }

  const resetBtn = document.getElementById('resetAllBtn');
  if (!resetBtn) return;

  function resetAll() {
    if (!confirm('국가, 영토, 국경, 도시, 사건을 모두 삭제하고 처음 상태로 되돌릴까요?')) return;

    snapshot();

    state.countries = [];
    state.borders = [];
    state.fills = [];
    state.events = [];
    state.cities = [];
    state.activeCountryId = null;
    state.pendingEventPoint = null;
    state.drawing = false;
    state.draftStroke = [];
    state.tool = 'pan';
    state.year = DEFAULT_YEAR;

    yearInput.value = String(DEFAULT_YEAR);
    timeline.value = String(DEFAULT_YEAR);

    document.querySelectorAll('.tool').forEach(btn => btn.classList.toggle('active', btn.dataset.tool === 'pan'));
    helpEl.textContent = '이동 도구: 지도를 드래그하고 확대/축소할 수 있습니다.';
    svg.style('cursor', 'grab');

    currentTransform = d3.zoomIdentity;
    svg.call(zoom.transform, currentTransform);

    window.historyMapTerritoryRender?.invalidate?.();
    window.historyMapGeography?.invalidateOwnership?.();

    // One consolidated render/save only; avoid per-array rerenders during reset.
    renderAll();
    window.historyMapGeography?.render?.(true);
    window.historyMapLabelCollision?.schedule?.(0);
    window.historyMapAutosave?.save?.();
    window.historyMapHistory?.updateButtons?.();

    statusEl.textContent = '모든 편집 내용을 초기화했습니다.';
    statusEl.style.opacity = '1';
    setTimeout(() => statusEl.style.opacity = '0', 1400);
  }

  resetBtn.addEventListener('click', resetAll);
  window.historyMapProjectControls = { resetAll, minYear: MIN_YEAR, maxYear: MAX_YEAR };
})();