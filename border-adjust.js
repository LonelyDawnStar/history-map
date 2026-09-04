(() => {
  const button = document.querySelector('[data-tool="border-adjust"]');
  if (!button) return;

  let drawing = false;
  let pointerId = null;
  let stroke = [];
  let startCountryId = null;
  let ownerBeforeStroke = null;

  const screenToMap = px => px / Math.max(0.7, currentTransform.k);
  const sampleGap = () => screenToMap(1.35);
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

  function closestOnBorder(points, target) {
    let best = null;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const vx = b[0] - a[0], vy = b[1] - a[1];
      const len2 = vx * vx + vy * vy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((target[0] - a[0]) * vx + (target[1] - a[1]) * vy) / len2)) : 0;
      const x = a[0] + vx * t, y = a[1] + vy * t;
      const dx = target[0] - x, dy = target[1] - y;
      const sq = dx * dx + dy * dy;
      if (!best || sq < best.sq) best = { segmentIndex: i, t, position: i + t, x, y, sq };
    }
    if (!best) return null;
    best.distance = Math.sqrt(best.sq);
    return best;
  }

  function contactRuns(points) {
    const radius = snapRadius();
    const leaveRadius = radius * 1.45;
    const runs = [];
    let run = null;
    let away = true;

    for (let si = 0; si < stroke.length; si++) {
      const hit = closestOnBorder(points, stroke[si]);
      if (!hit) continue;

      if (hit.distance <= radius && away) {
        run = { startStrokeIndex: si, endStrokeIndex: si, bestStrokeIndex: si, bestHit: hit };
        runs.push(run);
        away = false;
      } else if (hit.distance <= radius && run) {
        run.endStrokeIndex = si;
        if (hit.distance < run.bestHit.distance) {
          run.bestHit = hit;
          run.bestStrokeIndex = si;
        }
      } else if (hit.distance > leaveRadius) {
        away = true;
        run = null;
      }
    }
    return runs;
  }

  // A valid adjustment must EXIT through one border and RE-ENTER that same border.
  // Treat contacts as separate runs, not simply first/last nearby point. This stops
  // a tight hairpin on the border from snapping to a nearby but unrelated branch.
  function findTargetBorder() {
    if (stroke.length < 4) return null;
    let best = null;

    for (let bi = 0; bi < state.borders.length; bi++) {
      const border = state.borders[bi];
      const points = border.points;
      if (!yearVisible(border) || !Array.isArray(points) || points.length < 4) continue;

      const runs = contactRuns(points);
      if (runs.length < 2) continue;
      const first = runs[0];
      const last = runs.at(-1);
      if (last.bestStrokeIndex - first.bestStrokeIndex < 3) continue;
      if (Math.abs(last.bestHit.position - first.bestHit.position) < 1.5) continue;

      const score = first.bestHit.distance + last.bestHit.distance;
      if (!best || score < best.score) {
        best = {
          arrayIndex: bi,
          border,
          startPosition: first.bestHit.position,
          endPosition: last.bestHit.position,
          startSnap: [first.bestHit.x, first.bestHit.y],
          endSnap: [last.bestHit.x, last.bestHit.y],
          strokeStartIndex: first.bestStrokeIndex,
          strokeEndIndex: last.bestStrokeIndex,
          score
        };
      }
    }
    return best;
  }

  function pointAtPosition(points, pos) {
    const i = Math.max(0, Math.min(points.length - 2, Math.floor(pos)));
    const t = Math.max(0, Math.min(1, pos - i));
    return [points[i][0] + (points[i + 1][0] - points[i][0]) * t, points[i][1] + (points[i + 1][1] - points[i][1]) * t];
  }

  function buildMerged(points, target) {
    let startPos = target.startPosition, endPos = target.endPosition;
    let replacement = stroke.slice(target.strokeStartIndex, target.strokeEndIndex + 1);
    let startSnap = target.startSnap, endSnap = target.endSnap;
    if (startPos > endPos) {
      [startPos, endPos] = [endPos, startPos];
      [startSnap, endSnap] = [endSnap, startSnap];
      replacement = [...replacement].reverse();
    }

    const lowSeg = Math.floor(startPos);
    const highSeg = Math.floor(endPos);
    const middle = replacement.slice(1, -1).map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]);
    const snappedStart = [+startSnap[0].toFixed(2), +startSnap[1].toFixed(2)];
    const snappedEnd = [+endSnap[0].toFixed(2), +endSnap[1].toFixed(2)];

    const prefix = points.slice(0, lowSeg + 1);
    const suffix = points.slice(highSeg + 1);
    const merged = [...prefix, snappedStart, ...middle, snappedEnd, ...suffix];
    return { merged, replacement: [snappedStart, ...middle, snappedEnd], prefix, suffix };
  }

  function orient(a, b, c) {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  }

  function segmentsCross(a, b, c, d) {
    const eps = 1e-6;
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    return ((o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps)) && ((o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps));
  }

  function hasSelfIntersection(points) {
    for (let i = 0; i < points.length - 1; i++) {
      for (let j = i + 2; j < points.length - 1; j++) {
        if (i === 0 && j === points.length - 2) continue;
        if (segmentsCross(points[i], points[i + 1], points[j], points[j + 1])) return true;
      }
    }
    return false;
  }

  function crossesRetainedBorder(replacement, prefix, suffix) {
    const retained = [...prefix, ...suffix];
    for (let i = 0; i < replacement.length - 1; i++) {
      for (let j = 0; j < retained.length - 1; j++) {
        const a = replacement[i], b = replacement[i + 1], c = retained[j], d = retained[j + 1];
        // Endpoint touches are expected; only reject genuine crossings.
        if (segmentsCross(a, b, c, d)) return true;
      }
    }
    return false;
  }

  function showStatus(message) {
    statusEl.style.opacity = '1';
    statusEl.textContent = message;
    setTimeout(() => statusEl.style.opacity = '0', 1900);
  }

  function commitAdjustment() {
    const target = findTargetBorder();
    if (!target) {
      showStatus('영토 안에서 시작해 국경을 넘어간 뒤 같은 국경에 다시 들어오게 그려 주세요.');
      return false;
    }
    if (!ownerBeforeStroke || !startCountryId) return false;

    const built = buildMerged(target.border.points, target);
    if (built.merged.length < 2) return false;
    if (hasSelfIntersection(built.replacement) || crossesRetainedBorder(built.replacement, built.prefix, built.suffix)) {
      showStatus('새 국경선이 기존 선과 꼬이거나 교차합니다. 조금 더 단순하게 다시 그려 주세요.');
      return false;
    }

    snapshot();
    state.borders[target.arrayIndex] = { ...target.border, points: built.merged };
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
    helpEl.textContent = '국경 조정: 늘릴 국가의 영토 안에서 시작해 국경을 넘어 새 경로를 그리고 같은 국경으로 다시 들어오세요. 서로 꼬이거나 교차하는 경로는 자동으로 취소됩니다.';
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
    if (stroke.length >= 4) commitAdjustment();
    stroke = [];
    startCountryId = null;
    ownerBeforeStroke = null;
    draftLayer.selectAll('.border-adjust-preview').remove();
  }

  svg.on('pointerup.borderAdjust', finish);
  svg.on('pointercancel.borderAdjust', finish);
})();