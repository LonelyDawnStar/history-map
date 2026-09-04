(() => {
  const help = '영토 제거: 지우려는 영토 구역을 누르면 해당 구역의 페인트 채우기가 제거됩니다.';

  function flash(text) {
    statusEl.style.opacity = '1';
    statusEl.textContent = text;
    clearTimeout(flash.timer);
    flash.timer = setTimeout(() => statusEl.style.opacity = '0', 1200);
  }

  function nearestOpenSeed(x, y, blocked, maxRadius = 24) {
    const sx = Math.round(x), sy = Math.round(y);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) return null;
    if (!blocked[sy * W + sx]) return [sx, sy];
    for (let r = 1; r <= maxRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (const dy of [-r, r]) {
          const nx = sx + dx, ny = sy + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && !blocked[ny * W + nx]) return [nx, ny];
        }
      }
      for (let dy = -r + 1; dy < r; dy++) {
        for (const dx of [-r, r]) {
          const nx = sx + dx, ny = sy + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && !blocked[ny * W + nx]) return [nx, ny];
        }
      }
    }
    return null;
  }

  svg.on('click.territoryRemove', event => {
    if (state.tool !== 'unfill') return;
    event.preventDefault();
    event.stopPropagation();
    const [x, y] = mapPoint(event);
    if (!isLand(x, y)) { flash('바다에는 제거할 영토가 없습니다.'); return; }

    const blocked = buildBarrierMap();
    const clickSeed = nearestOpenSeed(x, y, blocked);
    if (!clickSeed) { flash('이 위치의 영토를 찾을 수 없습니다.'); return; }
    const region = floodRegion(clickSeed[0], clickSeed[1], blocked);
    if (!region.length) { flash('이 위치의 영토를 찾을 수 없습니다.'); return; }

    const regionSet = new Set(region);
    const removeIds = new Set();
    for (const fill of state.fills) {
      if (!yearVisible(fill)) continue;
      const seed = nearestOpenSeed(fill.x, fill.y, blocked);
      if (!seed) continue;
      if (regionSet.has(seed[1] * W + seed[0])) removeIds.add(fill.id);
    }
    if (!removeIds.size) { flash('이 구역에는 지정된 영토가 없습니다.'); return; }

    snapshot();
    state.fills = state.fills.filter(fill => !removeIds.has(fill.id));
    window.historyMapTerritoryRender?.invalidate();
    window.historyMapGeography?.invalidateOwnership?.();
    renderTerritories();
    window.historyMapGeography?.render();
    window.historyMapAutosave?.save?.();
    flash('영토를 제거했습니다.');
  });

  document.querySelectorAll('.tool').forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.tool !== 'unfill') return;
    helpEl.textContent = help;
    svg.style('cursor', 'cell');
  }));
})();