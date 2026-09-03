(() => {
  let editingCountryId = null;

  const dialog = document.createElement('dialog');
  dialog.id = 'countryDetailsDialog';
  dialog.className = 'country-details-dialog';
  dialog.innerHTML = `
    <form id="countryDetailsForm">
      <div class="country-details-head">
        <div>
          <h2>국가 상세설정</h2>
          <p>국가 정보와 지도 표시 방식을 설정합니다.</p>
        </div>
        <button id="closeCountryDetails" class="icon-button" type="button" aria-label="닫기">✕</button>
      </div>

      <div class="country-details-grid">
        <div class="field wide">
          <label for="detailName">국가명</label>
          <input id="detailName" required maxlength="80" />
        </div>
        <div class="field">
          <label for="detailShortName">약칭</label>
          <input id="detailShortName" maxlength="40" placeholder="예: 대한제국" />
        </div>
        <div class="field color-field">
          <label for="detailColor">영토 색</label>
          <input id="detailColor" type="color" />
        </div>
        <div class="field wide">
          <label for="detailCapitalCity">수도</label>
          <select id="detailCapitalCity">
            <option value="">수도 미지정</option>
          </select>
          <small class="field-note">현재 연도 기준 이 국가 영토 안에 들어오는 실제 도시들 중에서 선택합니다.</small>
        </div>
        <div class="field">
          <label for="detailGovernment">정부 형태</label>
          <input id="detailGovernment" maxlength="100" placeholder="예: 입헌군주제" />
        </div>
        <div class="field">
          <label for="detailLeader">지도자</label>
          <input id="detailLeader" maxlength="100" placeholder="예: 황제 ○○" />
        </div>
        <div class="field">
          <label for="detailIdeology">이념 / 성향</label>
          <input id="detailIdeology" maxlength="100" placeholder="예: 군주주의" />
        </div>
        <div class="field">
          <label for="detailFounded">건국 연도</label>
          <input id="detailFounded" type="number" min="-5000" max="9999" placeholder="예: 1897" />
        </div>
        <div class="field">
          <label for="detailEnded">멸망 / 해체 연도</label>
          <input id="detailEnded" type="number" min="-5000" max="9999" placeholder="존속 중이면 비워두기" />
        </div>
        <div class="field">
          <label for="detailLabelSize">지도 국가명 크기</label>
          <div class="label-size-row">
            <input id="detailLabelSize" type="range" min="10" max="40" step="1" value="18" />
            <output id="detailLabelSizeValue">18px</output>
          </div>
        </div>
        <label class="toggle-field">
          <input id="detailLabelHidden" type="checkbox" />
          <span>지도에서 국가명 숨기기</span>
        </label>
        <div class="field wide">
          <label for="detailDescription">국가 설명 / 메모</label>
          <textarea id="detailDescription" rows="5" maxlength="2000" placeholder="역사, 외교 관계, 설정 등을 자유롭게 기록하세요."></textarea>
        </div>
      </div>

      <div class="dialog-actions country-details-actions">
        <button id="cancelCountryDetails" type="button">취소</button>
        <button class="primary" type="submit">저장</button>
      </div>
    </form>`;
  document.body.appendChild(dialog);

  const $ = id => document.getElementById(id);
  const labelSize = $('detailLabelSize');
  const labelSizeValue = $('detailLabelSizeValue');

  function countryById(id) {
    return state.countries.find(c => c.id === id);
  }

  function populateCapitalOptions(country) {
    const select = $('detailCapitalCity');
    select.innerHTML = '<option value="">수도 미지정</option>';
    const geo = window.historyMapGeography;
    if (!geo?.ready) {
      const loading = document.createElement('option');
      loading.disabled = true;
      loading.textContent = '도시 데이터 불러오는 중…';
      select.appendChild(loading);
      return;
    }

    const cities = geo.citiesForCountry(country.id) || [];
    cities.forEach(city => {
      const option = document.createElement('option');
      option.value = city.id;
      const population = Number(city.population || 0);
      option.textContent = population >= 1000000
        ? `${city.name} · 약 ${(population / 1000000).toFixed(1)}M`
        : city.name;
      select.appendChild(option);
    });
    select.value = cities.some(c => c.id === country.capitalCityId) ? country.capitalCityId : '';
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
    labelSizeValue.value = `${labelSize.value}px`;
    $('detailLabelHidden').checked = !!country.labelHidden;
    dialog.showModal();
  }

  function closeDetails() {
    editingCountryId = null;
    dialog.close();
  }

  window.addEventListener('historymap:geography-ready', () => {
    if (!dialog.open || !editingCountryId) return;
    const country = countryById(editingCountryId);
    if (country) populateCapitalOptions(country);
  });

  labelSize.addEventListener('input', () => {
    labelSizeValue.value = `${labelSize.value}px`;
  });

  $('closeCountryDetails').addEventListener('click', closeDetails);
  $('cancelCountryDetails').addEventListener('click', closeDetails);
  dialog.addEventListener('click', event => {
    if (event.target === dialog) closeDetails();
  });

  $('countryDetailsForm').addEventListener('submit', event => {
    event.preventDefault();
    const country = countryById(editingCountryId);
    if (!country) return closeDetails();

    const name = $('detailName').value.trim();
    if (!name) return;

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
    country.labelHidden = $('detailLabelHidden').checked;

    closeDetails();
    renderAll();
  });

  const baseRenderCountries = renderCountries;
  renderCountries = function () {
    baseRenderCountries();
    const rows = [...countryListEl.querySelectorAll('.country-item')];
    rows.forEach((row, index) => {
      const country = state.countries[index];
      if (!country || row.querySelector('.country-detail-btn')) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'country-detail-btn';
      button.textContent = '상세';
      button.title = `${country.name} 상세설정`;
      button.addEventListener('click', event => {
        event.stopPropagation();
        state.activeCountryId = country.id;
        renderCountries();
        openDetails(country);
      });

      const deleteButton = row.querySelector('button');
      if (deleteButton) {
        deleteButton.classList.add('country-delete-btn');
        row.insertBefore(button, deleteButton);
      } else {
        row.appendChild(button);
      }
    });
  };

  const baseRenderTerritories = renderTerritories;
  renderTerritories = function () {
    baseRenderTerritories();
    labelLayer.selectAll('.country-label').each(function () {
      const label = d3.select(this);
      const country = state.countries.find(c => c.name === label.text());
      if (!country) return;

      label
        .style('font-size', `${Math.max(10, Math.min(40, Number(country.labelSize) || 18))}px`)
        .style('display', country.labelHidden ? 'none' : null)
        .attr('data-country-id', country.id);
    });
    window.historyMapGeography?.render();
  };

  renderCountries();
  renderTerritories();
})();
