(() => {
  state.cities = Array.isArray(state.cities) ? state.cities : [];

  const cityButton = document.querySelector('[data-tool="city"]');
  if (!cityButton) return;

  function renderCities() {
    window.historyMapGeography?.render();
  }

  function addCityAt(x, y) {
    if (!isLand(x, y)) {
      statusEl.style.opacity = '1';
      statusEl.textContent = '도시는 육지에만 추가할 수 있습니다.';
      setTimeout(() => statusEl.style.opacity = '0', 1200);
      return;
    }

    const name = prompt('도시 이름을 입력하세요.');
    if (!name?.trim()) return;

    state.cities.push({
      id: uid(),
      name: name.trim(),
      x: +x.toFixed(2),
      y: +y.toFixed(2),
      fromYear: state.year,
      toYear: 9999,
      custom: true
    });
    renderCities();
    window.historyMapAutosave?.save();
  }

  function deleteCity(city) {
    if (!city?.custom) return;
    if (!confirm(`도시 “${city.name}”을 삭제할까요?`)) return;

    state.cities = state.cities.filter(c => c.id !== city.id);
    state.countries.forEach(country => {
      if (country.capitalCityId === city.id) country.capitalCityId = '';
    });
    renderCities();
    renderCountries();
    window.historyMapAutosave?.save();
  }

  cityButton.addEventListener('click', () => {
    helpEl.textContent = '도시 도구: 육지를 눌러 도시를 추가합니다. 직접 추가한 도시를 다시 누르면 삭제할 수 있습니다.';
    svg.style('cursor', 'crosshair');
  });

  svg.on('click.customCity', event => {
    if (state.tool !== 'city') return;
    const target = event.target.closest?.('.reference-city.custom-city');
    if (target) return;
    event.preventDefault();
    const [x, y] = mapPoint(event);
    addCityAt(x, y);
  });

  // Geography re-renders its SVG groups, so delegate deletion from the SVG root.
  svg.node().addEventListener('click', event => {
    if (state.tool !== 'city') return;
    const group = event.target.closest?.('.reference-city.custom-city');
    if (!group) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const datum = d3.select(group).datum();
    deleteCity(datum);
  }, true);

  window.historyMapCustomCities = { addCityAt, deleteCity, render: renderCities };
})();