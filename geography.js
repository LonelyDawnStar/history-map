(() => {
  const geographyLayer = svg.select('#geographyLayer');
  const DATA = {
    land: 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-50m.json',
    cities: 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_populated_places_simple.geojson',
    rivers: 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_rivers_lake_centerlines.geojson',
    regions: 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_geography_regions_points.geojson'
  };

  const KO_NAMES = {
    // 주요 도시
    'Tokyo':'도쿄','Jakarta':'자카르타','Delhi':'델리','New Delhi':'뉴델리','Shanghai':'상하이','Manila':'마닐라',
    'Seoul':'서울','Mumbai':'뭄바이','Bombay':'뭄바이','Karachi':'카라치','Beijing':'베이징','Guangzhou':'광저우',
    'Shenzhen':'선전','Dhaka':'다카','Lagos':'라고스','Istanbul':'이스탄불','Osaka':'오사카','Kolkata':'콜카타',
    'Kinshasa':'킨샤사','Cairo':'카이로','Mexico City':'멕시코시티','Lima':'리마','London':'런던','Bangkok':'방콕',
    'Tehran':'테헤란','Bogota':'보고타','Bogotá':'보고타','Ho Chi Minh City':'호찌민','Hong Kong':'홍콩',
    'Baghdad':'바그다드','Riyadh':'리야드','Singapore':'싱가포르','Santiago':'산티아고','Madrid':'마드리드',
    'Barcelona':'바르셀로나','Moscow':'모스크바','Paris':'파리','Rome':'로마','Berlin':'베를린','Vienna':'빈',
    'Athens':'아테네','Warsaw':'바르샤바','Budapest':'부다페스트','Bucharest':'부쿠레슈티','Kiev':'키이우','Kyiv':'키이우',
    'New York':'뉴욕','Los Angeles':'로스앤젤레스','Chicago':'시카고','Toronto':'토론토','São Paulo':'상파울루',
    'Sao Paulo':'상파울루','Buenos Aires':'부에노스아이레스','Rio de Janeiro':'리우데자네이루','Belo Horizonte':'벨루오리존치',
    'Brasilia':'브라질리아','Brasília':'브라질리아','Caracas':'카라카스','Johannesburg':'요하네스버그','Cape Town':'케이프타운',
    'Nairobi':'나이로비','Addis Ababa':'아디스아바바','Khartoum':'하르툼','Alexandria':'알렉산드리아','Casablanca':'카사블랑카',
    'Algiers':'알제','Sydney':'시드니','Melbourne':'멜버른','Perth':'퍼스','Brisbane':'브리즈번','Auckland':'오클랜드',
    'Taipei':'타이베이','Chengdu':'청두','Chongqing':'충칭','Wuhan':'우한','Tianjin':'톈진','Nanjing':'난징',
    'Hangzhou':'항저우','Xi’an':'시안','Xian':'시안','Harbin':'하얼빈','Shenyang':'선양','Busan':'부산',
    'Bangalore':'벵갈루루','Bengaluru':'벵갈루루','Chennai':'첸나이','Hyderabad':'하이데라바드','Ahmedabad':'아마다바드',
    'Pune':'푸네','Surat':'수라트','Yangon':'양곤','Hanoi':'하노이','Kuala Lumpur':'쿠알라룸푸르',
    'Phnom Penh':'프놈펜','Dubai':'두바이','Abu Dhabi':'아부다비','Jeddah':'제다','Damascus':'다마스쿠스',
    'Amman':'암만','Tel Aviv-Yafo':'텔아비브','Jerusalem':'예루살렘','Ankara':'앙카라','Tashkent':'타슈켄트',
    // 강
    'Amazon':'아마존강','Amazonas':'아마존강','Nile':'나일강','Congo':'콩고강','Yangtze':'양쯔강','Chang Jiang':'양쯔강',
    'Yellow River':'황허','Huang He':'황허','Mekong':'메콩강','Ganges':'갠지스강','Ganga':'갠지스강','Indus':'인더스강',
    'Mississippi':'미시시피강','Missouri':'미주리강','Danube':'도나우강','Rhine':'라인강','Volga':'볼가강','Dnieper':'드니프로강',
    'Don':'돈강','Tigris':'티그리스강','Euphrates':'유프라테스강','Ob':'오비강','Yenisei':'예니세이강','Lena':'레나강',
    'Amur':'아무르강','Niger':'나이저강','Zambezi':'잠베지강','Orange':'오렌지강','Murray':'머리강','Darling':'달링강',
    'Parana':'파라나강','Paraná':'파라나강','Orinoco':'오리노코강','Mackenzie':'매켄지강','Yukon':'유콘강',
    // 산지·산맥
    'Himalayas':'히말라야산맥','Himalaya':'히말라야산맥','Andes':'안데스산맥','Rocky Mountains':'로키산맥','Rockies':'로키산맥',
    'Alps':'알프스산맥','Atlas Mountains':'아틀라스산맥','Atlas Mts.':'아틀라스산맥','Ural Mountains':'우랄산맥','Urals':'우랄산맥',
    'Caucasus':'캅카스산맥','Appalachian Mountains':'애팔래치아산맥','Appalachians':'애팔래치아산맥',
    'Great Dividing Range':'그레이트디바이딩산맥','Tibetan Plateau':'티베트고원','Deccan Plateau':'데칸고원',
    'Ethiopian Highlands':'에티오피아고원','Altai Mountains':'알타이산맥','Altai':'알타이산맥','Tien Shan':'톈산산맥',
    'Tian Shan':'톈산산맥','Kunlun Mountains':'쿤룬산맥','Kunlun Shan':'쿤룬산맥','Hindu Kush':'힌두쿠시산맥',
    'Zagros Mountains':'자그로스산맥','Zagros':'자그로스산맥','Carpathian Mountains':'카르파티아산맥','Carpathians':'카르파티아산맥'
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

  const showNames = document.getElementById('showNames');
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
    }).sort((a, b) => Number(b.population || 0) - Number(a.population || 0) || a.name.localeCompare(b.name, 'ko'));
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

  function koreanName(props) {
    const raw = props?.name || props?.name_en || props?.label || '';
    const nativeKo = props?.name_ko;
    if (nativeKo && /[가-힣]/.test(nativeKo)) return nativeKo;
    return KO_NAMES[raw] || '';
  }

  function cityKoreanName(props) {
    const raw = props?.name || props?.nameascii || '';
    return KO_NAMES[raw] || raw;
  }

  function isMajorReferenceCity(city) {
    const pop = Number(city.population || 0);
    return pop >= 4500000 || (city.isNationalCapital && pop >= 2500000 && city.scalerank <= 2);
  }

  function renderCityGroups(cities, ownerMap) {
    const groups = geographyLayer.selectAll('g.reference-city')
      .data(cities, d => d.id)
      .join(enter => {
        const g = enter.append('g').attr('class', 'reference-city');
        g.append('circle').attr('class', 'reference-city-dot').attr('r', 2.8);
        g.append('text').attr('class', 'reference-city-label map-name').attr('x', 5).attr('y', 3);
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
      g.select('.reference-city-dot').attr('r', isCapital ? 3.7 : (city.custom ? 2.9 : 2.3));
      g.select('.reference-city-label').text(`${isCapital ? '★ ' : ''}${city.name}`);
    });
  }

  function applyNameVisibility() {
    const visible = showNames?.checked !== false;
    document.body.classList.toggle('hide-map-names', !visible);
  }

  function renderGeography() {
    geographyLayer.selectAll('*').remove();
    applyNameVisibility();
    if (!ready || !projection || !geoPath) return;

    const tier = zoomTier();
    const ownerMap = currentOwnerMap();

    if (showRivers?.checked !== false) {
      const rivers = riverFeatures.filter(f => Number(f.properties?.scalerank ?? 99) <= riverRankLimit(tier));
      geographyLayer.selectAll('path.reference-river')
        .data(rivers, d => d.properties?.ne_id || `${d.properties?.name}-${d.properties?.scalerank}`)
        .join('path').attr('class', 'reference-river').attr('d', geoPath);

      const labeledRivers = tier === 0 ? [] : rivers.filter(f =>
        koreanName(f.properties) && Number(f.properties?.scalerank ?? 99) <= Math.max(2, riverRankLimit(tier) - 2)
      );
      geographyLayer.selectAll('text.reference-river-label')
        .data(labeledRivers, d => d.properties?.ne_id || `${d.properties?.name}-label`)
        .join('text').attr('class', 'reference-label reference-river-label map-name')
        .attr('x', d => geoPath.centroid(d)[0]).attr('y', d => geoPath.centroid(d)[1])
        .text(d => koreanName(d.properties));
    }

    if (showMountains?.checked !== false) {
      const mountains = mountainFeatures.filter(f => Number(f.properties?.scalerank ?? 99) <= regionRankLimit(tier));
      const groups = geographyLayer.selectAll('g.reference-mountain')
        .data(mountains, d => d.properties?.ne_id || `${d.properties?.name}-${d.geometry?.coordinates?.join(',')}`)
        .join(enter => {
          const g = enter.append('g').attr('class', 'reference-mountain');
          g.append('text').attr('class', 'mountain-symbol').text('▲');
          g.append('text').attr('class', 'reference-label reference-mountain-label map-name').attr('x', 6).attr('y', 3);
          return g;
        });
      groups.attr('transform', d => {
        const p = projection(d.geometry.coordinates);
        return `translate(${p?.[0] ?? -999},${p?.[1] ?? -999})`;
      });
      groups.select('.reference-mountain-label')
        .style('display', d => tier === 0 || !koreanName(d.properties) ? 'none' : null)
        .text(d => koreanName(d.properties));
    }

    if (showCities?.checked !== false) {
      const custom = (state.cities || []).filter(yearVisible).map(city => ({...city, custom: true}));
      renderCityGroups([...majorReferenceCities, ...custom], ownerMap);
    }
  }

  [showNames, showCities, showRivers, showMountains].forEach(input => input?.addEventListener('change', renderGeography));

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
          name: cityKoreanName(props),
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

  applyNameVisibility();
  loadReferenceGeography();
})();