(() => {
  const button = document.querySelector('[data-tool="border-adjust"]');
  if (!button) return;

  let drawing = false;
  let pointerId = null;
  let stroke = [];
  let startCountryId = null;
  let ownerBeforeStroke = null;

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
    if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) >= sampleGap()) stroke.push(point);
  }

  function drawPreview() {
    draftLayer.selectAll('.border-adjust-preview').remove();
    if (stroke.length < 2) return;
    const line = d3.line().x(d => d[0]).y(d => d[1]).curve(d3.curveCatmullRom.alpha(0.45));
    draftLayer.append('path').attr('class','border-adjust-preview').attr('d',line(stroke)).attr('fill','none')
      .attr('stroke','#168cff').attr('stroke-width',3.2).attr('stroke-linecap','round').attr('stroke-linejoin','round')
      .attr('vector-effect','non-scaling-stroke').style('pointer-events','none');
  }

  function closestIndex(points, target) {
    let bestIndex = -1, bestSq = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dx = points[i][0] - target[0], dy = points[i][1] - target[1], sq = dx * dx + dy * dy;
      if (sq < bestSq) { bestSq = sq; bestIndex = i; }
    }
    return { index: bestIndex, distance: Math.sqrt(bestSq) };
  }

  // The gesture may begin anywhere inside a territory. Only the section between
  // the first and last contacts with the SAME border is used as the replacement.
  function findTargetBorder() {
    if (stroke.length < 3) return null;
    const radius = snapRadius();
    let best = null;

    for (let bi = 0; bi < state.borders.length; bi++) {
      const border = state.borders[bi];
      const points = border.points;
      if (!yearVisible(border) || !Array.isArray(points) || points.length < 4) continue;

      let first = null;
      let last = null;
      for (let si = 0; si < stroke.length; si++) {
        const hit = closestIndex(points, stroke[si]);
        if (hit.distance > radius) continue;
        const contact = { strokeIndex: si, borderIndex: hit.index, distance: hit.distance };
        if (!first) first = contact;
        last = contact;
      }

      if (!first || !last) continue;
      if (last.strokeIndex - first.strokeIndex < 2) continue;
      if (Math.abs(last.borderIndex - first.borderIndex) < 2) continue;

      const score = first.distance + last.distance;
      if (!best || score < best.score) {
        best = {
          arrayIndex: bi,
          border,
          startIndex: first.borderIndex,
          endIndex: last.borderIndex,
          strokeStartIndex: first.strokeIndex,
          strokeEndIndex: last.strokeIndex,
          score
        };
      }
    }
    return best;
  }

  function showStatus(message) {
    statusEl.style.opacity = '1';
    statusEl.textContent = message;
    setTimeout(() => statusEl.style.opacity = '0', 1900);
  }

  function commitAdjustment() {
    const target = findTargetBorder();
    if (!target) {
      showStatus('영토 안에서 시작해 국경을 한 번 넘어간 뒤 같은 국경에 다시 닿게 그려 주세요.');
      return false;
    }
    if (!ownerBeforeStroke || !startCountryId) return false;

    const points = target.border.points;
    const low = Math.min(target.startIndex, target.endIndex);
    const high = Math.max(target.startIndex, target.endIndex);

    let replacement = stroke.slice(target.strokeStartIndex, target.strokeEndIndex + 1);
    if (target.startIndex > target.endIndex) replacement = [...replacement].reverse();

    // Snap both ends exactly to the existing border. The part of the gesture
    // before the first border contact stays only as an ownership selector.
    const middle = replacement.slice(1, -1).map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]);
    const merged = [
      ...points.slice(0, low + 1),
      ...middle,
      ...points.slice(high)
    ];
    if (merged.length < 2) return false;

    snapshot();
    state.borders[target.arrayIndex] = { ...target.border, points: merged };
    window.historyMapSplitPreserve?.preserve?.(ownerBeforeStroke);
    window.historyMapTerritoryRender?.invalidate?.();
    window.historyMapGeography?.invalidateOwnership?.();
    renderBorders();
    renderTerritories();
    window.historyMapGeography?.render?.();
    window.historyMapAutosave?.save?.();
    return true;
  }

  button.addEventListener('click', () => {
    helpEl.textContent = '국경 조정: 늘릴 국가의 영토 안에서 시작해 국경을 넘어 새 경로를 그린 뒤 같은 국경에 다시 닿게 하세요. 영토 안에서 그은 시작 부분은 실제 국경선에 포함되지 않습니다.';
    svg.style('cursor', 'crosshair');
    window.historyMapToolSettings?.showForTool?.('border-adjust');
  });

  svg.on('pointerdown.borderAdjust', event => {
    if (state.tool !== 'border-adjust') return;
    const point = mapPoint(event);
    const owner = window.historyMapTerritoryRender?.getOwnerMap?.();
    const x = Math.round(point[0]), y = Math.round(point[1]);
    const ci = (owner && x >= 0 && y >= 0 && x < W && y < H) ? owner[y * W + x] : -1;
    if (ci < 0) {
      showStatus('국경 조정은 늘릴 국가의 영토 안에서 시작해야 합니다.');
      return;
    }

    event.preventDefault();
    drawing = true;
    pointerId = event.pointerId;
    stroke = [];
    startCountryId = state.countries[ci]?.id || null;
    ownerBeforeStroke = owner.slice();
    addPoint(point);
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
    if (stroke.length >= 3) commitAdjustment();
    stroke = [];
    startCountryId = null;
    ownerBeforeStroke = null;
    draftLayer.selectAll('.border-adjust-preview').remove();
  }

  svg.on('pointerup.borderAdjust', finish);
  svg.on('pointercancel.borderAdjust', finish);
})();