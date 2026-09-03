(() => {
  let drag = null;

  function countryForLabel(label) {
    const id = label.getAttribute('data-country-id');
    return state.countries.find(country => country.id === id) || null;
  }

  function applyPosition(label, country, x, y) {
    label.setAttribute('x', x);
    label.setAttribute('y', y);
    const angle = Math.max(-90, Math.min(90, Number(country.labelRotation) || 0));
    label.setAttribute('transform', `rotate(${angle} ${x} ${y})`);
  }

  labelLayer.node().addEventListener('pointerdown', event => {
    const label = event.target.closest?.('.country-label');
    if (!label || state.tool !== 'pan') return;
    const country = countryForLabel(label);
    if (!country || country.labelHidden) return;

    event.preventDefault();
    event.stopPropagation();
    snapshot();
    const [x, y] = mapPoint(event);
    const lx = Number(label.getAttribute('x')) || x;
    const ly = Number(label.getAttribute('y')) || y;
    drag = {
      pointerId: event.pointerId,
      label,
      country,
      offsetX: lx - x,
      offsetY: ly - y,
      moved: false
    };
    svg.node().setPointerCapture?.(event.pointerId);
    label.classList.add('dragging');
  }, true);

  svg.node().addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const [x, y] = mapPoint(event);
    const nx = +(x + drag.offsetX).toFixed(2);
    const ny = +(y + drag.offsetY).toFixed(2);
    drag.country.labelX = nx;
    drag.country.labelY = ny;
    drag.moved = true;
    applyPosition(drag.label, drag.country, nx, ny);
  }, true);

  function finish(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const current = drag;
    drag = null;
    current.label.classList.remove('dragging');
    try { svg.node().releasePointerCapture?.(event.pointerId); } catch {}
    if (!current.moved) {
      state.history.pop();
      return;
    }
    window.historyMapAutosave?.save();
  }

  svg.node().addEventListener('pointerup', finish, true);
  svg.node().addEventListener('pointercancel', finish, true);

  window.historyMapCountryLabelDrag = {
    reset(countryId) {
      const country = state.countries.find(c => c.id === countryId);
      if (!country) return;
      delete country.labelX;
      delete country.labelY;
      renderTerritories();
    }
  };
})();