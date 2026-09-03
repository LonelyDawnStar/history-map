(() => {
  const input = document.getElementById('showCountryNames');
  if (!input) return;

  const STORAGE_KEY = 'history-map-show-country-names';

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) input.checked = saved === '1';
  } catch (_) {}

  function apply() {
    document.body.classList.toggle('hide-country-names', !input.checked);
    try { localStorage.setItem(STORAGE_KEY, input.checked ? '1' : '0'); } catch (_) {}
  }

  input.addEventListener('change', apply);
  apply();
})();