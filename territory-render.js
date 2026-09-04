(() => {
  let cacheKey = '';
  let cachedOwner = null;
  let cachedCentroids = null;
  let cachedComponents = null;
  let cachedRasterKey = '';
  let cachedRasterHref = '';

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

  function ownershipKey() {
    const fills = state.fills.filter(yearVisible)
      .map(f => `${f.id}:${f.countryId}:${f.x}:${f.y}`)
      .join('|');
    return `${state.year};${state.countries.map(c => c.id).join(',')};${fills};${borderHash()}`;
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
      let head = 0, tail = 0, sx = 0, sy = 0;
      const pixels = [];
      queue[tail++] = start;
      visited[start] = 1;

      while (head < tail) {
        const idx = queue[head++];
        pixels.push(idx);
        const x = idx % W;
        const y = (idx / W) | 0;
        sx += x; sy += y;
        if (x > 0) { const n = idx - 1; if (!visited[n] && owner[n] === ci) { visited[n] = 1; queue[tail++] = n; } }
        if (x < W - 1) { const n = idx + 1; if (!visited[n] && owner[n] === ci) { visited[n] = 1; queue[tail++] = n; } }
        if (y > 0) { const n = idx - W; if (!visited[n] && owner[n] === ci) { visited[n] = 1; queue[tail++] = n; } }
        if (y < H - 1) { const n = idx + W; if (!visited[n] && owner[n] === ci) { visited[n] = 1; queue[tail++] = n; } }
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

  function buildOwner() {
    const key = ownershipKey();
    if (key === cacheKey && cachedOwner && cachedCentroids && cachedComponents) {
      return { owner: cachedOwner, centroids: cachedCentroids, components: cachedComponents };
    }

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
      centroids.set(state.countries[ci].id, { x: sum.x / sum.count, y: sum.y / sum.count, count: sum.count });
    });

    const components = buildComponents(owner);
    cacheKey = key;
    cachedOwner = owner;
    cachedCentroids = centroids;
    cachedComponents = components;
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

  function rasterKey() {
    return `${cacheKey};${state.countries.map(c => `${c.id}:${c.color}:${alphaFor(c)}`).join('|')}`;
  }

  function buildRaster(owner) {
    const key = rasterKey();
    if (key === cachedRasterKey && cachedRasterHref) return cachedRasterHref;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
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
    cachedRasterHref = canvas.toDataURL();
    cachedRasterKey = key;
    return cachedRasterHref;
  }

  function renderTerritoriesCached() {
    territoryLayer.selectAll('*').remove();
    labelLayer.selectAll('*').remove();
    if (!landMask || !state.fills.some(yearVisible)) return;

    const { owner, components } = buildOwner();
    territoryLayer.append('image')
      .attr('href', buildRaster(owner))
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
      cacheKey = '';
      cachedOwner = null;
      cachedCentroids = null;
      cachedComponents = null;
      cachedRasterKey = '';
      cachedRasterHref = '';
    },
    getCentroid(countryId) { return buildOwner().centroids.get(countryId) || null; },
    getComponents(countryId) { return buildOwner().components.get(countryId) || []; },
    getOwnerMap() { return buildOwner().owner; },
    render: renderTerritoriesCached
  };
})();