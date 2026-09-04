(() => {
  let cacheKey = '';
  let cachedOwner = null;
  let cachedCentroids = null;
  let cachedComponents = null;
  let cachedBorderHash = 0;
  let cachedFillSignature = '';
  let carryOwner = null;
  let carryBorderHash = 0;
  let carryFillSignature = '';

  function borderHash() {
    let hash = 2166136261 >>> 0;
    for (const border of state.borders) {
      if (!yearVisible(border)) continue;
      const points = border.points || [];
      hash ^= points.length; hash = Math.imul(hash, 16777619);
      for (let i = 0; i < points.length; i += 4) {
        const p = points[i] || [0, 0];
        hash ^= Math.round(p[0] * 10); hash = Math.imul(hash, 16777619);
        hash ^= Math.round(p[1] * 10); hash = Math.imul(hash, 16777619);
      }
      const p = points.at(-1);
      if (p) {
        hash ^= Math.round(p[0] * 10); hash = Math.imul(hash, 16777619);
        hash ^= Math.round(p[1] * 10); hash = Math.imul(hash, 16777619);
      }
    }
    return hash >>> 0;
  }

  function fillSignature() {
    return `${state.year};${state.countries.map(c => c.id).join(',')};${state.fills.filter(yearVisible)
      .map(f => `${f.id}:${f.countryId}:${f.x}:${f.y}`)
      .join('|')}`;
  }

  function ownershipKey() {
    return `${fillSignature()};${borderHash()}`;
  }

  function componentAnchor(indices, meanX, meanY) {
    let bestIdx = indices[0];
    let bestDist = Infinity;
    const step = Math.max(1, Math.floor(indices.length / 1400));
    for (let i = 0; i < indices.length; i += step) {
      const idx = indices[i];
      const x = idx % W;
      const y = (idx / W) | 0;
      const dist = (x - meanX) * (x - meanX) + (y - meanY) * (y - meanY);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    }
    return { x: bestIdx % W, y: (bestIdx / W) | 0 };
  }

  function buildComponents(owner) {
    const visited = new Uint8Array(W * H);
    const byCountry = new Map();
    const queue = new Int32Array(W * H);

    for (let start = 0; start < owner.length; start++) {
      const ci = owner[start];
      if (ci < 0 || visited[start]) continue;

      let head = 0, tail = 0;
      let sx = 0, sy = 0;
      const pixels = [];
      queue[tail++] = start;
      visited[start] = 1;

      while (head < tail) {
        const idx = queue[head++];
        pixels.push(idx);
        const x = idx % W;
        const y = (idx / W) | 0;
        sx += x; sy += y;

        if (x > 0) {
          const n = idx - 1;
          if (!visited[n] && owner[n] === ci) { visited[n] = 1; queue[tail++] = n; }
        }
        if (x < W - 1) {
          const n = idx + 1;
          if (!visited[n] && owner[n] === ci) { visited[n] = 1; queue[tail++] = n; }
        }
        if (y > 0) {
          const n = idx - W;
          if (!visited[n] && owner[n] === ci) { visited[n] = 1; queue[tail++] = n; }
        }
        if (y < H - 1) {
          const n = idx + W;
          if (!visited[n] && owner[n] === ci) { visited[n] = 1; queue[tail++] = n; }
        }
      }

      const count = pixels.length;
      const meanX = sx / count;
      const meanY = sy / count;
      const anchor = componentAnchor(pixels, meanX, meanY);
      const countryId = state.countries[ci]?.id;
      if (!countryId) continue;
      if (!byCountry.has(countryId)) byCountry.set(countryId, []);
      byCountry.get(countryId).push({ x: anchor.x, y: anchor.y, count });
    }

    for (const components of byCountry.values()) {
      components.sort((a, b) => b.count - a.count);
      components.forEach((component, index) => { component.rank = index; });
    }
    return byCountry;
  }

  // Preserve every piece of territory that existed immediately before a border edit.
  // We inspect the OLD owner map through the NEW barriers and make sure each resulting
  // connected piece has its own valid fill seed. This prevents a country from vanishing
  // when a border-adjust stroke crosses its only seed or splits the mainland in two.
  function ensureSeedsForPreviousTerritory(previousOwner, blocked, countryIndex) {
    if (!previousOwner || previousOwner.length !== W * H) return 0;

    const visited = new Uint8Array(W * H);
    const queue = new Int32Array(W * H);
    const componentMark = new Uint32Array(W * H);
    let mark = 0;
    const additions = [];
    const visibleFills = state.fills.filter(yearVisible);

    for (let start = 0; start < previousOwner.length; start++) {
      const ci = previousOwner[start];
      if (ci < 0 || blocked[start] || visited[start]) continue;

      let head = 0, tail = 0, sx = 0, sy = 0;
      queue[tail++] = start;
      visited[start] = 1;
      mark++;

      while (head < tail) {
        const idx = queue[head++];
        componentMark[idx] = mark;
        const x = idx % W, y = (idx / W) | 0;
        sx += x; sy += y;

        if (x > 0) {
          const n = idx - 1;
          if (!visited[n] && !blocked[n] && previousOwner[n] === ci) { visited[n] = 1; queue[tail++] = n; }
        }
        if (x < W - 1) {
          const n = idx + 1;
          if (!visited[n] && !blocked[n] && previousOwner[n] === ci) { visited[n] = 1; queue[tail++] = n; }
        }
        if (y > 0) {
          const n = idx - W;
          if (!visited[n] && !blocked[n] && previousOwner[n] === ci) { visited[n] = 1; queue[tail++] = n; }
        }
        if (y < H - 1) {
          const n = idx + W;
          if (!visited[n] && !blocked[n] && previousOwner[n] === ci) { visited[n] = 1; queue[tail++] = n; }
        }
      }

      const country = state.countries[ci];
      if (!country || !countryIndex.has(country.id) || tail === 0) continue;

      // A raw seed must actually lie inside this old territory piece. A seed sitting
      // on the new border does not count; safe-flood may otherwise jump to one side.
      let hasValidSeed = false;
      for (const fill of visibleFills) {
        if (fill.countryId !== country.id) continue;
        const fx = Math.round(fill.x), fy = Math.round(fill.y);
        if (fx < 0 || fy < 0 || fx >= W || fy >= H) continue;
        const fidx = fy * W + fx;
        if (!blocked[fidx] && componentMark[fidx] === mark) {
          hasValidSeed = true;
          break;
        }
      }
      if (hasValidSeed) continue;

      const meanX = sx / tail, meanY = sy / tail;
      let seedIdx = start, best = Infinity;
      const step = Math.max(1, Math.floor(tail / 1000));
      for (let i = 0; i < tail; i += step) {
        const idx = queue[i];
        const x = idx % W, y = (idx / W) | 0;
        const d = (x - meanX) * (x - meanX) + (y - meanY) * (y - meanY);
        if (d < best) { best = d; seedIdx = idx; }
      }

      additions.push({
        id: uid(),
        countryId: country.id,
        x: seedIdx % W,
        y: (seedIdx / W) | 0,
        fromYear: state.year,
        toYear: 9999,
        autoSplit: true
      });
    }

    if (additions.length) state.fills.push(...additions);
    return additions.length;
  }

  function buildOwner() {
    const currentBorderHash = borderHash();
    const currentFillSignature = fillSignature();
    const key = `${currentFillSignature};${currentBorderHash}`;
    if (key === cacheKey && cachedOwner && cachedCentroids && cachedComponents) {
      return { owner: cachedOwner, centroids: cachedCentroids, components: cachedComponents };
    }

    const previousOwner = carryOwner || cachedOwner;
    const previousBorderHash = carryOwner ? carryBorderHash : cachedBorderHash;
    const previousFillSignature = carryOwner ? carryFillSignature : cachedFillSignature;
    carryOwner = null;
    carryBorderHash = 0;
    carryFillSignature = '';

    const blocked = buildBarrierMap();
    const countryIndex = new Map(state.countries.map((c, i) => [c.id, i]));
    const borderChanged = !!previousOwner && previousFillSignature === currentFillSignature && previousBorderHash !== currentBorderHash;

    // Before flooding, repair the seed set itself. Doing this first is important:
    // rendering first and repairing afterwards lets a blocked seed migrate to the
    // wrong side and can make the original country disappear for one render.
    const addedSeeds = borderChanged
      ? ensureSeedsForPreviousTerritory(previousOwner, blocked, countryIndex)
      : 0;

    const owner = new Int32Array(W * H);
    owner.fill(-1);

    for (const fill of state.fills) {
      if (!yearVisible(fill)) continue;
      const ci = countryIndex.get(fill.countryId);
      if (ci === undefined) continue;

      const fx = Math.round(fill.x), fy = Math.round(fill.y);
      // During a border edit, never let an old seed sitting exactly on the new
      // border use safe-flood's nearest-side fallback. The repaired seeds above
      // already preserve all previous pieces deterministically.
      if (borderChanged && fx >= 0 && fy >= 0 && fx < W && fy < H && blocked[fy * W + fx]) continue;

      const region = floodRegion(fill.x, fill.y, blocked);
      for (const idx of region) owner[idx] = ci;
    }

    const sums = state.countries.map(() => ({ x: 0, y: 0, count: 0 }));
    for (let idx = 0; idx < owner.length; idx++) {
      const ci = owner[idx];
      if (ci < 0) continue;
      const sum = sums[ci];
      sum.x += idx % W;
      sum.y += (idx / W) | 0;
      sum.count++;
    }

    const centroids = new Map();
    sums.forEach((sum, ci) => {
      if (!sum.count) return;
      centroids.set(state.countries[ci].id, {
        x: sum.x / sum.count,
        y: sum.y / sum.count,
        count: sum.count
      });
    });

    const components = buildComponents(owner);
    cacheKey = ownershipKey();
    cachedOwner = owner;
    cachedCentroids = centroids;
    cachedComponents = components;
    cachedBorderHash = currentBorderHash;
    cachedFillSignature = fillSignature();

    if (addedSeeds) window.historyMapAutosave?.save?.();
    return { owner, centroids, components };
  }

  function alphaFor(country) {
    const opacity = Number(country.territoryOpacity);
    const normalized = Number.isFinite(opacity) ? Math.max(0.08, Math.min(1, opacity)) : 0.59;
    return Math.round(normalized * 255);
  }

  function visibleComponents(country, components) {
    if (!components?.length) return [];
    const largest = components[0].count;
    const minArea = Math.max(120, Math.round(largest * 0.015));
    return components.filter((component, index) => index === 0 || component.count >= minArea);
  }

  function renderTerritoriesCached() {
    territoryLayer.selectAll('*').remove();
    labelLayer.selectAll('*').remove();
    if (!landMask) return;
    if (!state.fills.some(yearVisible)) return;

    const { owner, components } = buildOwner();
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    const colors = state.countries.map(country => ({ ...hexToRgb(country.color), a: alphaFor(country) }));

    for (let idx = 0; idx < owner.length; idx++) {
      const ci = owner[idx];
      if (ci < 0) continue;
      const color = colors[ci];
      const p = idx * 4;
      img.data[p] = color.r;
      img.data[p + 1] = color.g;
      img.data[p + 2] = color.b;
      img.data[p + 3] = color.a;
    }

    ctx.putImageData(img, 0, 0);
    territoryLayer.append('image')
      .attr('href', canvas.toDataURL())
      .attr('x', 0).attr('y', 0).attr('width', W).attr('height', H)
      .attr('class', 'territory-raster');

    for (const country of state.countries) {
      const parts = visibleComponents(country, components.get(country.id));
      if (!parts.length) continue;

      for (const part of parts) {
        const key = String(part.rank);
        const saved = country.labelPositions?.[key];
        const legacyCustom = part.rank === 0 && Number.isFinite(Number(country.labelX)) && Number.isFinite(Number(country.labelY));
        const x = saved && Number.isFinite(Number(saved.x)) ? Number(saved.x) : (legacyCustom ? Number(country.labelX) : part.x);
        const y = saved && Number.isFinite(Number(saved.y)) ? Number(saved.y) : (legacyCustom ? Number(country.labelY) : part.y);

        labelLayer.append('text')
          .attr('class', 'country-label')
          .attr('data-country-id', country.id)
          .attr('data-component-key', key)
          .attr('data-auto-x', part.x)
          .attr('data-auto-y', part.y)
          .attr('x', x).attr('y', y)
          .style('fill', country.color || '#202020')
          .text(country.name);
      }
    }
  }

  renderTerritories = renderTerritoriesCached;

  window.historyMapTerritoryRender = {
    invalidate() {
      if (cachedOwner) {
        carryOwner = cachedOwner.slice();
        carryBorderHash = cachedBorderHash;
        carryFillSignature = cachedFillSignature;
      }
      cacheKey = '';
      cachedOwner = null;
      cachedCentroids = null;
      cachedComponents = null;
    },
    getCentroid(countryId) { return buildOwner().centroids.get(countryId) || null; },
    getComponents(countryId) { return buildOwner().components.get(countryId) || []; },
    getOwnerMap() { return buildOwner().owner; },
    render: renderTerritoriesCached
  };
})();