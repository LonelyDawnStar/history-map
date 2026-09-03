const svg = d3.select('#worldMap');
const viewport = svg.select('#viewport');
const baseLayer = svg.select('#baseLayer');
const territoryLayer = svg.select('#territoryLayer');
const borderLayer = svg.select('#borderLayer');
const eventLayer = svg.select('#eventLayer');
const draftLayer = svg.select('#draftLayer');
const statusEl = document.getElementById('mapStatus');
const helpEl = document.getElementById('toolHelp');
const finishBtn = document.getElementById('finishShapeBtn');
const cancelBtn = document.getElementById('cancelShapeBtn');
const countryListEl = document.getElementById('countryList');
const yearInput = document.getElementById('yearInput');
const timeline = document.getElementById('timeline');
const eventDialog = document.getElementById('eventDialog');

const state = {
  tool: 'pan',
  countries: [],
  territories: [],
  borders: [],
  events: [],
  activeCountryId: null,
  draftPoints: [],
  pendingEventPoint: null,
  year: 1936,
  history: []
};

let currentTransform = d3.zoomIdentity;

const zoom = d3.zoom()
  .scaleExtent([0.7, 14])
  .filter((event) => state.tool === 'pan' || event.type === 'wheel')
  .on('zoom', (event) => {
    currentTransform = event.transform;
    viewport.attr('transform', currentTransform);
  });

svg.call(zoom);

function snapshot() {
  state.history.push(JSON.stringify({
    countries: state.countries,
    territories: state.territories,
    borders: state.borders,
    events: state.events,
    activeCountryId: state.activeCountryId,
    year: state.year
  }));
  if (state.history.length > 40) state.history.shift();
}

function restoreSnapshot(raw) {
  const data = JSON.parse(raw);
  state.countries = data.countries || [];
  state.territories = data.territories || [];
  state.borders = data.borders || [];
  state.events = data.events || [];
  state.activeCountryId = data.activeCountryId || null;
  state.year = Number(data.year ?? 1936);
  yearInput.value = state.year;
  if (state.year >= 1800 && state.year <= 2100) timeline.value = state.year;
  renderAll();
}

function yearVisible(item) {
  const from = Number(item.fromYear ?? -99999);
  const to = Number(item.toYear ?? 99999);
  return state.year >= from && state.year <= to;
}

function renderCountries() {
  countryListEl.innerHTML = '';
  state.countries.forEach(country => {
    const row = document.createElement('div');
    row.className = 'country-item' + (country.id === state.activeCountryId ? ' active' : '');
    row.tabIndex = 0;
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = country.color;
    const name = document.createElement('span');
    name.textContent = country.name;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '삭제';
    remove.addEventListener('click', (e) => {
      e.stopPropagation();
      snapshot();
      state.countries = state.countries.filter(c => c.id !== country.id);
      state.territories = state.territories.filter(t => t.countryId !== country.id);
      if (state.activeCountryId === country.id) state.activeCountryId = state.countries[0]?.id || null;
      renderAll();
    });
    const activate = () => {
      state.activeCountryId = country.id;
      renderCountries();
    };
    row.addEventListener('click', activate);
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') activate(); });
    row.append(swatch, name, remove);
    countryListEl.appendChild(row);
  });
}

function renderTerritories() {
  const countryMap = new Map(state.countries.map(c => [c.id, c]));
  territoryLayer.selectAll('polygon')
    .data(state.territories.filter(yearVisible), d => d.id)
    .join('polygon')
    .attr('class', 'territory')
    .attr('points', d => d.points.map(p => p.join(',')).join(' '))
    .attr('fill', d => countryMap.get(d.countryId)?.color || '#888');
}

function renderBorders() {
  borderLayer.selectAll('polyline')
    .data(state.borders.filter(yearVisible), d => d.id)
    .join('polyline')
    .attr('class', 'border-line')
    .attr('points', d => d.points.map(p => p.join(',')).join(' '));
}

const eventSymbols = { war: '⚔', politics: '◆', diplomacy: '✦', foundation: '★', collapse: '✖', other: '●' };

