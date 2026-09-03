(() => {
  const node = svg.node();
  const touches = new Map();
  let gestureActive = false;
  let gestureStart = null;
  let consumedPointers = new Set();
  let suppressClickUntil = 0;

  function pointFromEvent(event) {
    return d3.pointer(event, node);
  }

  function touchEntries() {
    return [...touches.entries()];
  }

  function beginGesture() {
    const entries = touchEntries();
    if (entries.length < 2) return;

    // Finish any in-progress pen/eraser action at the point where the
    // second finger touched, then hand control to the map gesture.
    for (const [pointerId] of entries) {
      try {
        node.dispatchEvent(new PointerEvent('pointercancel', {
          bubbles: true,
          cancelable: true,
          pointerId,
          pointerType: 'touch'
        }));
      } catch (_) {}
      consumedPointers.add(pointerId);
    }

    const a = entries[0][1];
    const b = entries[1][1];
    const center = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const distance = Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]));

    gestureActive = true;
    gestureStart = {
      center,
      distance,
      transform: currentTransform,
      worldAtCenter: currentTransform.invert(center)
    };
    state.drawing = false;
    state.draftStroke = [];
    renderDraft();
  }

  function updateGesture() {
    if (!gestureActive) return;
    const entries = touchEntries();
    if (entries.length < 2) return;

    const a = entries[0][1];
    const b = entries[1][1];
    const center = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const distance = Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]));

    const start = gestureStart;
    const minK = 0.7;
    const maxK = 14;
    const k = Math.max(minK, Math.min(maxK, start.transform.k * (distance / start.distance)));
    const wx = start.worldAtCenter[0];
    const wy = start.worldAtCenter[1];
    const x = center[0] - wx * k;
    const y = center[1] - wy * k;
    const next = d3.zoomIdentity.translate(x, y).scale(k);

    svg.call(zoom.transform, next);
  }

  function finishGestureIfNeeded() {
    if (!gestureActive || touches.size >= 2) return;
    gestureActive = false;
    gestureStart = null;
    suppressClickUntil = performance.now() + 350;
  }

  node.addEventListener('pointerdown', event => {
    if (!event.isTrusted || event.pointerType !== 'touch') return;
    touches.set(event.pointerId, pointFromEvent(event));

    if (touches.size === 2) {
      beginGesture();
      event.preventDefault();
      event.stopImmediatePropagation();
    } else if (gestureActive || consumedPointers.has(event.pointerId)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  node.addEventListener('pointermove', event => {
    if (!event.isTrusted || event.pointerType !== 'touch') return;
    if (touches.has(event.pointerId)) touches.set(event.pointerId, pointFromEvent(event));

    if (gestureActive) {
      updateGesture();
      event.preventDefault();
      event.stopImmediatePropagation();
    } else if (consumedPointers.has(event.pointerId)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  function endPointer(event) {
    if (!event.isTrusted || event.pointerType !== 'touch') return;
    const wasConsumed = consumedPointers.has(event.pointerId);
    touches.delete(event.pointerId);
    finishGestureIfNeeded();

    if (wasConsumed || gestureActive) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    consumedPointers.delete(event.pointerId);
    if (touches.size === 0) consumedPointers.clear();
  }

  node.addEventListener('pointerup', endPointer, true);
  node.addEventListener('pointercancel', endPointer, true);

  node.addEventListener('click', event => {
    if (performance.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})();
