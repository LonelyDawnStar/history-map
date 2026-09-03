(() => {
  let cacheKey = '';
  let cachedOwner = null;
  let cachedCentroids = null;

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

  function buildOwner() {
    const key = ownershipKey();
    if (key === cacheKey && cachedOwner && cachedCentroids) {
      return { owner: cachedOwner, centroids: cachedCentroids };
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
      centroids.set(state.countries[ci].id, {
        x: sum.x / sum.count,
        y: sum.y / sum.count,
        count: sum.count
      });
    });

    cacheKey = key;
    cachedOwner = owner;
    cachedCentroids = centroids;
    return { owner, centroids };
  }

  function alphaFor(country) {
    const opacity = Number(country.territoryOpacity);
    const normalized = Number.isFinite(opacity) ? Math.max(0.08, Math.min(1, opacity)) : 0.59;
    return Math.round(normalized * 255);
  }

  function renderTerritoriesCached() {
    territoryLayer.selectAll('*').remove();
    labelLayer.selectAll('*').remove();
    if (!landMask) return;
    if (!state.fills.some(yearVisible)) return;

    const { owner, centroids } = buildOwner();
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
      const centroid = centroids.get(country.id);
      if (!centroid) continue;
      const hasCustom = Number.isFinite(Number(country.labelX)) && Number.isFinite(Number(country.labelY));
      const x = hasCustom ? Number(country.labelX) : centroid.x;
      const y = hasCustom ? Number(country.labelY) : centroid.y;
      labelLayer.append('text')
        .attr('class', 'country-label')
        .attr('data-country-id', country.id)
        .attr('data-auto-x', centroid.x)
        .attr('data-auto-y', centroid.y)
        .attr('x', x).attr('y', y)
        .text(country.name);
    }
  }

  renderTerritories = renderTerritoriesCached;

  window.historyMapTerritoryRender = {
    invalidate() { cacheKey = ''; cachedOwner = null; cachedCentroids = null; },
    getCentroid(countryId) { return buildOwner().centroids.get(countryId) || null; },
    render: renderTerritoriesCached
  };
})();