function renderEvents() {
  const groups = eventLayer.selectAll('g.event-marker')
    .data(state.events.filter(yearVisible), d => d.id)
    .join(enter => {
      const g = enter.append('g').attr('class', 'event-marker');
      g.append('circle').attr('r', 8).attr('fill', '#fff').attr('stroke', '#222').attr('stroke-width', 1.5).attr('vector-effect', 'non-scaling-stroke');
      g.append('text').attr('class', 'event-label').attr('x', 12).attr('y', 4);
      return g;
    });
  groups.attr('transform', d => `translate(${d.x},${d.y})`)
    .on('click', (event, d) => {
      event.stopPropagation();
      alert(`${eventSymbols[d.type] || '●'} ${d.title}\n${d.date || d.fromYear || ''}\n\n${d.description || ''}`);
    });
  groups.select('text').text(d => `${eventSymbols[d.type] || '●'} ${d.title}`);
}

function renderDraft() {
  draftLayer.selectAll('*').remove();
  if (!state.draftPoints.length) {
    finishBtn.disabled = true;
    cancelBtn.disabled = true;
    return;
  }
  finishBtn.disabled = state.tool === 'territory' ? state.draftPoints.length < 3 : state.draftPoints.length < 2;
  cancelBtn.disabled = false;
  draftLayer.append('polyline')
    .attr('class', 'draft-line')
    .attr('points', state.draftPoints.map(p => p.join(',')).join(' '));
  draftLayer.selectAll('circle')
    .data(state.draftPoints)
    .join('circle')
    .attr('class', 'draft-point')
    .attr('r', 5)
    .attr('cx', d => d[0])
    .attr('cy', d => d[1]);
}

function renderAll() {
  renderCountries();
  renderTerritories();
  renderBorders();
  renderEvents();
  renderDraft();
}

function mapPoint(event) {
  const [sx, sy] = d3.pointer(event, svg.node());
  return currentTransform.invert([sx, sy]);
}

function activeCountry() {
  return state.countries.find(c => c.id === state.activeCountryId);
}

function finishDraft() {
  if (state.tool === 'territory') {
    if (state.draftPoints.length < 3) return;
    const country = activeCountry();
    if (!country) {
      alert('먼저 국가를 추가하고 선택해 주세요.');
      return;
    }
    snapshot();
    state.territories.push({
      id: crypto.randomUUID(),
      countryId: country.id,
      points: state.draftPoints.map(p => [...p]),
      fromYear: state.year,
      toYear: 9999
    });
  } else if (state.tool === 'border') {
    if (state.draftPoints.length < 2) return;
    snapshot();
    state.borders.push({
      id: crypto.randomUUID(),
      points: state.draftPoints.map(p => [...p]),
      fromYear: state.year,
      toYear: 9999
    });
  } else return;
  state.draftPoints = [];
  renderAll();
}

svg.on('click.editor', (event) => {
  if (state.tool === 'pan' || state.tool === 'select') return;
  const [x, y] = mapPoint(event);
  if (state.tool === 'territory' || state.tool === 'border') {
    state.draftPoints.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    renderDraft();
  } else if (state.tool === 'event') {
    state.pendingEventPoint = { x, y };
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventDate').value = state.year > 0 && state.year <= 9999 ? `${String(state.year).padStart(4, '0')}-01-01` : '';
    document.getElementById('eventDescription').value = '';
    eventDialog.showModal();
  }
});

const toolHelp = {
  pan: '이동 도구: 지도를 드래그하고 휠 또는 버튼으로 확대/축소할 수 있습니다.',
  territory: '영토 도구: 선택한 국가의 영토 외곽을 점으로 찍으세요.',
  border: '국경 도구: 국경선을 따라 점을 찍으세요.',
  event: '사건 도구: 지도에서 위치를 누른 뒤 사건 정보를 입력하세요.',
  select: '선택 도구: 현재 버전에서는 사건 마커를 눌러 내용을 확인할 수 있습니다.'
};

document.querySelectorAll('.tool').forEach(btn => {
  btn.addEventListener('click', () => {
    state.tool = btn.dataset.tool;
    state.draftPoints = [];
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b === btn));
    helpEl.textContent = toolHelp[state.tool];
    svg.style('cursor', state.tool === 'pan' ? 'grab' : 'crosshair');
    renderDraft();
  });
});

