(() => {
  function captureOwner() {
    if (!landMask) return null;
    const blocked = buildBarrierMap();
    const owner = new Int32Array(W * H);
    owner.fill(-1);
    const countryIndex = new Map(state.countries.map((c, i) => [c.id, i]));

    for (const fill of state.fills) {
      if (!yearVisible(fill)) continue;
      const ci = countryIndex.get(fill.countryId);
      if (ci === undefined) continue;
      const region = floodRegion(fill.x, fill.y, blocked);
      for (const idx of region) owner[idx] = ci;
    }
    return owner;
  }

  function preserve(previousOwner) {
    if (!previousOwner || previousOwner.length !== W * H || !landMask) return 0;

    const blocked = buildBarrierMap();
    const visited = new Uint8Array(W * H);
    const queue = new Int32Array(W * H);
    const componentOf = new Int32Array(W * H);
    componentOf.fill(-1);
    const components = [];

    // Build the NEW connected land regions exactly once.
    for (let start = 0; start < W * H; start++) {
      if (blocked[start] || visited[start]) continue;
      let head = 0, tail = 0;
      let representative = -1;
      const ownerCounts = new Map();
      queue[tail++] = start;
      visited[start] = 1;
      const componentId = components.length;

      while (head < tail) {
        const idx = queue[head++];
        componentOf[idx] = componentId;
        const oldOwner = previousOwner[idx];
        if (oldOwner >= 0) {
          ownerCounts.set(oldOwner, (ownerCounts.get(oldOwner) || 0) + 1);
          if (representative < 0) representative = idx;
        }
        const x = idx % W, y = (idx / W) | 0;
        if (x > 0) { const n = idx - 1; if (!blocked[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n; } }
        if (x < W - 1) { const n = idx + 1; if (!blocked[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n; } }
        if (y > 0) { const n = idx - W; if (!blocked[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n; } }
        if (y < H - 1) { const n = idx + W; if (!blocked[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n; } }
      }

      components.push({ ownerCounts, representative });
    }

    const seeded = new Set();
    for (const fill of state.fills) {
      if (!yearVisible(fill)) continue;
      const fx = Math.round(fill.x), fy = Math.round(fill.y);
      if (fx < 0 || fy < 0 || fx >= W || fy >= H) continue;
      const idx = fy * W + fx;
      const componentId = componentOf[idx];
      if (componentId < 0 || blocked[idx]) continue;
      seeded.add(`${componentId}:${fill.countryId}`);
    }

    const additions = [];
    for (let componentId = 0; componentId < components.length; componentId++) {
      const info = components[componentId];
      if (info.ownerCounts.size !== 1) continue;
      const [[ci, count]] = info.ownerCounts;
      if (count < 24) continue;
      const country = state.countries[ci];
      if (!country || seeded.has(`${componentId}:${country.id}`)) continue;

      // Find a safe point in this new component that was actually owned by the
      // same country before the border edit. This cannot steal another country's
      // territory because mixed-owner components are deliberately skipped above.
      let seedIdx = -1;
      for (let idx = 0; idx < previousOwner.length; idx++) {
        if (componentOf[idx] === componentId && previousOwner[idx] === ci && !blocked[idx]) {
          seedIdx = idx;
          break;
        }
      }
      if (seedIdx < 0) continue;

      additions.push({
        id: uid(),
        countryId: country.id,
        x: seedIdx % W,
        y: (seedIdx / W) | 0,
        fromYear: state.year,
        toYear: 9999,
        splitPreserved: true
      });
    }

    if (!additions.length) return 0;
    state.fills.push(...additions);
    window.historyMapTerritoryRender?.invalidate?.();
    window.historyMapGeography?.invalidateOwnership?.();
    return additions.length;
  }

  window.historyMapSplitPreserve = { captureOwner, preserve };
})();