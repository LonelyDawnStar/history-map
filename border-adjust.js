(() => {
  const button = document.querySelector('[data-tool="border-adjust"]');
  if (!button) return;

  let drawing = false;
  let pointerId = null;
  let stroke = [];
  let startPoint = null;
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
    let bestIndex = -1, bestSq = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dx = points[i][0] - target[0], dy = points[i][1] - target[1];
      const sq = dx * dx + dy * dy;
      if (sq < bestSq) { bestSq = sq; bestIndex = i; }
    }
    return { index: bestIndex, distance: Math.sqrt(bestSq) };
  }

  function findTargetBorder() {
    if (stroke.length < 2) return null;
    const start = stroke[0], end = stroke.at(-1), radius = snapRadius();
    let best = null;
    for (let i = 0; i < state.borders.length; i++) {
      const border = state.borders[i];
      if (!yearVisible(border) || !Array.isArray(border.points) || border.points.length < 4) continue;
      const a = closestIndex(border.points, start), b = closestIndex(border.points, end);
      if (a.distance > radius || b.distance > radius || Math.abs(a.index - b.index) < 2) continue;
      const score = a.distance + b.distance;
      if (!best || score < best.score) best = { arrayIndex: i, border, startIndex: a.index, endIndex: b.index, score };
    }
    return best;
  }

  function ownerIndexNear(point, owner) {
    if (!point || !owner?.length) return -1;
    const cx = Math.round(point[0]), cy = Math.round(point[1]);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return -1;
    const direct = owner[cy * W + cx];
    if (direct >= 0) return direct;
    const maxR = Math.max(2, Math.ceil(screenToMap(4)));
    for (let r = 1; r <= maxR; r++) {
      let found = -1, ambiguous = false;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const ci = owner[y * W + x];
          if (ci < 0) continue;
          if (found < 0) found = ci;
          else if (found !== ci) ambiguous = true;
        }
      }
      if (found >= 0) return ambiguous ? -1 : found;
    }
    return -1;
  }

  function countOwner(owner, ci) {
    let count = 0;
    if (!owner || ci < 0) return 0;
    for (let i = 0; i < owner.length; i++) if (owner[i] === ci) count++;
    return count;
  }

  function buildCandidateBarrier(targetIndex, mergedPoints) {
    const blocked = new Uint8Array(W * H);
    if (landMask) for (let i = 0; i < W * H; i++) if (landMask[i * 4 + 3] === 0) blocked[i] = 1;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
    for (let i = 0; i < state.borders.length; i++) {
      const border = state.borders[i];
      if (!yearVisible(border)) continue;
      const points = i === targetIndex ? mergedPoints : border.points;
      if (!points?.length) continue;
      ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
      for (let p = 1; p < points.length; p++) ctx.lineTo(points[p][0], points[p][1]);
      ctx.stroke();
    }
    const data = ctx.getImageData(0, 0, W, H).data;
    for (let i = 0; i < W * H; i++) if (data[i * 4 + 3] > 0) blocked[i] = 1;
    return blocked;
  }

  function candidateOwnerMap(targetIndex, mergedPoints) {
    const blocked = buildCandidateBarrier(targetIndex, mergedPoints);
    const owner = new Int32Array(W * H);
    owner.fill(-1);
    const countryIndex = new Map(state.countries.map((country, i) => [country.id, i]));
    for (const fill of state.fills) {
      if (!yearVisible(fill)) continue;
      const ci = countryIndex.get(fill.countryId);
      if (ci === undefined) continue;
      for (const idx of floodRegion(fill.x, fill.y, blocked)) owner[idx] = ci;
    }
    return owner;
  }

  // The only pixels allowed to change ownership are those swept between the
  // old border segment and the replacement stroke. This prevents one tiny edit
  // from opening a flood-fill path and swallowing an entire distant country.
  function buildSweptMask(oldSegment, replacement) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const polygon = [...oldSegment, ...[...replacement].reverse()];
    if (polygon.length < 3) return new Uint8Array(W * H);
    ctx.beginPath();
    ctx.moveTo(polygon[0][0], polygon[0][1]);
    for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i][0], polygon[i][1]);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    // Give the boundary a small tolerance for rasterization differences.
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.stroke();
    const data = ctx.getImageData(0, 0, W, H).data;
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < mask.length; i++) if (data[i * 4 + 3] > 0) mask[i] = 1;
    return mask;
  }

  function changesStayLocal(before, after, sweptMask) {
    let changed = 0, outside = 0;
    for (let i = 0; i < before.length; i++) {
      if (before[i] === after[i]) continue;
      changed++;
      if (!sweptMask[i]) outside++;
    }
    // A few pixels can differ from anti-aliasing / 4px barrier rasterization,
    // but a real topology leak changes hundreds or thousands outside the sweep.
    return { changed, outside, safe: outside <= Math.max(20, Math.round(changed * 0.015)) };
  }

  function showStatus(message) {
    statusEl.style.opacity = '1';
    statusEl.textContent = message;
    setTimeout(() => statusEl.style.opacity = '0', 1900);
  }

  function commitAdjustment() {
    const target = findTargetBorder();
    if (!target) { showStatus('파란 선의 시작과 끝을 같은 기존 국경에 닿게 그려 주세요.'); return false; }
    if (!ownerBeforeStroke || !startCountryId) { showStatus('국경선 바로 위가 아니라, 영토를 늘릴 나라 쪽에서 시작해 주세요.'); return false; }

    const startCi = state.countries.findIndex(country => country.id === startCountryId);
    if (startCi < 0) return false;
    const points = target.border.points;
    const low = Math.min(target.startIndex, target.endIndex);
    const high = Math.max(target.startIndex, target.endIndex);
    const replacement = target.startIndex <= target.endIndex ? stroke : [...stroke].reverse();
    const replacementClean = replacement.slice(1, -1).map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]);
    const merged = [...points.slice(0, low + 1), ...replacementClean, ...points.slice(high)];
    if (merged.length < 2) return false;

    const oldSegment = points.slice(low, high + 1);
    const sweptReplacement = [points[low], ...replacementClean, points[high]];
    const candidateOwner = candidateOwnerMap(target.arrayIndex, merged);
    const beforeArea = countOwner(ownerBeforeStroke, startCi);
    const afterArea = countOwner(candidateOwner, startCi);
    if (afterArea <= beforeArea) {
      const countryName = state.countries[startCi]?.name || '시작 국가';
      showStatus(`${countryName}의 영토가 늘어나는 방향으로 국경을 조정해 주세요.`);
      return false;
    }

    const locality = changesStayLocal(ownerBeforeStroke, candidateOwner, buildSweptMask(oldSegment, sweptReplacement));
    if (!locality.safe) {
      showStatus('이 조정은 다른 지역의 영토까지 크게 바꿉니다. 더 짧은 구간으로 다시 그려 주세요.');
      return false;
    }

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
    helpEl.textContent = '국경 조정: 영토를 늘릴 나라 쪽에서 시작해 파란 선을 그리고 같은 기존 국경에 다시 닿게 하세요. 실제 변경은 기존 국경과 새 선 사이의 영역에만 허용됩니다.';
    svg.style('cursor', 'crosshair');
    window.historyMapToolSettings?.showForTool?.('border-adjust');
  });

  svg.on('pointerdown.borderAdjust', event => {
    if (state.tool !== 'border-adjust') return;
    event.preventDefault();
    drawing = true;
    pointerId = event.pointerId;
    stroke = [];
    startPoint = mapPoint(event);
    ownerBeforeStroke = window.historyMapSplitPreserve?.captureOwner?.() || window.historyMapTerritoryRender?.getOwnerMap?.()?.slice?.() || null;
    const ci = ownerIndexNear(startPoint, ownerBeforeStroke);
    startCountryId = ci >= 0 ? state.countries[ci]?.id || null : null;
    addPoint(startPoint);
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
    startPoint = null;
    startCountryId = null;
    ownerBeforeStroke = null;
    draftLayer.selectAll('.border-adjust-preview').remove();
  }

  svg.on('pointerup.borderAdjust', finish);
  svg.on('pointercancel.borderAdjust', finish);
})();