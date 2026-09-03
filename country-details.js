(() => {
  let editingCountryId = null;

  const dialog = document.createElement('dialog');
  dialog.id = 'countryDetailsDialog';
  dialog.className = 'country-details-dialog';
  dialog.innerHTML = `
    <form id="countryDetailsForm">
      <div class="country-details-head">
        <div><h2>국가 상세설정</h2><p>국가 정보와 지도 표시 방식을 설정합니다.</p></div>
        <button id="closeCountryDetails" class="icon-button" type="button" aria-label="닫기">✕</button>
      </div>
      <div class="country-details-grid">
        <div class="field wide"><label for="detailName">국가명</label><input id="detailName" required maxlength="80" /></div>
        <div class="field"><label for="detailShortName">약칭</label><input id="detailShortName" maxlength="40" placeholder="예: 대한제국" /></div>
        <div class="field color-field"><label for="detailColor">영토 색</label><input id="detailColor" type="color" /></div>
        <div class="field wide"><label for="detailCapitalCity">수도</label><select id="detailCapitalCity"><option value="">수도 미지정</option></select><small class="field-note">현재 연도 기준 이 국가 영토 안의 도시 중 선택합니다.</small></div>
        <div class="field"><label for="detailGovernment">정부 형태</label><input id="detailGovernment" maxlength="100" placeholder="예: 입헌군주제" /></div>
        <div class="field"><label for="detailLeader">지도자</label><input id="detailLeader" maxlength="100" placeholder="예: 황제 ○○" /></div>
        <div class="field"><label for="detailIdeology">이념 / 성향</label><input id="detailIdeology" maxlength="100" placeholder="예: 군주주의" /></div>
        <div class="field"><label for="detailFounded">건국 연도</label><input id="detailFounded" type="number" min="-5000" max="9999" placeholder="예: 1897" /></div>
        <div class="field"><label for="detailEnded">멸망 / 해체 연도</label><input id="detailEnded" type="number" min="-5000" max="9999" placeholder="존속 중이면 비워두기" /></div>
        <div class="field"><label for="detailLabelSize">국가명 크기</label><div class="label-size-row"><input id="detailLabelSize" type="range" min="10" max="40" step="1" value="18" /><output id="detailLabelSizeValue">18px</output></div></div>
        <div class="field"><label for="detailLabelRotation">국가명 회전</label><div class="label-size-row"><input id="detailLabelRotation" type="range" min="-90" max="90" step="1" value="0" /><output id="detailLabelRotationValue">0°</output></div></div>
        <div class="field"><label for="detailLabelSpacing">국가명 자간</label><div class="label-size-row"><input id="detailLabelSpacing" type="range" min="0" max="12" step="0.5" value="0" /><output id="detailLabelSpacingValue">0px</output></div></div>
        <div class="field"><label for="detailTerritoryOpacity">영토 투명도</label><div class="label-size-row"><input id="detailTerritoryOpacity" type="range" min="8" max="100" step="1" value="59" /><output id="detailTerritoryOpacityValue">59%</output></div></div>
        <label class="toggle-field"><input id="detailLabelHidden" type="checkbox" /><span>지도에서 국가명 숨기기</span></label>
        <div class="field"><label>국가명 위치</label><button id="resetCountryLabelPosition" type="button">자동 위치로 되돌리기</button><small class="field-note">지도에서 국가명을 직접 드래그해 위치를 고정할 수 있습니다.</small></div>
        <div class="field wide"><label for="detailDescription">국가 설명 / 메모</label><textarea id="detailDescription" rows="5" maxlength="2000" placeholder="역사, 외교 관계, 설정 등을 자유롭게 기록하세요."></textarea></div>
      </div>
      <div class="dialog-actions country-details-actions"><button id="cancelCountryDetails" type="button">취소</button><button class="primary" type="submit">저장</button></div>
    </form>`;
  document.body.appendChild(dialog);

  const $ = id => document.getElementById(id);
  const labelSize = $('detailLabelSize');
  const labelRotation = $('detailLabelRotation');
  const labelSpacing = $('detailLabelSpacing');
  const territoryOpacity = $('detailTerritoryOpacity');

  function countryById(id) { return state.countries.find(c => c.id === id); }

  function populateCapitalOptions(country) {
    const select = $('detailCapitalCity');
    select.innerHTML = '<option value="">수도 미지정</option>';
    const geo = window.historyMapGeography;
    if (!geo?.ready) {
      const loading = document.createElement('option');
      loading.disabled = true; loading.textContent = '도시 데이터 불러오는 중…'; select.appendChild(loading); return;
    }
    const cities = geo.citiesForCountry(country.id) || [];
    cities.forEach(city => {
      const option = document.createElement('option'); option.value = city.id;
      const population = Number(city.population || 0);
      option.textContent = population >= 1000000 ? `${city.name} · 약 ${(population / 1000000).toFixed(1)}M` : city.name;
      select.appendChild(option);
    });
    select.value = cities.some(c => c.id === country.capitalCityId) ? country.capitalCityId : '';
  }

  function syncOutputs() {
    $('detailLabelSizeValue').value = `${labelSize.value}px`;
    $('detailLabelRotationValue').value = `${labelRotation.value}°`;
    $('detailLabelSpacingValue').value = `${labelSpacing.value}px`;
    $('detailTerritoryOpacityValue').value = `${territoryOpacity.value}%`;
  }

  function openDetails(country) {
    editingCountryId = country.id;
    $('detailName').value = country.name || '';
    $('detailShortName').value = country.shortName || '';
    $('detailColor').value = country.color || '#b94b52';
    populateCapitalOptions(country);
    $('detailGovernment').value = country.government || '';
    $('detailLeader').value = country.leader || '';
    $('detailIdeology').value = country.ideology || '';
    $('detailFounded').value = Number.isFinite(Number(country.foundedYear)) && country.foundedYear !== '' ? country.foundedYear : '';
    $('detailEnded').value = Number.isFinite(Number(country.endedYear)) && country.endedYear !== '' ? country.endedYear : '';
    $('detailDescription').value = country.description || '';
    labelSize.value = Number(country.labelSize) || 18;
    labelRotation.value = Number(country.labelRotation) || 0;
    labelSpacing.value = Number(country.labelSpacing) || 0;
    territoryOpacity.value = Math.round((Number.isFinite(Number(country.territoryOpacity)) ? Number(country.territoryOpacity) : 0.59) * 100);
    $('detailLabelHidden').checked = !!country.labelHidden;
    syncOutputs();
    dialog.showModal();
  }

  function closeDetails() { editingCountryId = null; dialog.close(); }

  window.addEventListener('historymap:geography-ready', () => {
    if (!dialog.open || !editingCountryId) return;
    const country = countryById(editingCountryId); if (country) populateCapitalOptions(country);
  });

  [labelSize, labelRotation, labelSpacing, territoryOpacity].forEach(input => input.addEventListener('input', syncOutputs));
  $('closeCountryDetails').addEventListener('click', closeDetails);
  $('cancelCountryDetails').addEventListener('click', closeDetails);
  dialog.addEventListener('click', event => { if (event.target === dialog) closeDetails(); });

  $('resetCountryLabelPosition').addEventListener('click', () => {
    const country = countryById(editingCountryId); if (!country) return;
    snapshot();
    delete country.labelX; delete country.labelY;
    renderTerritories();
    window.historyMapAutosave?.save();
  });

  $('countryDetailsForm').addEventListener('submit', event => {
    event.preventDefault();
    const country = countryById(editingCountryId); if (!country) return closeDetails();
    const name = $('detailName').value.trim(); if (!name) return;
    snapshot();
    country.name = name;
    country.shortName = $('detailShortName').value.trim();
    country.color = $('detailColor').value;
    country.capitalCityId = $('detailCapitalCity').value || '';
    const capitalCity = window.historyMapGeography?.cityById(country.capitalCityId);
    country.capital = capitalCity?.name || '';
    country.government = $('detailGovernment').value.trim();
    country.leader = $('detailLeader').value.trim();
    country.ideology = $('detailIdeology').value.trim();
    country.foundedYear = $('detailFounded').value === '' ? '' : Number($('detailFounded').value);
    country.endedYear = $('detailEnded').value === '' ? '' : Number($('detailEnded').value);
    country.description = $('detailDescription').value.trim();
    country.labelSize = Number(labelSize.value) || 18;
    country.labelRotation = Number(labelRotation.value) || 0;
    country.labelSpacing = Number(labelSpacing.value) || 0;
    country.territoryOpacity = Math.max(0.08, Math.min(1, Number(territoryOpacity.value) / 100));
    country.labelHidden = $('detailLabelHidden').checked;
    closeDetails();
    renderAll();
    window.historyMapAutosave?.save();
  });

  const baseRenderCountries = renderCountries;
  renderCountries = function () {
    baseRenderCountries();
    const rows = [...countryListEl.querySelectorAll('.country-item')];
    rows.forEach((row, index) => {
      const country = state.countries[index];
      if (!country || row.querySelector('.country-detail-btn')) return;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'country-detail-btn'; button.textContent = '상세'; button.title = `${country.name} 상세설정`;
      button.addEventListener('click', event => { event.stopPropagation(); state.activeCountryId = country.id; renderCountries(); openDetails(country); });
      const deleteButton = row.querySelector('button');
      if (deleteButton) { deleteButton.classList.add('country-delete-btn'); row.insertBefore(button, deleteButton); } else row.appendChild(button);
    });
  };

  const baseRenderTerritories = renderTerritories;
  renderTerritories = function () {
    baseRenderTerritories();
    labelLayer.selectAll('.country-label').each(function () {
      const label = d3.select(this);
      const country = state.countries.find(c => c.id === label.attr('data-country-id')) || state.countries.find(c => c.name === label.text());
      if (!country) return;
      const x = Number(label.attr('x')), y = Number(label.attr('y'));
      label
        .style('font-size', `${Math.max(10, Math.min(40, Number(country.labelSize) || 18))}px`)
        .style('letter-spacing', `${Math.max(0, Math.min(12, Number(country.labelSpacing) || 0))}px`)
        .style('display', country.labelHidden ? 'none' : null)
        .attr('transform', `rotate(${Math.max(-90, Math.min(90, Number(country.labelRotation) || 0))} ${x} ${y})`)
        .attr('data-country-id', country.id);
    });
    window.historyMapGeography?.render();
  };

  renderCountries();
  renderTerritories();
})();