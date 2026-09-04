(() => {
  const button = document.querySelector('[data-tool="border-adjust"]');
  if (!button) return;

  let drawing = false;
  let pointerId = null;
  let stroke = [];

  const screenToMap = px => px / Math.max(0.7, currentTransform.k);
  const sampleGap = () => screenToMap(1.2);
  const snapRadius = () => screenToMap(Number(window.historyMapToolSettings?.borderAdjustRadius) || 20);

  function nearLand(x, y) {
    if (isLand(x, y)) return true;
    const r = screenToMap(2.4);
    return isLand(x + r, y) || isLand(x - r, y) || isLand(x, y + r) || isLand(x, y - r);
  }

  function addPoint(point) {
    if (!nearLand(point[0], point[1])) return;
    const last = stroke.at(-1);
    if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) >= sampleGap()) {
      stroke.push(point);
    }
  }

  function drawPreview() {
    draftLayer.selectAll('.border-adjust-preview').remove();
    if (stroke.length < 2) return;
    const line = d3.line()
      .x(d => d[0])
      .y(d => d[1])
      .curve(d3.curveCatmullRom.alpha(0.45));
    draftLayer.append('path')
      .attr('class', 'border-adjust-preview')
      .attr('d', line(stroke))
      .attr('fill', 'none')
      .attr('stroke', '#168cff')
      .attr('stroke-width', 3.2)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')
      .attr('vector-effect', 'non-scaling-stroke')
      .style('pointer-events', 'none');
  }

  function closestIndex(points, target) {
    let bestIndex = -1;
    let bestSq = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dx = points[i][0] - target[0];
      const dy = points[i][1] - target[1];
      const sq = dx * dx + dy * dy;
      if (sq < bestSq) { bestSq = sq; bestIndex = i; }
    }
    return { index: bestIndex, distance: Math.sqrt(bestSq) };
  }

  function findTargetBorder() {
    if (stroke.length < 2) return null;
    const start = stroke[0];
    const end = stroke.at(-1);
    const radius = snapRadius();
    let best = null;

    for (let i = 0; i < state.borders.length; i++) {
      const border = state.borders[i];
      if (!yearVisible(border) || !Array.isArray(border.points) || border.points.length < 4) continue;
      const a = closestIndex(border.points, start);
      const b = closestIndex(border.points, end);
      if (a.distance > radius || b.distance > radius || Math.abs(a.index - b.index) < 2) continue;
      const score = a.distance + b.distance;
      if (!best || score < best.score) best = { arrayIndex: i, border, startIndex: a.index, endIndex: b.index, score };
    }
    return best;
  }

  function commitAdjustment() {
    const target = findTargetBorder();
    if (!target) {
      statusEl.style.opacity = '1';
      statusEl.textContent = '파란 선의 시작과 끝을 같은 기존 국경에 닿게 그려 주세요.';
      setTimeout(() => statusEl.style.opacity = '0', 1800);
      return false;
    }

    const points = target.border.points;
    const low = Math.min(target.startIndex, target.endIndex);
    const high = Math.max(target.startIndex, target.endIndex);
    const replacement = target.startIndex <= target.endIndex ? stroke : [...stroke].reverse();

    const merged = [
      ...points.slice(0, low + 1),
      ...replacement.slice(1, -1).map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]),
      ...points.slice(high)
    ];

    if (merged.length < 2) return false;
    snapshot();
    state.borders[target.arrayIndex] = { ...target.border, points: merged };
    window.historyMapTerritoryRender?.invalidate();
    window.historyMapGeography?.invalidateOwnership();
    renderBorders();
    renderTerritories();
    window.historyMapAutosave?.save();
    return true;
  }

  button.addEventListener('click', () => {
    helpEl.textContent = '국경 조정: 기존 국경의 한 지점에서 시작해 옆으로 파란 선을 그리고 같은 국경에 다시 닿으면, 사이의 기존 국경이 새 선으로 교체됩니다.';
    svg.style('cursor', 'crosshair');
    window.historyMapToolSettings?.showForTool?.('border-adjust');
  });

  svg.on('pointerdown.borderAdjust', event => {
    if (state.tool !== 'border-adjust') return;
    event.preventDefault();
    drawing = true;
    pointerId = event.pointerId;
    stroke = [];
    addPoint(mapPoint(event));
    svg.node().setPointerCapture?.(event.pointerId);
    drawPreview();
  });

  svg.on('pointermove.borderAdjust', event => {
    if (state.tool !== 'border-adjust' || !drawing || event.pointerId !== pointerId) return;
    event.preventDefault();
    addPoint(mapPoint(event));
    drawPreview();
  });

  function finish(event) {
    if (!drawing || event.pointerId !== pointerId) return;
    drawing = false;
    try { svg.node().releasePointerCapture?.(pointerId); } catch {}
    pointerId = null;
    if (stroke.length >= 2) commitAdjustment();
    stroke = [];
    draftLayer.selectAll('.border-adjust-preview').remove();
  }

  svg.on('pointerup.borderAdjust', finish);
  svg.on('pointercancel.borderAdjust', finish);
})();