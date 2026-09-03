(() => {
  state.cities = Array.isArray(state.cities) ? state.cities : [];
  state.rivers = Array.isArray(state.rivers) ? state.rivers : [];
  state.mountains = Array.isArray(state.mountains) ? state.mountains : [];

  const geographyLayer = svg.select('#geographyLayer');
  let drawingFeature = null;
  let featurePoints = [];

  toolHelp.city = '도시 도구: 육지를 누르면 주요 도시를 추가합니다. 선택한 국가 영토 안이면 그 국가의 도시로 자동 등록됩니다.';
  toolHelp.river = '강 도구: 손가락이나 펜으로 강줄기를 그린 뒤 이름을 입력합니다.';
  toolHelp.mountain = '산지 도구: 산맥이나 산지의 흐름을 따라 선을 그리고 이름을 입력합니다.';

  document.querySelectorAll('[data-tool="city"],[data-tool="river"],[data-tool="mountain"]').forEach(btn => {
    btn.addEventListener('click', () => {
      helpEl.textContent = toolHelp[btn.dataset.tool];
      svg.style('cursor', btn.dataset.tool === 'city' ? 'cell' : 'crosshair');
    });
  });

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

  function countryAt(x, y) {
    const owner = currentOwnerMap();
    if (!owner) return null;
    const ix = Math.round(x), iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return null;
    const ci = owner[iy * W + ix];
    return ci >= 0 ? state.countries[ci] : null;
  }

  function citiesForCountry(countryId) {
    return state.cities.filter(city => yearVisible(city) && countryAt(city.x, city.y)?.id === countryId);
  }

  function renderGeography() {
    geographyLayer.selectAll('*').remove();

    const riverLine = d3.line().x(d => d[0]).y(d => d[1]).curve(d3.curveCatmullRom.alpha(0.45));
    geographyLayer.selectAll('path.map-river')
      .data(state.rivers.filter(yearVisible), d => d.id)
      .join('path')
      .attr('class', 'map-river')
      .attr('d', d => riverLine(d.points));

    geographyLayer.selectAll('text.river-label')
      .data(state.rivers.filter(yearVisible).filter(d => d.name), d => d.id)
      .join('text')
      .attr('class', 'geo-label river-label')
      .attr('x', d => d.points[Math.floor(d.points.length / 2)]?.[0] ?? 0)
      .attr('y', d => d.points[Math.floor(d.points.length / 2)]?.[1] ?? 0)
      .text(d => d.name);

    const mountainLine = d3.line().x(d => d[0]).y(d => d[1]).curve(d3.curveCatmullRom.alpha(0.35));
    geographyLayer.selectAll('path.map-mountain')
      .data(state.mountains.filter(yearVisible), d => d.id)
      .join('path')
      .attr('class', 'map-mountain')
      .attr('d', d => mountainLine(d.points));

    geographyLayer.selectAll('text.mountain-label')
      .data(state.mountains.filter(yearVisible).filter(d => d.name), d => d.id)
      .join('text')
      .attr('class', 'geo-label mountain-label')
      .attr('x', d => d.points[Math.floor(d.points.length / 2)]?.[0] ?? 0)
      .attr('y', d => d.points[Math.floor(d.points.length / 2)]?.[1] ?? 0)
      .text(d => d.name);

    const cities = state.cities.filter(yearVisible);
    const groups = geographyLayer.selectAll('g.map-city')
      .data(cities, d => d.id)
      .join(enter => {
        const g = enter.append('g').attr('class', 'map-city');
        g.append('circle').attr('class', 'city-dot').attr('r', 3.4);
        g.append('text').attr('class', 'city-label').attr('x', 7).attr('y', 4);
        return g;
      });

    groups.attr('transform', d => `translate(${d.x},${d.y})`);
    groups.each(function(city) {
      const owner = countryAt(city.x, city.y);
      const isCapital = !!owner && owner.capitalCityId === city.id;
      const g = d3.select(this);
      g.classed('capital-city', isCapital);
      g.select('.city-dot').attr('r', isCapital ? 4.2 : 3.4);
      g.select('.city-label').text(`${isCapital ? '★ ' : ''}${city.name}`);
    });
  }

  const baseRenderAll = renderAll;
  renderAll = function() {
    baseRenderAll();
    renderGeography();
  };

  const baseRenderTerritoriesForGeo = renderTerritories;
  renderTerritories = function() {
    baseRenderTerritoriesForGeo();
    renderGeography();
  };

  function beginFeature(tool, point) {
    drawingFeature = tool;
    featurePoints = [point];
    state.drawing = true;
    svg.node().setPointerCapture?.(window.event?.pointerId);
  }

  function drawFeatureDraft() {
    draftLayer.selectAll('.geo-draft').remove();
    if (!drawingFeature || featurePoints.length < 2) return;
    const line = d3.line().x(d => d[0]).y(d => d[1]).curve(d3.curveCatmullRom.alpha(0.4));
    draftLayer.append('path').attr('class', `geo-draft geo-draft-${drawingFeature}`).attr('d', line(featurePoints));
  }

  function finishFeature() {
    if (!drawingFeature) return;
    const tool = drawingFeature;
    drawingFeature = null;
    state.drawing = false;
    draftLayer.selectAll('.geo-draft').remove();
    if (featurePoints.length < 2) { featurePoints = []; return; }

    const name = prompt(tool === 'river' ? '강 이름' : '산지 / 산맥 이름', '')?.trim() ?? '';
    snapshot();
    const item = {
      id: uid(),
      name,
      points: featurePoints.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]),
      fromYear: state.year,
      toYear: 9999
    };
    if (tool === 'river') state.rivers.push(item);
    else state.mountains.push(item);
    featurePoints = [];
    renderGeography();
  }

  svg.on('pointerdown.geography', event => {
    if (state.tool !== 'river' && state.tool !== 'mountain') return;
    event.preventDefault();
    const p = mapPoint(event);
    if (!isLand(p[0], p[1])) return;
    drawingFeature = state.tool;
    featurePoints = [p];
    state.drawing = true;
    svg.node().setPointerCapture?.(event.pointerId);
    drawFeatureDraft();
  });

  svg.on('pointermove.geography', event => {
    if (!drawingFeature || !state.drawing) return;
    event.preventDefault();
    const p = mapPoint(event);
    const last = featurePoints.at(-1);
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1.2 / Math.max(0.7, currentTransform.k)) {
      featurePoints.push(p);
      drawFeatureDraft();
    }
  });

  svg.on('pointerup.geography', finishFeature);
  svg.on('pointercancel.geography', finishFeature);

  svg.on('click.geography', event => {
    if (state.tool !== 'city') return;
    const [x, y] = mapPoint(event);
    if (!isLand(x, y)) return;
    const name = prompt('도시 이름', '')?.trim();
    if (!name) return;
    snapshot();
    state.cities.push({
      id: uid(), name,
      x: +x.toFixed(2), y: +y.toFixed(2),
      fromYear: state.year, toYear: 9999
    });
    renderGeography();
  });

  const originalSnapshot = snapshot;
  snapshot = function() {
    state.history.push(JSON.stringify({
      countries: state.countries,
      borders: state.borders,
      fills: state.fills,
      events: state.events,
      cities: state.cities,
      rivers: state.rivers,
      mountains: state.mountains,
      activeCountryId: state.activeCountryId,
      year: state.year
    }));
    if (state.history.length > 40) state.history.shift();
  };

  restoreSnapshot = function(raw) {
    const d = JSON.parse(raw);
    state.countries = d.countries || [];
    state.borders = d.borders || [];
    state.fills = d.fills || [];
    state.events = d.events || [];
    state.cities = d.cities || [];
    state.rivers = d.rivers || [];
    state.mountains = d.mountains || [];
    state.activeCountryId = d.activeCountryId || null;
    state.year = Number(d.year ?? 1936);
    yearInput.value = state.year;
    if (state.year >= 1800 && state.year <= 2100) timeline.value = state.year;
    renderAll();
  };

  document.getElementById('exportBtn').addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const data = {
      version: 3,
      savedAt: new Date().toISOString(),
      year: state.year,
      countries: state.countries,
      borders: state.borders,
      fills: state.fills,
      events: state.events,
      cities: state.cities,
      rivers: state.rivers,
      mountains: state.mountains
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'history-map-project.json';
    a.click();
    URL.revokeObjectURL(url);
  }, true);

  document.getElementById('importInput').addEventListener('change', async event => {
    event.stopImmediatePropagation();
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      snapshot();
      state.countries = Array.isArray(d.countries) ? d.countries : [];
      state.borders = Array.isArray(d.borders) ? d.borders : [];
      state.fills = Array.isArray(d.fills) ? d.fills : [];
      state.events = Array.isArray(d.events) ? d.events : [];
      state.cities = Array.isArray(d.cities) ? d.cities : [];
      state.rivers = Array.isArray(d.rivers) ? d.rivers : [];
      state.mountains = Array.isArray(d.mountains) ? d.mountains : [];
      state.year = Number(d.year ?? state.year);
      state.activeCountryId = state.countries[0]?.id || null;
      yearInput.value = state.year;
      if (state.year >= 1800 && state.year <= 2100) timeline.value = state.year;
      renderAll();
    } catch (_) {
      alert('JSON 파일을 읽지 못했습니다.');
    } finally {
      event.target.value = '';
    }
  }, true);

  window.historyMapGeography = { citiesForCountry, countryAt, render: renderGeography };
  renderGeography();
})();