document.getElementById('addCountryBtn').addEventListener('click', () => {
  const nameInput = document.getElementById('countryName');
  const colorInput = document.getElementById('countryColor');
  const name = nameInput.value.trim();
  if (!name) return;
  snapshot();
  const country = { id: crypto.randomUUID(), name, color: colorInput.value };
  state.countries.push(country);
  state.activeCountryId = country.id;
  nameInput.value = '';
  renderAll();
});

finishBtn.addEventListener('click', finishDraft);
cancelBtn.addEventListener('click', () => { state.draftPoints = []; renderDraft(); });

document.getElementById('undoBtn').addEventListener('click', () => {
  const raw = state.history.pop();
  if (raw) restoreSnapshot(raw);
});

function setYear(value) {
  const n = Math.max(-5000, Math.min(3000, Number(value) || 0));
  state.year = n;
  yearInput.value = n;
  if (n >= 1800 && n <= 2100) timeline.value = n;
  renderTerritories();
  renderBorders();
  renderEvents();
}

yearInput.addEventListener('change', e => setYear(e.target.value));
timeline.addEventListener('input', e => setYear(e.target.value));
document.getElementById('yearDown').addEventListener('click', () => setYear(state.year - 1));
document.getElementById('yearUp').addEventListener('click', () => setYear(state.year + 1));

document.getElementById('eventForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = document.getElementById('eventTitle').value.trim();
  if (!title || !state.pendingEventPoint) return;
  snapshot();
  const date = document.getElementById('eventDate').value;
  state.events.push({
    id: crypto.randomUUID(),
    title,
    date,
    type: document.getElementById('eventType').value,
    description: document.getElementById('eventDescription').value.trim(),
    x: state.pendingEventPoint.x,
    y: state.pendingEventPoint.y,
    fromYear: date ? Number(date.slice(0, 4)) : state.year,
    toYear: 9999
  });
  state.pendingEventPoint = null;
  eventDialog.close();
  renderEvents();
});

document.getElementById('cancelEventBtn').addEventListener('click', () => {
  state.pendingEventPoint = null;
  eventDialog.close();
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const data = {
    version: 1,
    savedAt: new Date().toISOString(),
    year: state.year,
    countries: state.countries,
    territories: state.territories,
    borders: state.borders,
    events: state.events
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'history-map-project.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('importInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    snapshot();
    state.countries = Array.isArray(data.countries) ? data.countries : [];
    state.territories = Array.isArray(data.territories) ? data.territories : [];
    state.borders = Array.isArray(data.borders) ? data.borders : [];
    state.events = Array.isArray(data.events) ? data.events : [];
    state.activeCountryId = state.countries[0]?.id || null;
    setYear(data.year ?? 1936);
    renderAll();
  } catch {
    alert('올바른 History Map JSON 파일이 아닙니다.');
  }
  e.target.value = '';
});

document.getElementById('zoomInBtn').addEventListener('click', () => svg.transition().duration(180).call(zoom.scaleBy, 1.45));
document.getElementById('zoomOutBtn').addEventListener('click', () => svg.transition().duration(180).call(zoom.scaleBy, 1 / 1.45));
document.getElementById('resetViewBtn').addEventListener('click', () => svg.transition().duration(220).call(zoom.transform, d3.zoomIdentity));

async function loadWorld() {
  try {
    const response = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-50m.json');
    if (!response.ok) throw new Error('map load failed');
    const world = await response.json();
    const land = topojson.feature(world, world.objects.land);
    const projection = d3.geoNaturalEarth1().fitExtent([[22, 24], [1178, 596]], land);
    const path = d3.geoPath(projection);
    baseLayer.append('path')
      .datum(land)
      .attr('class', 'base-land')
      .attr('d', path);
    statusEl.textContent = '무국경 세계 백지도 · 현재 ' + state.year + '년';
    setTimeout(() => { statusEl.style.opacity = '0'; }, 1800);
  } catch (error) {
    statusEl.textContent = '기본 지도를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.';
    console.error(error);
  }
}

loadWorld();
renderAll();
