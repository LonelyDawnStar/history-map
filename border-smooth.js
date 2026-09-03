(() => {
  const MIN_SAMPLE_SCREEN_PX = 1.1;
  const LAND_TOLERANCE_SCREEN_PX = 2.2;
  const SHORT_GAP_SCREEN_PX = 8;

  let lastRawPoint = null;
  let pendingGap = [];
  let gapLength = 0;
  let finishedSegments = [];

  function mapUnits(screenPx) {
    return screenPx / Math.max(0.7, currentTransform.k);
  }

  function nearLand(x, y) {
    if (isLand(x, y)) return true;
    const r = mapUnits(LAND_TOLERANCE_SCREEN_PX);
    const checks = [
      [r, 0], [-r, 0], [0, r], [0, -r],
      [r * .7, r * .7], [r * .7, -r * .7],
      [-r * .7, r * .7], [-r * .7, -r * .7]
    ];
    return checks.some(([dx, dy]) => isLand(x + dx, y + dy));
  }

  function pushPoint(point) {
    const last = state.draftStroke.at(-1);
    if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) >= mapUnits(MIN_SAMPLE_SCREEN_PX)) {
      state.draftStroke.push(point);
    }
  }

  function samplesBetween(a, b) {
    const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const step = Math.max(0.25, mapUnits(0.8));
    const count = Math.max(1, Math.ceil(distance / step));
    const out = [];
    for (let i = 1; i <= count; i++) {
      const t = i / count;
      out.push([
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t
      ]);
    }
    return out;
  }

  function stashCurrentSegment() {
    if (state.draftStroke.length > 1) {
      finishedSegments.push(state.draftStroke.map(p => [p[0], p[1]]));
    }
    state.draftStroke = [];
  }

  function resetStrokeBuffers() {
    state.draftStroke = [];
    finishedSegments = [];
    pendingGap = [];
    gapLength = 0;
    lastRawPoint = null;
  }

  function commitAllSegments() {
    stashCurrentSegment();
    if (!finishedSegments.length) {
      resetStrokeBuffers();
      return false;
    }

    snapshot();
    for (const segment of finishedSegments) {
      state.borders.push({
        id: uid(),
        points: segment.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]),
        fromYear: state.year,
        toYear: 9999
      });
    }
    resetStrokeBuffers();
    return true;
  }

  function addRawPoint(point) {
    if (!lastRawPoint) {
      lastRawPoint = point;
      if (nearLand(point[0], point[1])) pushPoint(point);
      return;
    }

    const interpolated = samplesBetween(lastRawPoint, point);
    let previous = lastRawPoint;

    for (const sample of interpolated) {
      const seg = Math.hypot(sample[0] - previous[0], sample[1] - previous[1]);
      previous = sample;

      if (nearLand(sample[0], sample[1])) {
        if (pendingGap.length && gapLength <= mapUnits(SHORT_GAP_SCREEN_PX) && state.draftStroke.length) {
          pendingGap.forEach(pushPoint);
        } else if (gapLength > mapUnits(SHORT_GAP_SCREEN_PX) && state.draftStroke.length) {
          stashCurrentSegment();
        }

        pendingGap = [];
        gapLength = 0;
        pushPoint(sample);
      } else {
        // Before the first land contact, simply track movement through the sea.
        // Once a land stroke exists, short sea gaps may still be bridged as before.
        if (state.draftStroke.length || finishedSegments.length) {
          pendingGap.push(sample);
          gapLength += seg;
        } else {
          pendingGap = [];
          gapLength = 0;
        }
      }
    }

    lastRawPoint = point;
  }

  svg.on('pointerdown.editor', event => {
    if (state.tool !== 'border') return;
    event.preventDefault();
    const point = mapPoint(event);

    // Start tracking anywhere. If the stroke begins over the ocean,
    // nothing is drawn until the pointer first enters land.
    state.drawing = true;
    resetStrokeBuffers();
    addRawPoint(point);
    svg.node().setPointerCapture?.(event.pointerId);
    renderDraft();
  });

  svg.on('pointermove.editor', event => {
    if (state.tool !== 'border' || !state.drawing) return;
    event.preventDefault();
    addRawPoint(mapPoint(event));
    renderDraft();
  });

  function finishSmoothStroke() {
    if (state.tool !== 'border' || !state.drawing) return;
    state.drawing = false;
    const changed = commitAllSegments();
    draftLayer.selectAll('*').remove();
    if (changed) {
      renderBorders();
      renderTerritories();
    }
  }

  svg.on('pointerup.editor', finishSmoothStroke);
  svg.on('pointercancel.editor', finishSmoothStroke);

  renderDraft = function () {
    draftLayer.selectAll('*').remove();
    const line = d3.line()
      .x(d => d[0])
      .y(d => d[1])
      .curve(d3.curveCatmullRom.alpha(0.45));

    const segments = [...finishedSegments];
    if (state.draftStroke.length > 1) segments.push(state.draftStroke);

    draftLayer.selectAll('path.draft-line')
      .data(segments)
      .join('path')
      .attr('class', 'draft-line freehand')
      .attr('d', d => line(d));
  };

  renderBorders = function () {
    const line = d3.line()
      .x(d => d[0])
      .y(d => d[1])
      .curve(d3.curveCatmullRom.alpha(0.45));

    borderLayer.selectAll('polyline').remove();
    borderLayer.selectAll('path.border-line')
      .data(state.borders.filter(yearVisible), d => d.id)
      .join('path')
      .attr('class', 'border-line')
      .attr('d', d => line(d.points));
  };
})();
