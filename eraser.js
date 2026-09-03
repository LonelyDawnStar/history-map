(() => {
  const eraserButton = document.querySelector('[data-tool="eraser"]');
  if (!eraserButton) return;

  let erasing = false;
  let changedThisGesture = false;

  function brushRadius() {
    return Math.max(4, 16 / Math.max(0.7, currentTransform.k));
  }

  function showBrush(x, y) {
    if (state.tool !== 'eraser') return;
    draftLayer.selectAll('.eraser-brush').remove();
    draftLayer.append('circle')
      .attr('class', 'eraser-brush')
      .attr('cx', x)
      .attr('cy', y)
      .attr('r', brushRadius());
  }

  function distance(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  function eraseAt(x, y) {
    const radius = brushRadius();
    const nextBorders = [];
    let changed = false;

    for (const border of state.borders) {
      if (!yearVisible(border) || !Array.isArray(border.points) || border.points.length < 2) {
        nextBorders.push(border);
        continue;
      }

      const runs = [];
      let run = [];

      for (const point of border.points) {
        const hit = distance(point, [x, y]) <= radius;
        if (hit) {
          changed = true;
          if (run.length >= 2) runs.push(run);
          run = [];
        } else {
          run.push(point);
        }
      }
      if (run.length >= 2) runs.push(run);

      if (!changed || runs.length === 1 && runs[0].length === border.points.length) {
        nextBorders.push(border);
        continue;
      }

      for (const points of runs) {
        if (points.length < 2) continue;
        nextBorders.push({
          ...border,
          id: uid(),
          points: points.map(p => [p[0], p[1]])
        });
      }
    }

    if (changed) {
      state.borders = nextBorders;
      changedThisGesture = true;
      renderAll();
      showBrush(x, y);
    }
  }

  eraserButton.addEventListener('click', () => {
    helpEl.textContent = '국경 지우개: 잘못 그은 국경 위를 손가락이나 펜으로 문지르면 닿은 부분만 삭제됩니다.';
    svg.style('cursor', 'crosshair');
  });

  svg.on('pointerdown.eraser', event => {
    if (state.tool !== 'eraser') return;
    event.preventDefault();
    const [x, y] = mapPoint(event);
    if (!isLand(x, y)) return;
    snapshot();
    erasing = true;
    changedThisGesture = false;
    svg.node().setPointerCapture?.(event.pointerId);
    eraseAt(x, y);
    showBrush(x, y);
  });

  svg.on('pointermove.eraser', event => {
    if (state.tool !== 'eraser') return;
    const [x, y] = mapPoint(event);
    showBrush(x, y);
    if (!erasing) return;
    event.preventDefault();
    if (!isLand(x, y)) return;
    eraseAt(x, y);
  });

  function finishErase() {
    if (!erasing) return;
    erasing = false;
    draftLayer.selectAll('.eraser-brush').remove();
    if (!changedThisGesture) state.history.pop();
    renderTerritories();
    renderBorders();
  }

  svg.on('pointerup.eraser', finishErase);
  svg.on('pointercancel.eraser', finishErase);
  svg.on('pointerleave.eraser', () => {
    if (!erasing) draftLayer.selectAll('.eraser-brush').remove();
  });
})();
