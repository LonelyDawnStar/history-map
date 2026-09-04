(() => {
  const KEY = 'history-map-tool-settings-v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}

  const settings = {
    eraserSize: Math.max(12, Math.min(80, Number(saved.eraserSize) || 32)),
    borderAdjustRadius: Math.max(8, Math.min(48, Number(saved.borderAdjustRadius) || 20)),
    activeTool: null
  };

  const inspector = document.querySelector('.inspector');
  if (!inspector) return;

  const panel = document.createElement('section');
  panel.className = 'panel tool-settings-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <h2>도구 설정</h2>
    <div class="field" data-setting="eraser">
      <label for="eraserSizeRange">지우개 크기 <span id="eraserSizeValue"></span></label>
      <input id="eraserSizeRange" type="range" min="12" max="80" step="2" />
    </div>
    <div class="field" data-setting="border-adjust">
      <label for="borderAdjustRange">국경 조정 범위 <span id="borderAdjustValue"></span></label>
      <input id="borderAdjustRange" type="range" min="8" max="48" step="2" />
      <small class="field-note">새 파란 선의 시작·끝이 기존 국경에서 이 범위 안에 들어오면 해당 구간을 교체합니다.</small>
    </div>`;

  const helpPanel = inspector.querySelector('.help-panel');
  inspector.insertBefore(panel, helpPanel || null);

  const eraserRange = panel.querySelector('#eraserSizeRange');
  const eraserValue = panel.querySelector('#eraserSizeValue');
  const adjustRange = panel.querySelector('#borderAdjustRange');
  const adjustValue = panel.querySelector('#borderAdjustValue');

  eraserRange.value = settings.eraserSize;
  adjustRange.value = settings.borderAdjustRadius;

  function save() {
    localStorage.setItem(KEY, JSON.stringify({
      eraserSize: settings.eraserSize,
      borderAdjustRadius: settings.borderAdjustRadius
    }));
  }

  function refreshValues() {
    eraserValue.textContent = `${settings.eraserSize}px`;
    adjustValue.textContent = `${settings.borderAdjustRadius}px`;
  }

  function showForTool(tool) {
    settings.activeTool = tool;
    const show = tool === 'eraser' || tool === 'border-adjust';
    panel.style.display = show ? '' : 'none';
    panel.querySelector('[data-setting="eraser"]').style.display = tool === 'eraser' ? '' : 'none';
    panel.querySelector('[data-setting="border-adjust"]').style.display = tool === 'border-adjust' ? '' : 'none';
  }

  eraserRange.addEventListener('input', () => {
    settings.eraserSize = Number(eraserRange.value);
    refreshValues();
    save();
  });

  adjustRange.addEventListener('input', () => {
    settings.borderAdjustRadius = Number(adjustRange.value);
    refreshValues();
    save();
  });

  document.querySelectorAll('.tool').forEach(button => {
    button.addEventListener('click', () => showForTool(button.dataset.tool));
  });

  refreshValues();
  window.historyMapToolSettings = settings;
  window.historyMapToolSettings.showForTool = showForTool;
})();