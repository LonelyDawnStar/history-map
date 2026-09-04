(() => {
  const baseFloodRegion = floodRegion;
  const MAX_SEED_REPAIR_RADIUS = 24;

  function nearestOpenSeed(seedX, seedY, blocked) {
    const sx = Math.round(seedX), sy = Math.round(seedY);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) return null;
    const start = sy * W + sx;
    if (!blocked[start]) return { x: sx, y: sy, repaired: false };

    // Search only the perimeter of each ring. This is cheap and avoids
    // scanning a large square every time a border happens to cross a fill seed.
    for (let r = 1; r <= MAX_SEED_REPAIR_RADIUS; r++) {
      const minX = Math.max(0, sx - r), maxX = Math.min(W - 1, sx + r);
      const minY = Math.max(0, sy - r), maxY = Math.min(H - 1, sy + r);

      for (let x = minX; x <= maxX; x++) {
        if (!blocked[minY * W + x]) return { x, y: minY, repaired: true };
        if (maxY !== minY && !blocked[maxY * W + x]) return { x, y: maxY, repaired: true };
      }
      for (let y = minY + 1; y < maxY; y++) {
        if (!blocked[y * W + minX]) return { x: minX, y, repaired: true };
        if (maxX !== minX && !blocked[y * W + maxX]) return { x: maxX, y, repaired: true };
      }
    }
    return null;
  }

  floodRegion = function safeFloodRegion(seedX, seedY, blocked) {
    const seed = nearestOpenSeed(seedX, seedY, blocked);
    if (!seed) return [];
    return baseFloodRegion(seed.x, seed.y, blocked);
  };

  window.historyMapSafeFlood = {
    nearestOpenSeed,
    maxRepairRadius: MAX_SEED_REPAIR_RADIUS
  };
})();