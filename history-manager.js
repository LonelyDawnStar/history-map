(() => {
  const MAX_HISTORY = 30;
  const redoStack = [];
  const originalSnapshot = snapshot;

  function serializeState() {
    return JSON.stringify({
      countries: state.countries,
      borders: state.borders,
      fills: state.fills,
      events: state.events,
      cities: state.cities || [],
      activeCountryId: state.activeCountryId,
      year: state.year
    });
  }

  function restore(raw) {
    const d = JSON.parse(raw);
    state.countries = d.countries || [];
    state.borders = d.borders || [];
    state.fills = d.fills || [];
    state.events = d.events || [];
    state.cities = d.cities || [];
    state.activeCountryId = d.activeCountryId || null;
    state.year = Number(d.year ?? 1936);
    yearInput.value = state.year;
    if (state.year >= 1800 && state.year <= 2100) timeline.value = state.year;
    window.historyMapTerritoryRender?.invalidate?.();
    window.historyMapGeography?.invalidateOwnership?.();
    renderAll();
    window.historyMapGeography?.render?.(true);
    window.historyMapAutosave?.save?.();
    updateButtons();
  }

  snapshot = function historySnapshot() {
    const raw = serializeState();
    const last = state.history.at(-1);
    if (last !== raw) state.history.push(raw);
    if (state.history.length > MAX_HISTORY) state.history.shift();
    redoStack.length = 0;
    updateButtons();
  };

  const oldUndo = document.getElementById('undoBtn');
  const undoBtn = oldUndo.cloneNode(true);
  oldUndo.replaceWith(undoBtn);

  const redoBtn = document.createElement('button');
  redoBtn.id = 'redoBtn';
  redoBtn.type = 'button';
  redoBtn.textContent = '재실행';
  undoBtn.after(redoBtn);

  function undo() {
    const raw = state.history.pop();
    if (!raw) return;
    redoStack.push(serializeState());
    if (redoStack.length > MAX_HISTORY) redoStack.shift();
    restore(raw);
  }

  function redo() {
    const raw = redoStack.pop();
    if (!raw) return;
    state.history.push(serializeState());
    if (state.history.length > MAX_HISTORY) state.history.shift();
    restore(raw);
  }

  function updateButtons() {
    undoBtn.disabled = state.history.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  }

  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  document.addEventListener('keydown', event => {
    const target = event.target;
    if (target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      undo();
    } else if ((key === 'y') || (key === 'z' && event.shiftKey)) {
      event.preventDefault();
      redo();
    }
  });

  updateButtons();
  window.historyMapHistory = { undo, redo, updateButtons };
})();