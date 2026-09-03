(() => {
  const dialog = document.getElementById('eventDialog');
  const form = document.getElementById('eventForm');
  const titleEl = document.getElementById('eventTitle');
  const dateEl = document.getElementById('eventDate');
  const typeEl = document.getElementById('eventType');
  const descriptionEl = document.getElementById('eventDescription');
  const cancelBtn = document.getElementById('cancelEventBtn');
  if (!dialog || !form) return;

  let editingId = null;
  let deleteBtn = null;
  let saveBtn = form.querySelector('button[type="submit"]');
  const heading = form.querySelector('h2');

  function ensureDeleteButton() {
    if (deleteBtn) return;
    deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.id = 'deleteEventBtn';
    deleteBtn.className = 'danger-button';
    deleteBtn.textContent = '사건 삭제';
    const actions = form.querySelector('.dialog-actions');
    actions?.insertBefore(deleteBtn, saveBtn);
    deleteBtn.addEventListener('click', deleteEditingEvent);
  }

  function eventById(id) {
    return state.events.find(item => item.id === id) || null;
  }

  function resetMode() {
    editingId = null;
    if (heading) heading.textContent = '역사적 사건 추가';
    if (saveBtn) saveBtn.textContent = '추가';
    if (deleteBtn) deleteBtn.hidden = true;
  }

  function openEditor(item) {
    if (!item) return;
    editingId = item.id;
    ensureDeleteButton();
    if (heading) heading.textContent = '역사적 사건 수정';
    if (saveBtn) saveBtn.textContent = '저장';
    deleteBtn.hidden = false;
    titleEl.value = item.title || '';
    dateEl.value = item.date || (item.fromYear > 0 && item.fromYear <= 9999 ? `${String(item.fromYear).padStart(4, '0')}-01-01` : '');
    typeEl.value = item.type || 'other';
    descriptionEl.value = item.description || '';
    state.pendingEventPoint = { x: item.x, y: item.y };
    dialog.showModal();
  }

  function deleteEditingEvent() {
    const item = eventById(editingId);
    if (!item) return;
    if (!confirm(`사건 “${item.title}”을 삭제할까요?`)) return;
    snapshot();
    state.events = state.events.filter(event => event.id !== item.id);
    editingId = null;
    state.pendingEventPoint = null;
    dialog.close();
    renderEvents();
    window.historyMapAutosave?.save();
  }

  // Replace the base event marker click (alert) after every render.
  const baseRenderEvents = renderEvents;
  renderEvents = function () {
    baseRenderEvents();
    eventLayer.selectAll('g.event-marker')
      .style('cursor', 'pointer')
      .on('click.eventEditor', (event, item) => {
        event.preventDefault();
        event.stopPropagation();
        openEditor(item);
      });
  };

  // Capture submit before app.js's original add-only handler. Editing mutates
  // the existing item instead of accidentally creating a duplicate event.
  form.addEventListener('submit', event => {
    if (!editingId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const item = eventById(editingId);
    const title = titleEl.value.trim();
    if (!item || !title) return;

    snapshot();
    const date = dateEl.value;
    item.title = title;
    item.date = date;
    item.type = typeEl.value;
    item.description = descriptionEl.value.trim();
    item.fromYear = date ? Number(date.slice(0, 4)) : state.year;
    item.toYear = 9999;

    editingId = null;
    state.pendingEventPoint = null;
    dialog.close();
    renderEvents();
    window.historyMapAutosave?.save();
  }, true);

  cancelBtn?.addEventListener('click', resetMode);
  dialog.addEventListener('close', () => {
    editingId = null;
    state.pendingEventPoint = null;
    resetMode();
  });

  // When the normal event tool opens the dialog, make sure it is in add mode.
  svg.on('click.eventModeReset', event => {
    if (state.tool !== 'event') return;
    if (event.target.closest?.('.event-marker')) return;
    resetMode();
  });

  ensureDeleteButton();
  resetMode();
  renderEvents();
  window.historyMapEventEditor = { open: openEditor };
})();