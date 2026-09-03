(() => {
  const geographyLayer = svg.select('#geographyLayer');
  const DATA = {
    land: 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-50m.json',
    cities: 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_populated_places_simple.geojson',
    rivers: 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_rivers_lake_centerlines.geojson',
    regions: 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_geography_regions_points.geojson'
  };

  let projection = null;
  let geoPath = null;
  let referenceCities = [];
  let majorReferenceCities = [];
  let riverFeatures = [];
  let mountainFeatures = [];
  let ready = false;
  let lastZoomTier = -1;
  let zoomFrame = 0;

  state.cities = Array.isArray(state.cities) ? state.cities : [];

  const showCities = document.getElementById('showCities');
  const showRivers = document.getElementById('showRivers');
  const showMountains = document.getElementById('showMountains');

  function currentOwnerMap() {
    if (!landMask) return null;
    const blocked = buildBarrierMap();
    const owner = new Int32Array(W * H);
    owner.fill(-1);
    const countryIndex = new Map(state.countries.map((c, i) => [c.id, i]));
    state.fills.filter(yearVisible).forEach(fill => {
      const ci = countryIndex.get(fill.countryId);
      if (ci === undefined) return;
      const region = floodRegion(fill.x, fill.y, blocked);
      for (const idx of region) owner[idx] = ci;
    });
    return owner;
  }

  function ownerIndexAt(x, y, owner) {
    if (!owner) return -1;
    const ix = Math.round(x), iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return -1;
    let value = owner[iy * W + ix];
    if (value >= 0) return value;
    for (let r = 1; r <= 4; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = ix + dx, ny = iy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          value = owner[ny * W + nx];
          if (value >= 0) return value;
        }
      }
    }
    return -1;
  }

  function countryAt(x, y) {
    const owner = currentOwnerMap();
    const ci = ownerIndexAt(x, y, owner);
    return ci >= 0 ? state.countries[ci] : null;
  }

  function allCapitalCandidates() {
    const custom = (state.cities || []).filter(yearVisible).map(city => ({...city, custom: true, population: Number(city.population || 0)}));
    return [...majorReferenceCities, ...custom];
  }

  function citiesForCountry(countryId) {
    if (!ready) return [];
    const owner = currentOwnerMap();
    if (!owner) return [];
    return allCapitalCandidates().filter(city => {
      const ci = ownerIndexAt(city.x, city.y, owner);
      return ci >= 0 && state.countries[ci]?.id === countryId;
    }).sort((a, b) => Number(b.population || 0) - Number(a.population || 0) || a.name.localeCompare(b.name));
  }

  function cityById(id) {
    return allCapitalCandidates().find(city => city.id === id) || null;
  }

  function zoomTier() {
    const k = Math.max(0.7, currentTransform.k || 1);
    if (k < 1.45) return 0;
    if (k < 2.8) return 1;
    if (k < 5.5) return 2;
    return 3;
  }

  function riverRankLimit(tier) { return [2, 3, 5, 8][tier]; }
  function regionRankLimit(tier) { return [1, 2, 4, 7][tier]; }
  function displayName(props) { return props?.name_ko || props?.name_en || props?.name || props?.label || ''; }

  function isMajorReferenceCity(city) {
    const pop = Number(city.population || 0);
    // Deliberately strict and independent of zoom: only genuinely major cities.
    return pop >= 4500000 || (city.isNationalCapital && pop >= 2500000 && city.scalerank <= 2);
  }

  function renderCityGroups(cities, ownerMap) {
    const groups = geographyLayer.selectAll('g.reference-city')
      .data(cities, d => d.id)
      .join(enter => {
        const g = enter.append('g').attr('class', 'reference-city');
        g.append('circle').attr('class', 'reference-city-dot').attr('r', 2.8);
        g.append('text').attr('class', 'reference-city-label').attr('x', 6).attr('y', 3.5);
        return g;
      });

    groups.attr('transform', d => `translate(${d.x},${d.y})`)
      .classed('custom-city', d => !!d.custom)
      .style('pointer-events', d => d.custom ? 'all' : 'none');

    groups.each(function(city) {
      const ci = ownerIndexAt(city.x, city.y, ownerMap);
      const ownerCountry = ci >= 0 ? state.countries[ci] : null;
      const isCapital = !!ownerCountry && ownerCountry.capitalCityId === city.id;
      const g = d3.select(this);
      g.classed('capital-city', isCapital);
      g.select('.reference-city-dot').attr('r', isCapital ? 4.1 : (city.custom ? 3.2 : 2.6));
      g.select('.reference-city-label').text(`${isCapital ? '★ ' : ''}${city.name}`);
    });
  }

  function renderGeography() {
    geographyLayer.selectAll('*').remove();
    if (!ready || !projection || !geoPath) return;

    const tier = zoomTier();
    const ownerMap = currentOwnerMap();

    if (showRivers?.checked !== false) {
      const rivers = riverFeatures.filter(f => Number(f.properties?.scalerank ?? 99) <= riverRankLimit(tier));
      geographyLayer.selectAll('path.reference-river')
        .data(rivers, d => d.properties?.ne_id || `${d.properties?.name}-${d.properties?.scalerank}`)
        .join('path').attr('class', 'reference-river').attr('d', geoPath);

      const labeledRivers = tier === 0 ? [] : rivers.filter(f =>
        displayName(f.properties) && Number(f.properties?.scalerank ?? 99) <= Math.max(2, riverRankLimit(tier) - 2)
      );
      geographyLayer.selectAll('text.reference-river-label')
        .data(labeledRivers, d => d.properties?.ne_id || `${d.properties?.name}-label`)
        .join('text').attr('class', 'reference-label reference-river-label')
        .attr('x', d => geoPath.centroid(d)[0]).attr('y', d => geoPath.centroid(d)[1])
        .text(d => displayName(d.properties));
    }

    if (showMountains?.checked !== false) {
      const mountains = mountainFeatures.filter(f => Number(f.properties?.scalerank ?? 99) <= regionRankLimit(tier));
      const groups = geographyLayer.selectAll('g.reference-mountain')
        .data(mountains, d => d.properties?.ne_id || `${displayName(d.properties)}-${d.geometry?.coordinates?.join(',')}`)
        .join(enter => {
          const g = enter.append('g').attr('class', 'reference-mountain');
          g.append('text').attr('class', 'mountain-symbol').text('▲');
          g.append('text').attr('class', 'reference-label reference-mountain-label').attr('x', 7).attr('y', 4);
          return g;
        });
      groups.attr('transform', d => {
        const p = projection(d.geometry.coordinates);
        return `translate(${p?.[0] ?? -999},${p?.[1] ?? -999})`;
      });
      groups.select('.reference-mountain-label').style('display', tier === 0 ? 'none' : null).text(d => displayName(d.properties));
    }

    if (showCities?.checked !== false) {
      const custom = (state.cities || []).filter(yearVisible).map(city => ({...city, custom: true}));
      renderCityGroups([...majorReferenceCities, ...custom], ownerMap);
    }
  }

  [showCities, showRivers, showMountains].forEach(input => input?.addEventListener('change', renderGeography));

  zoom.on('zoom.geography', () => {
    cancelAnimationFrame(zoomFrame);
    zoomFrame = requestAnimationFrame(() => {
      const tier = zoomTier();
      if (tier !== lastZoomTier) {
        lastZoomTier = tier;
        renderGeography();
      }
    });
  });

  async function loadReferenceGeography() {
    try {
      const [worldRes, cityRes, riverRes, regionRes] = await Promise.all([
        fetch(DATA.land), fetch(DATA.cities), fetch(DATA.rivers), fetch(DATA.regions)
      ]);
      if (![worldRes, cityRes, riverRes, regionRes].every(r => r.ok)) throw new Error('reference geography load failed');

      const [world, cityData, riverData, regionData] = await Promise.all([
        worldRes.json(), cityRes.json(), riverRes.json(), regionRes.json()
      ]);
      const land = topojson.feature(world, world.objects.land);
      projection = d3.geoNaturalEarth1().fitExtent([[22,24],[1178,596]], land);
      geoPath = d3.geoPath(projection);

      referenceCities = (cityData.features || []).map((feature, index) => {
        const props = feature.properties || {};
        const point = projection(feature.geometry.coordinates);
        return {
          id: `ne-city-${props.ne_id ?? index}`,
          name: props.name || props.nameascii || '도시',
          x: point?.[0] ?? -999,
          y: point?.[1] ?? -999,
          longitude: feature.geometry.coordinates[0],
          latitude: feature.geometry.coordinates[1],
          scalerank: Number(props.scalerank ?? 10),
          population: Number(props.pop_max ?? 0),
          isNationalCapital: Number(props.adm0cap ?? 0) === 1,
          worldCity: Number(props.worldcity ?? 0) === 1,
          sourceCountry: props.adm0name || '',
          custom: false
        };
      }).filter(city => Number.isFinite(city.x) && Number.isFinite(city.y));

      majorReferenceCities = referenceCities.filter(isMajorReferenceCity);

      riverFeatures = (riverData.features || []).filter(feature => /river|lake centerline/i.test(feature.properties?.featurecla || ''));
      mountainFeatures = (regionData.features || []).filter(feature => {
        const cls = String(feature.properties?.featurecla || '');
        const name = String(feature.properties?.name || '');
        return /mountain|range|plateau|highland|hill|massif/i.test(`${cls} ${name}`);
      });

      ready = true;
      lastZoomTier = zoomTier();
      renderGeography();
      window.dispatchEvent(new CustomEvent('historymap:geography-ready'));
    } catch (error) {
      console.error('기본 지리 데이터 로드 실패:', error);
      statusEl.style.opacity = '1';
      statusEl.textContent = '도시·강·산지 데이터를 불러오지 못했습니다.';
      setTimeout(() => statusEl.style.opacity = '0', 2200);
    }
  }

  window.historyMapGeography = {
    get ready() { return ready; },
    citiesForCountry,
    cityById,
    countryAt,
    render: renderGeography
  };

  loadReferenceGeography();
})();