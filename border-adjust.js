(() => {
  const button = document.querySelector('[data-tool="border-adjust"]');
  if (!button) return;

  let drawing = false;
  let pointerId = null;
  let stroke = [];

  const screenToMap = px => px / Math.max(0.7, currentTransform.k);
  const sampleGap = () => screenToMap(1.2);
  const snapRadius = () => screenToMap(Number(window.historyMapToolSettings?.borderAdjustRadius) || 20);

  function flash(text, ms = 1800) {
    statusEl.style.opacity = '1';
    statusEl.textContent = text;
    clearTimeout(flash.timer);
    flash.timer = setTimeout(() => statusEl.style.opacity = '0', ms);
  }

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

  function lineLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    return total;
  }

  function drawPreview() {
    draftLayer.selectAll('.border-adjust-preview').remove();
    if (stroke.length < 2) return;
    const line = d3.line().x(d => d[0]).y(d => d[1]).curve(d3.curveCatmullRom.alpha(0.45));
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

  function projectToSegment(a, b, p) {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const lenSq = vx * vx + vy * vy;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / lenSq)) : 0;
    const x = a[0] + vx * t, y = a[1] + vy * t;
    return { x, y, t, distance: Math.hypot(p[0] - x, p[1] - y) };
  }

  function closestProjection(points, target) {
    let best = null;
    for (let i = 0; i < points.length - 1; i++) {
      const projected = projectToSegment(points[i], points[i + 1], target);
      if (!best || projected.distance < best.distance) best = { segmentIndex: i, ...projected };
    }
    return best;
  }

  function pathLengthBetween(points, a, b) {
    if (!a || !b) return Infinity;
    const startPos = a.segmentIndex + a.t;
    const endPos = b.segmentIndex + b.t;
    const low = startPos <= endPos ? a : b;
    const high = startPos <= endPos ? b : a;
    let total = 0;
    let previous = [low.x, low.y];
    for (let i = low.segmentIndex + 1; i <= high.segmentIndex; i++) {
      const current = points[i];
      total += Math.hypot(current[0] - previous[0], current[1] - previous[1]);
      previous = current;
    }
    total += Math.hypot(high.x - previous[0], high.y - previous[1]);
    return total;
  }

  function findTargetBorder() {
    if (stroke.length < 2) return null;
    const start = stroke[0], end = stroke.at(-1), radius = snapRadius();
    const newLength = Math.max(1, lineLength(stroke));
    let best = null;

    for (let i = 0; i < state.borders.length; i++) {
      const border = state.borders[i];
      if (!yearVisible(border) || !Array.isArray(border.points) || border.points.length < 3) continue;
      const a = closestProjection(border.points, start);
      const b = closestProjection(border.points, end);
      if (!a || !b || a.distance > radius || b.distance > radius) continue;
      const aPos = a.segmentIndex + a.t, bPos = b.segmentIndex + b.t;
      if (Math.abs(aPos - bPos) < 0.15) continue;
      const oldLength = pathLengthBetween(border.points, a, b);
      const ratio = oldLength / newLength;
      if (ratio > 3.25 || ratio < 0.22) continue;
      const lengthPenalty = Math.abs(Math.log(Math.max(0.05, ratio))) * radius * 0.8;
      const score = a.distance + b.distance + lengthPenalty;
      if (!best || score < best.score) best = { arrayIndex: i, border, start: a, end: b, score };
    }
    return best;
  }

  function buildOpenComponents(blocked) {
    const component = new Int32Array(W * H);
    component.fill(-1);
    const queue = new Int32Array(W * H);
    let componentId = 0;
    for (let start = 0; start < component.length; start++) {
      if (blocked[start] || component[start] !== -1) continue;
      let head = 0, tail = 0;
      queue[tail++] = start;
      component[start] = componentId;
      while (head < tail) {
        const idx = queue[head++], x = idx % W, y = (idx / W) | 0;
        if (x > 0) { const n = idx - 1; if (!blocked[n] && component[n] === -1) { component[n] = componentId; queue[tail++] = n; } }
        if (x < W - 1) { const n = idx + 1; if (!blocked[n] && component[n] === -1) { component[n] = componentId; queue[tail++] = n; } }
        if (y > 0) { const n = idx - W; if (!blocked[n] && component[n] === -1) { component[n] = componentId; queue[tail++] = n; } }
        if (y < H - 1) { const n = idx + W; if (!blocked[n] && component[n] === -1) { component[n] = componentId; queue[tail++] = n; } }
      }
      componentId++;
    }
    return component;
  }

  function mergedCountriesAfterEdit(previousOwner, component) {
    if (!previousOwner || previousOwner.length !== W * H) return false;
    const counts = state.countries.map(() => new Map());
    const totals = new Int32Array(state.countries.length);
    for (let idx = 0; idx < previousOwner.length; idx++) {
      const ci = previousOwner[idx], comp = component[idx];
      if (ci < 0 || comp < 0 || ci >= counts.length) continue;
      totals[ci]++;
      counts[ci].set(comp, (counts[ci].get(comp) || 0) + 1);
    }
    const dominant = new Map();
    for (let ci = 0; ci < counts.length; ci++) {
      if (totals[ci] < 80) continue;
      let bestComp = -1, bestCount = 0;
      for (const [comp, count] of counts[ci]) if (count > bestCount) { bestCount = count; bestComp = comp; }
      if (bestComp < 0 || bestCount < Math.max(60, totals[ci] * 0.12)) continue;
      const other = dominant.get(bestComp);
      if (other !== undefined && other !== ci) return true;
      dominant.set(bestComp, ci);
    }
    return false;
  }

  function buildOldOwnerComponents(previousOwner) {
    const labels = new Int32Array(W * H);
    labels.fill(-1);
    const queue = new Int32Array(W * H);
    let label = 0;
    for (let start = 0; start < previousOwner.length; start++) {
      const ci = previousOwner[start];
      if (ci < 0 || labels[start] !== -1) continue;
      let head = 0, tail = 0;
      queue[tail++] = start;
      labels[start] = label;
      while (head < tail) {
        const idx = queue[head++], x = idx % W, y = (idx / W) | 0;
        if (x > 0) { const n = idx - 1; if (labels[n] === -1 && previousOwner[n] === ci) { labels[n] = label; queue[tail++] = n; } }
        if (x < W - 1) { const n = idx + 1; if (labels[n] === -1 && previousOwner[n] === ci) { labels[n] = label; queue[tail++] = n; } }
        if (y > 0) { const n = idx - W; if (labels[n] === -1 && previousOwner[n] === ci) { labels[n] = label; queue[tail++] = n; } }
        if (y < H - 1) { const n = idx + W; if (labels[n] === -1 && previousOwner[n] === ci) { labels[n] = label; queue[tail++] = n; } }
      }
      label++;
    }
    return labels;
  }

  function preserveSplitPieces(previousOwner, previousFills, blocked) {
    if (!previousOwner || previousOwner.length !== W * H) return 0;

    const oldComponent = buildOldOwnerComponents(previousOwner);
    const visited = new Uint8Array(W * H);
    const queue = new Int32Array(W * H);
    const visibleFills = previousFills.map((fill, index) => ({ fill, index })).filter(({ fill }) => yearVisible(fill));
    const additions = [];

    for (let start = 0; start < previousOwner.length; start++) {
      const ci = previousOwner[start];
      if (ci < 0 || blocked[start] || visited[start]) continue;

      let head = 0, tail = 0, sx = 0, sy = 0;
      queue[tail++] = start;
      visited[start] = 1;
      const countryId = state.countries[ci]?.id;
      if (!countryId) continue;
      const oldLabel = oldComponent[start];

      while (head < tail) {
        const idx = queue[head++], x = idx % W, y = (idx / W) | 0;
        sx += x; sy += y;
        if (x > 0) { const n = idx - 1; if (!visited[n] && !blocked[n] && previousOwner[n] === ci) { visited[n] = 1; queue[tail++] = n; } }
        if (x < W - 1) { const n = idx + 1; if (!visited[n] && !blocked[n] && previousOwner[n] === ci) { visited[n] = 1; queue[tail++] = n; } }
        if (y > 0) { const n = idx - W; if (!visited[n] && !blocked[n] && previousOwner[n] === ci) { visited[n] = 1; queue[tail++] = n; } }
        if (y < H - 1) { const n = idx + W; if (!visited[n] && !blocked[n] && previousOwner[n] === ci) { visited[n] = 1; queue[tail++] = n; } }
      }

      let hasSeed = false;
      for (const { fill } of visibleFills) {
        if (fill.countryId !== countryId) continue;
        const fx = Math.round(fill.x), fy = Math.round(fill.y);
        if (fx < 0 || fy < 0 || fx >= W || fy >= H) continue;
        const idx = fy * W + fx;
        if (!blocked[idx] && previousOwner[idx] === ci) {
          for (let q = 0; q < tail; q++) {
            if (queue[q] === idx) { hasSeed = true; break; }
          }
        }
        if (hasSeed) break;
      }
      if (hasSeed) continue;

      const meanX = sx / tail, meanY = sy / tail;
      let seedIdx = start, bestDist = Infinity;
      const step = Math.max(1, Math.floor(tail / 900));
      for (let q = 0; q < tail; q += step) {
        const idx = queue[q], x = idx % W, y = (idx / W) | 0;
        const d = (x - meanX) * (x - meanX) + (y - meanY) * (y - meanY);
        if (d < bestDist) { bestDist = d; seedIdx = idx; }
      }

      let sourceIndex = -1;
      for (const { fill, index } of visibleFills) {
        if (fill.countryId !== countryId) continue;
        const fx = Math.round(fill.x), fy = Math.round(fill.y);
        if (fx < 0 || fy < 0 || fx >= W || fy >= H) continue;
        const idx = fy * W + fx;
        if (previousOwner[idx] === ci && oldComponent[idx] === oldLabel) sourceIndex = Math.max(sourceIndex, index);
      }
      if (sourceIndex < 0) {
        for (const { fill, index } of visibleFills) if (fill.countryId === countryId) sourceIndex = Math.max(sourceIndex, index);
      }
      if (sourceIndex < 0) continue;

      additions.push({
        sourceIndex,
        fill: {
          id: uid(),
          countryId,
          x: seedIdx % W,
          y: (seedIdx / W) | 0,
          fromYear: state.year,
          toYear: 9999,
          autoSplit: true
        }
      });
    }

    if (!additions.length) return 0;
    additions.sort((a, b) => b.sourceIndex - a.sourceIndex);
    for (const addition of additions) state.fills.splice(addition.sourceIndex + 1, 0, addition.fill);
    return additions.length;
  }

  function commitAdjustment() {
    const target = findTargetBorder();
    if (!target) {
      flash('조정할 구간의 시작과 끝을 같은 기존 국경에 가깝게 연결해 주세요.');
      return false;
    }

    const points = target.border.points;
    const startPos = target.start.segmentIndex + target.start.t;
    const endPos = target.end.segmentIndex + target.end.t;
    const forward = startPos <= endPos;
    const low = forward ? target.start : target.end;
    const high = forward ? target.end : target.start;
    const replacementRaw = forward ? stroke : [...stroke].reverse();
    const replacement = [
      [+low.x.toFixed(2), +low.y.toFixed(2)],
      ...replacementRaw.slice(1, -1).map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]),
      [+high.x.toFixed(2), +high.y.toFixed(2)]
    ];
    const before = points.slice(0, low.segmentIndex + 1).map(p => [p[0], p[1]]);
    const after = points.slice(high.segmentIndex + 1).map(p => [p[0], p[1]]);
    const merged = [...before, ...replacement, ...after];

    const cleaned = [];
    for (const p of merged) {
      const last = cleaned.at(-1);
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.05) cleaned.push(p);
    }
    if (cleaned.length < 2) return false;

    const previousOwner = window.historyMapTerritoryRender?.getOwnerMap?.()?.slice?.() || null;
    const previousFills = state.fills.map(fill => ({ ...fill }));
    snapshot();
    const oldBorder = state.borders[target.arrayIndex];
    state.borders[target.arrayIndex] = { ...target.border, points: cleaned };

    const blocked = buildBarrierMap();
    const openComponents = buildOpenComponents(blocked);
    if (mergedCountriesAfterEdit(previousOwner, openComponents)) {
      state.borders[target.arrayIndex] = oldBorder;
      state.history.pop();
      renderBorders();
      flash('새 국경에 틈이 생겨 두 나라 영토가 연결될 수 있어 조정을 취소했습니다.', 2200);
      return false;
    }

    preserveSplitPieces(previousOwner, previousFills, blocked);

    window.historyMapTerritoryRender?.invalidate?.();
    window.historyMapGeography?.invalidateOwnership?.();
    renderBorders();
    renderTerritories();
    window.historyMapGeography?.render?.();
    window.historyMapAutosave?.save?.();
    return true;
  }

  button.addEventListener('click', () => {
    helpEl.textContent = '국경 조정: 기존 국경 옆에 파란 선을 그리고 같은 국경에 다시 닿으면, 겹치는 기존 구간만 새 선으로 교체됩니다.';
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