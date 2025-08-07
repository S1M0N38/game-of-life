(() => {
  const canvas = document.getElementById('life');
  /** @type {CanvasRenderingContext2D} */
  const ctx = canvas.getContext('2d', { alpha: false });

  let cellSize = 12; // CSS pixels per cell
  let columns = 0;
  let rows = 0;
  let grid = new Uint8Array(0);

  let isRunning = false;
  let stepDelayMs = 120; // lower is faster
  let lastTimestamp = 0;
  let accumulator = 0;
  let isDragging = false;
  let dragState = 1; // 1 to draw, 0 to erase
  let lastDragX = -1;
  let lastDragY = -1;

  function createGrid(cols, rws, fill = 0) {
    const arr = new Uint8Array(cols * rws);
    if (fill !== 0) arr.fill(fill);
    return arr;
  }

  function indexFor(x, y) {
    return y * columns + x;
  }

  function resize(preserve = true) {
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const width = Math.floor(window.innerWidth);
    const height = Math.floor(window.innerHeight);

    // Internal pixel size for crisp rendering
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const newColumns = Math.max(4, Math.floor(width / cellSize));
    const newRows = Math.max(4, Math.floor(height / cellSize));

    if (newColumns === columns && newRows === rows) return;

    const newGrid = createGrid(newColumns, newRows, 0);

    if (preserve && grid.length) {
      const copyCols = Math.min(columns, newColumns);
      const copyRows = Math.min(rows, newRows);
      for (let y = 0; y < copyRows; y++) {
        for (let x = 0; x < copyCols; x++) {
          newGrid[y * newColumns + x] = grid[indexFor(x, y)];
        }
      }
    }

    columns = newColumns;
    rows = newRows;
    grid = newGrid;

    draw();
  }

  function draw() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    // Clear to black
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    // Draw alive cells in white
    ctx.fillStyle = '#fff';
    for (let y = 0; y < rows; y++) {
      const yPos = y * cellSize;
      for (let x = 0; x < columns; x++) {
        if (grid[indexFor(x, y)] === 1) {
          ctx.fillRect(x * cellSize, yPos, cellSize, cellSize);
        }
      }
    }
  }

  function step() {
    const next = new Uint8Array(columns * rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        let n = 0;
        // Count 8 neighbors with toroidal wrapping
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = (x + dx + columns) % columns;
            const ny = (y + dy + rows) % rows;
            n += grid[ny * columns + nx];
          }
        }
        const i = indexFor(x, y);
        const alive = grid[i] === 1;
        next[i] = alive ? (n === 2 || n === 3 ? 1 : 0) : (n === 3 ? 1 : 0);
      }
    }
    grid = next;
  }

  function randomize(probability = 0.35) {
    for (let i = 0; i < grid.length; i++) {
      grid[i] = Math.random() < probability ? 1 : 0;
    }
    draw();
  }

  function toggleAtClientPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / cellSize);
    const y = Math.floor((clientY - rect.top) / cellSize);
    if (x < 0 || x >= columns || y < 0 || y >= rows) return;
    const i = indexFor(x, y);
    grid[i] = grid[i] ? 0 : 1;
    draw();
  }

  function cellFromClientPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / cellSize);
    const y = Math.floor((clientY - rect.top) / cellSize);
    if (x < 0 || x >= columns || y < 0 || y >= rows) return null;
    return { x, y };
  }

  function setCell(x, y, value) {
    const i = indexFor(x, y);
    if (grid[i] === value) return false;
    grid[i] = value;
    return true;
  }

  function reset() {
    grid.fill(0);
    draw();
  }

  function speedUp() {
    // Faster
    stepDelayMs = Math.max(20, Math.round(stepDelayMs * 0.8));
  }

  function slowDown() {
    // Slower
    stepDelayMs = Math.min(1000, Math.round(stepDelayMs / 0.8));
  }

  function isFullscreenActive() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function toggleFullscreen() {
    const root = document.documentElement;
    if (!isFullscreenActive()) {
      if (root.requestFullscreen) root.requestFullscreen();
      else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  }

  // Animation loop
  function animate(ts) {
    if (!lastTimestamp) lastTimestamp = ts;
    const delta = ts - lastTimestamp;
    lastTimestamp = ts;

    if (isRunning) {
      accumulator += delta;
      while (accumulator >= stepDelayMs) {
        step();
        accumulator -= stepDelayMs;
      }
    } else {
      accumulator = 0; // keep consistent after pause
    }

    draw();
    requestAnimationFrame(animate);
  }

  // Input: draw/erase with primary-button drag
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const cell = cellFromClientPoint(e.clientX, e.clientY);
    if (!cell) return;
    const i = indexFor(cell.x, cell.y);
    dragState = grid[i] === 1 ? 0 : 1; // decide draw or erase based on current cell
    isDragging = true;
    lastDragX = -1;
    lastDragY = -1;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    if (setCell(cell.x, cell.y, dragState)) draw();
    lastDragX = cell.x;
    lastDragY = cell.y;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const cell = cellFromClientPoint(e.clientX, e.clientY);
    if (!cell) return;
    if (cell.x === lastDragX && cell.y === lastDragY) return;
    if (setCell(cell.x, cell.y, dragState)) draw();
    lastDragX = cell.x;
    lastDragY = cell.y;
  });

  function endDrag(e) {
    if (!isDragging) return;
    isDragging = false;
    lastDragX = -1;
    lastDragY = -1;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
  }

  canvas.addEventListener('pointerup', (e) => {
    if (e.button !== 0) return;
    endDrag(e);
  });
  canvas.addEventListener('pointercancel', endDrag);

  // Keyboard controls
  window.addEventListener('keydown', (e) => {
    const key = e.key;
    if (key === ' ' || e.code === 'Space') {
      e.preventDefault();
      isRunning = !isRunning;
      return;
    }
    if (key === '>' ) {
      speedUp();
      return;
    }
    if (key === '<') {
      slowDown();
      return;
    }
    if (key === 'f' || key === 'F') {
      toggleFullscreen();
      return;
    }
    if (key === 'r' || key === 'R') {
      reset();
      return;
    }
  });

  window.addEventListener('resize', () => resize(true));
  document.addEventListener('fullscreenchange', () => resize(true));
  document.addEventListener('webkitfullscreenchange', () => resize(true));

  // Initial layout and start animation loop
  resize(false);
  // Random initial population on load
  if (grid.length) randomize(0.35);
  requestAnimationFrame(animate);
})();
