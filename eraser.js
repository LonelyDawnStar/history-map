(() => {
  const eraserButton = document.querySelector('[data-tool="eraser"]');
  if (!eraserButton) return;

  let erasing = false;
  let changedThisGesture = false;

  function brushRadius() {
    const size = Number(window.historyMapToolSettings?.eraserSize) || 32;
    return Math.max(2, size / 2 / Math.max(0.7, currentTransform.k));
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

  function eraseAt(x, y) {
    const radius = brushRadius();
    const radiusSq = radius * radius;
    const nextBorders = [];
    let anyChanged = false;

    for (const border of state.borders) {
      if (!yearVisible(border) || !Array.isArray(border.points) || border.points.length < 2) {
        nextBorders.push(border);
        continue;
      }

      const runs = [];
      let run = [];
      let borderChanged = false;

      for (const point of border.points) {
        const dx = point[0] - x;
        const dy = point[1] - y;
        const hit = dx * dx + dy * dy <= radiusSq;
        if (hit) {
          borderChanged = true;
          if (run.length >= 2) runs.push(run);
          run = [];
        } else {
          run.push(point);
        }
      }
      if (run.length >= 2) runs.push(run);

      if (!borderChanged) {
        nextBorders.push(border);
        continue;
      }

      anyChanged = true;
      for (const points of runs) {
        if (points.length < 2) continue;
        nextBorders.push({ ...border, id: uid(), points: points.map(p => [p[0], p[1]]) });
      }
    }

    if (!anyChanged) return;
    state.borders = nextBorders;
    changedThisGesture = true;
    window.historyMapTerritoryRender?.invalidate();
    window.historyMapGeography?.invalidateOwnership();
    renderBorders();
  }

  eraserButton.addEventListener('click', () => {
    helpEl.textContent = '국경 지우개: 도구 설정에서 크기를 바꾼 뒤 국경 위를 문지르면 닿은 부분만 삭제됩니다.';
    svg.style('cursor', 'crosshair');
    window.historyMapToolSettings?.showForTool?.('eraser');
  });

  svg.on('pointerdown.eraser', event => {
    if (state.tool !== 'eraser') return;
    event.preventDefault();
    const [x, y] = mapPoint(event);
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
    eraseAt(x, y);
  });

  function finishErase(event) {
    if (!erasing) return;
    erasing = false;
    draftLayer.selectAll('.eraser-brush').remove();
    try { svg.node().releasePointerCapture?.(event?.pointerId); } catch {}
    if (!changedThisGesture) {
      state.history.pop();
      return;
    }
    renderTerritories();
    renderBorders();
    window.historyMapAutosave?.save();
  }

  svg.on('pointerup.eraser', finishErase);
  svg.on('pointercancel.eraser', finishErase);
  svg.on('pointerleave.eraser', () => {
    if (!erasing) draftLayer.selectAll('.eraser-brush').remove();
  });
})();