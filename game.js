(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const wrap = document.getElementById("canvasWrap");
  const scoreEl = document.getElementById("score");
  const levelEl = document.getElementById("level");
  const levelSelector = document.getElementById("levelSelector");
  const livesEl = document.getElementById("lives");
  const bestEl = document.getElementById("bestScore");
  const startOverlay = document.getElementById("startOverlay");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const pauseTitle = document.getElementById("pauseTitle");
  const pauseMessage = document.getElementById("pauseMessage");
  const actionButton = document.querySelector("[data-action='fire']");
  const soundButton = document.getElementById("soundButton");

  const COLS = 11;
  const ROWS = 13;
  const LANE_ROWS = [2, 3, 4, 6, 7, 8, 9, 10];
  const SAFE_ROWS = new Set([0, 1, 5, 11, 12]);
  const COLORS = {
    ink: "#071116", asphalt: "#17282d", asphaltAlt: "#1a2d32",
    line: "#577078", cyan: "#39e1db", amber: "#ffb52e",
    red: "#ff5b4b", paper: "#eef3ed", blue: "#257a91", pink: "#e07fb2"
  };

  let viewW = 0;
  let viewH = 0;
  let cellW = 0;
  let cellH = 0;
  let running = false;
  let paused = false;
  let gameOver = false;
  let soundOn = true;
  let lastTime = 0;
  let score = 0;
  let best = Number(localStorage.getItem("harborHopBest") || 0);
  let level = 1;
  let lives = 3;
  let timeLeft = 45;
  let shake = 0;
  let flash = 0;
  let audioContext = null;
  let noiseBuffer = null;
  let musicStep = 0;
  let musicClock = 0;
  let player = { col: 5, row: 12, targetCol: 5, targetRow: 12, moving: 0, facing: "up" };
  let vehicles = [];
  let particles = [];
  let mazeWalls = new Uint8Array(COLS * ROWS);
  let mazeDots = new Uint8Array(COLS * ROWS);
  let mazeManifests = [];
  let dockWorkers = [];
  let platformPlayer = { x: 1.2, y: 11.5, vx: 0, vy: 0, grounded: false };
  let platformMove = 0;
  let inspectors = [];
  let projectiles = [];
  let fireCooldown = 0;
  let boardingProgress = 0;
  let puzzlePieces = [];
  let draggedPiece = null;
  let loadComplete = false;
  let sailAway = 0;
  let loadMessage = "DRAG THE PHOTO PIECES INTO THE MATCHING SHAPES";
  let camera = { x: 5.5, y: 6.5, zoom: 1.35 };
  let mood = "neutral";
  let moodTimer = 0;
  let personalityClock = 5;
  let moveCount = 0;
  let rainbowFarts = [];

  const cellIndex = (col, row) => row * COLS + col;
  const shiftType = () => ["load", "traffic", "maze", "vessel"][level % 4];
  const isTrafficShift = () => shiftType() === "traffic";
  const isMazeShift = () => shiftType() === "maze";
  const isVesselShift = () => shiftType() === "vessel";
  const isLoadShift = () => shiftType() === "load";
  const CARDINALS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const PUZZLE_BOARD = { x: 2, y: 1.25, w: 7, h: 5.5, columns: 3, rows: 2 };
  const musicTracks = {
    traffic: { tempo: .25, bass: [110, 110, 130.81, 98, 110, 146.83, 130.81, 98], lead: [220, 261.63, 293.66, 329.63, 293.66, 261.63, 246.94, 196] },
    maze: { tempo: .29, bass: [82.41, 98, 110, 82.41, 73.42, 98, 103.83, 73.42], lead: [164.81, 196, 220, 246.94, 220, 196, 174.61, 146.83] },
    vessel: { tempo: .31, bass: [73.42, 73.42, 98, 110, 73.42, 130.81, 110, 98], lead: [293.66, 349.23, 392, 440, 392, 349.23, 329.63, 293.66] },
    load: { tempo: .27, bass: [130.81, 164.81, 196, 164.81, 146.83, 174.61, 220, 174.61], lead: [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 698.46] }
  };
  const photoSources = {
    terminal: "https://images.unsplash.com/photo-1494412651409-8963ce7935a7?auto=format&fit=crop&w=1800&q=82",
    containers: "https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=1800&q=82",
    vessel: "https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=1800&q=84",
    ocean: "https://images.unsplash.com/photo-1540946485063-a40da27545f8?auto=format&fit=crop&w=1800&q=84"
  };
  const photoAssets = {};
  Object.entries(photoSources).forEach(([name, source]) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.src = source;
    photoAssets[name] = image;
  });

  const laneConfig = [
    { row: 2, dir: -1, speed: 1.35, gap: 4.2, kind: "straddle", label: "STRADDLE CARRIER", length: 2.25, color: COLORS.amber },
    { row: 3, dir: 1, speed: 1.75, gap: 3.9, kind: "boxTruck", label: "BOX LORRY", length: 1.55, color: "#d9e4df" },
    { row: 4, dir: -1, speed: 1.15, gap: 4.8, kind: "reachStacker", label: "REACH STACKER", length: 1.95, color: COLORS.blue },
    { row: 6, dir: 1, speed: 1.45, gap: 3.8, kind: "forklift", label: "FORKLIFT", length: 1.25, color: COLORS.amber },
    { row: 7, dir: -1, speed: 2.0, gap: 3.7, kind: "shunt", label: "YARD SHUNT", length: 1.55, color: COLORS.red },
    { row: 8, dir: 1, speed: 1.1, gap: 5.1, kind: "containerLorry", label: "CONTAINER LORRY", length: 2.55, color: "#a7483d" },
    { row: 9, dir: -1, speed: 1.65, gap: 4.1, kind: "tug", label: "TERMINAL TUG", length: 1.5, color: COLORS.cyan },
    { row: 10, dir: 1, speed: 1.3, gap: 5.0, kind: "tankerLorry", label: "TANKER LORRY", length: 2.4, color: "#b68d3b" }
  ];

  const vesselPlatforms = [
    { baseX: 0, baseY: 12, x: 0, y: 12, w: 3.0, h: 1, axis: "none", amplitude: 0, speed: 0, phase: 0 },
    { baseX: 3.4, baseY: 10.25, x: 3.4, y: 10.25, w: 2.7, h: .42, axis: "x", amplitude: .72, speed: .82, phase: .2 },
    { baseX: .7, baseY: 8.35, x: .7, y: 8.35, w: 2.6, h: .42, axis: "y", amplitude: .48, speed: .74, phase: 1.4 },
    { baseX: 4.1, baseY: 6.45, x: 4.1, y: 6.45, w: 2.8, h: .42, axis: "x", amplitude: .86, speed: .68, phase: 2.1 },
    { baseX: 7.7, baseY: 4.55, x: 7.7, y: 4.55, w: 2.5, h: .42, axis: "y", amplitude: .58, speed: .79, phase: 3.2 },
    { baseX: 4.9, baseY: 2.7, x: 4.9, y: 2.7, w: 2.4, h: .42, axis: "x", amplitude: .74, speed: .88, phase: 4.15 },
    { baseX: 8.1, baseY: 1.25, x: 8.1, y: 1.25, w: 2.9, h: .5, axis: "none", amplitude: 0, speed: 0, phase: 0 }
  ];

  function resize() {
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewW = rect.width;
    viewH = rect.height;
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cellW = viewW / COLS;
    cellH = viewH / ROWS;
  }
  function drawPhotoBackdrop(name, alpha = .45) {
    const image = photoAssets[name];
    if (!image?.complete || !image.naturalWidth) return false;
    const imageRatio = image.naturalWidth / image.naturalHeight;
    const viewRatio = viewW / viewH;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = image.naturalWidth;
    let sourceHeight = image.naturalHeight;
    if (imageRatio > viewRatio) {
      sourceWidth = image.naturalHeight * viewRatio;
      sourceX = (image.naturalWidth - sourceWidth) / 2;
    } else {
      sourceHeight = image.naturalWidth / viewRatio;
      sourceY = (image.naturalHeight - sourceHeight) / 2;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, viewW, viewH);
    ctx.restore();
    return true;
  }

  function initVehicles() {
    vehicles = [];
    laneConfig.forEach((lane, laneIndex) => {
      const count = Math.ceil(COLS / lane.gap) + 1;
      for (let i = 0; i < count; i++) {
        vehicles.push({ ...lane, x: (i * lane.gap + (laneIndex % 2) * 1.4) % (COLS + lane.length) });
      }
    });
  }
  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function generateMaze() {
    const pattern = [
      "#####.#####",
      "#.........#",
      "#.###.###.#",
      "#.#.....#.#",
      "#.#.###.#.#",
      "#...#.#...#",
      "###.....###",
      "#...#.#...#",
      "#.#.###.#.#",
      "#.#.....#.#",
      "#.###.###.#",
      "#.........#",
      "#####.#####"
    ];
    const walls = new Uint8Array(COLS * ROWS);
    const dots = new Uint8Array(COLS * ROWS);
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const index = cellIndex(col, row);
        walls[index] = pattern[row][col] === "#" ? 1 : 0;
        dots[index] = walls[index] || (col === 5 && (row === 0 || row === 12)) ? 0 : 1;
      }
    }
    mazeWalls = walls;
    mazeDots = dots;
  }
  function initMazeHazards() {
    mazeManifests = [
      { col: 1, row: 11, collected: false },
      { col: 9, row: 11, collected: false },
      { col: 5, row: 6, collected: false }
    ];
    mazeManifests.forEach(manifest => { mazeDots[cellIndex(manifest.col, manifest.row)] = 0; });

    const spawnPoints = [[1, 1], [9, 1], [1, 5], [9, 5], [5, 9]];
    const workerCount = Math.min(5, 3 + Math.floor(level / 6));
    dockWorkers = spawnPoints.slice(0, workerCount).map(([col, row], id) => ({
      id, col, row, nextCol: col, nextRow: row,
      progress: 1, speed: .95 + id * .1 + level * .025
    }));
  }

  function resetPlatformPlayer() {
    platformPlayer = { x: 1.2, y: 11.56, vx: 0, vy: 0, grounded: true, platformIndex: 0 };
    player.facing = "right";
  }

  function spawnInspectors() {
    inspectors = [
      { x: 2.3, y: 11.56, minX: 1.85, maxX: 2.7, dir: -1, active: true },
      { x: 4.25, y: 9.82, minX: 3.75, maxX: 5.7, dir: 1, active: true },
      { x: 1.45, y: 7.92, minX: .95, maxX: 3.0, dir: -1, active: true },
      { x: 5.0, y: 6.02, minX: 4.35, maxX: 6.55, dir: 1, active: true },
      { x: 8.35, y: 4.12, minX: 7.95, maxX: 9.85, dir: -1, active: true },
      { x: 5.65, y: 2.27, minX: 5.15, maxX: 7.0, dir: 1, active: true }
    ];
  }

  function initPlatformer() {
    resetPlatformPlayer();
    projectiles = [];
    fireCooldown = 0;
    boardingProgress = 0;
    spawnInspectors();
  }

  function initLoadPuzzle() {
    const pieceWidth = PUZZLE_BOARD.w / PUZZLE_BOARD.columns;
    const pieceHeight = PUZZLE_BOARD.h / PUZZLE_BOARD.rows;
    const staging = [[.25, 7.25], [4.34, 7.25], [8.4, 7.25], [.25, 10.15], [4.34, 10.15], [8.4, 10.15]];
    const random = seededRandom((Date.now() ^ 6263) >>> 0);
    const shuffledStaging = staging
      .map(position => ({ position, order: random() }))
      .sort((a, b) => a.order - b.order)
      .map(entry => entry.position);
    puzzlePieces = Array.from({ length: 6 }, (_, id) => {
      const column = id % PUZZLE_BOARD.columns;
      const row = Math.floor(id / PUZZLE_BOARD.columns);
      return {
        id,
        sourceColumn: column,
        sourceRow: row,
        x: shuffledStaging[id][0],
        y: shuffledStaging[id][1],
        homeX: shuffledStaging[id][0],
        homeY: shuffledStaging[id][1],
        targetX: PUZZLE_BOARD.x + column * pieceWidth,
        targetY: PUZZLE_BOARD.y + row * pieceHeight,
        width: pieceWidth,
        height: pieceHeight,
        placed: false
      };
    });
    draggedPiece = null;
    loadComplete = false;
    sailAway = 0;
    loadMessage = "DRAG EACH PHOTO PIECE INTO ITS MATCHING OUTLINE";
  }
  function setupLevel() {
    resetPlayer();
    vehicles = [];
    dockWorkers = [];
    mazeManifests = [];
    mazeDots.fill(0);
    projectiles = [];
    inspectors = [];
    puzzlePieces = [];
    draggedPiece = null;
    boardingProgress = 0;
    loadComplete = false;
    sailAway = 0;
    if (isMazeShift()) {
      generateMaze();
      initMazeHazards();
      timeLeft = Math.max(44, 68 - Math.floor(level / 4) * 3);
    } else if (isVesselShift()) {
      mazeWalls.fill(0);
      initPlatformer();
      timeLeft = Math.max(52, 76 - Math.floor(level / 4) * 3);
    } else if (isLoadShift()) {
      mazeWalls.fill(0);
      initLoadPuzzle();
      timeLeft = Math.max(60, 92 - Math.floor(level / 4) * 3);
    } else {
      mazeWalls.fill(0);
      initVehicles();
      timeLeft = Math.max(24, 46 - Math.floor(level / 4) * 2);
    }
    updateHud();
    updateCamera(0, true);
  }
  function cameraTarget() {
    if (isVesselShift()) return { x: platformPlayer.x, y: platformPlayer.y };
    if (isLoadShift()) return { x: 5.5, y: 6.5 };
    const progress = 1 - player.moving;
    return {
      x: player.col + (player.targetCol - player.col) * progress + .5,
      y: player.row + (player.targetRow - player.row) * progress + .5
    };
  }

  function updateCamera(dt, snap = false) {
    const target = cameraTarget();
    const targetZoom = isVesselShift() ? 1.78 : isMazeShift() ? 1.34 : isLoadShift() ? 1 : 1.42;
    const zoomBlend = snap ? 1 : 1 - Math.exp(-dt * 4.5);
    camera.zoom += (targetZoom - camera.zoom) * zoomBlend;
    const halfCols = COLS / camera.zoom / 2;
    const halfRows = ROWS / camera.zoom / 2;
    const desiredX = Math.max(halfCols, Math.min(COLS - halfCols, target.x));
    const desiredY = Math.max(halfRows, Math.min(ROWS - halfRows, target.y));
    const followBlend = snap ? 1 : 1 - Math.exp(-dt * (isVesselShift() ? 7.2 : 5.2));
    camera.x += (desiredX - camera.x) * followBlend;
    camera.y += (desiredY - camera.y) * followBlend;
    canvas.dataset.camera = `${camera.x.toFixed(2)},${camera.y.toFixed(2)},${camera.zoom.toFixed(2)}`;
  }

  function applyCamera() {
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x * cellW, -camera.y * cellH);
  }

  function drawCameraFrame() {
    const vignette = ctx.createRadialGradient(viewW / 2, viewH / 2, viewH * .22, viewW / 2, viewH / 2, viewW * .7);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,8,13,.42)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.fillStyle = "rgba(3,11,16,.78)";
    ctx.beginPath(); ctx.roundRect(10, viewH - 31, 178, 21, 4); ctx.fill();
    ctx.fillStyle = isVesselShift() || isLoadShift() ? COLORS.cyan : "#789197";
    ctx.font = "600 7px IBM Plex Mono";
    ctx.textAlign = "left";
    ctx.fillText(`CAM FOLLOW // ${shiftType().toUpperCase()} // ${camera.zoom.toFixed(2)}X`, 19, viewH - 17);
    if (isLoadShift()) {
      const placed = puzzlePieces.filter(piece => piece.placed).length;
      const panelWidth = Math.min(610, viewW * .68);
      ctx.fillStyle = "rgba(3,12,17,.95)";
      ctx.beginPath(); ctx.roundRect(10, 10, panelWidth, 72, 7); ctx.fill();
      ctx.strokeStyle = loadComplete ? COLORS.cyan : COLORS.amber;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = loadComplete ? COLORS.cyan : COLORS.amber;
      ctx.font = "800 12px IBM Plex Mono";
      ctx.fillText(loadComplete ? "IMAGE COMPLETE // BON VOYAGE" : `VESSEL PHOTO PUZZLE // ${placed} OF 6 PIECES`, 22, 32);
      ctx.fillStyle = "#d9e7e3";
      ctx.font = "700 10px IBM Plex Mono";
      ctx.fillText("DRAG EACH SCRAMBLED PHOTO PIECE INTO ITS MATCHING OUTLINE", 22, 52);
      ctx.fillStyle = "#8fa8ad";
      ctx.font = "700 8px IBM Plex Mono";
      ctx.fillText(loadMessage, 22, 70);
    }
    ctx.save();
    ctx.globalAlpha = .08;
    ctx.fillStyle = "#d8f3ee";
    for (let grain = 0; grain < 74; grain++) {
      const x = (grain * 137 + Math.floor(performance.now() / 70) * 17) % viewW;
      const y = (grain * 79 + 41) % viewH;
      ctx.fillRect(x, y, grain % 5 === 0 ? 2 : 1, 1);
    }
    ctx.restore();
    ctx.fillStyle = "rgba(1,7,10,.72)";
    ctx.fillRect(0, 0, viewW, 4);
    ctx.fillRect(0, viewH - 4, viewW, 4);
    ctx.strokeStyle = "rgba(83,211,207,.35)";
    ctx.strokeRect(2, 2, viewW - 4, viewH - 4);
  }

  function resetPlayer() {
    player = { col: 5, row: 12, targetCol: 5, targetRow: 12, moving: 0, facing: "up" };
    if (isVesselShift()) resetPlatformPlayer();
  }

  function startGame() {
    score = 0;
    level = Number(levelSelector.value);
    lives = 3;
    gameOver = false;
    paused = false;
    mood = "neutral";
    moodTimer = 0;
    personalityClock = 4 + Math.random() * 3;
    moveCount = 0;
    rainbowFarts = [];
    canvas.dataset.campaign = "active";
    canvas.dataset.mood = mood;
    running = true;
    particles = [];
    musicStep = 0;
    musicClock = 0;
    if (audioContext?.state === "suspended") audioContext.resume();
    setupLevel();
    startOverlay.classList.add("hidden");
    pauseOverlay.classList.add("hidden");
    playTone(330, .05, "square", .035);
    playTone(440, .08, "square", .025, .06);
  }

  function updateHud() {
    scoreEl.textContent = String(score).padStart(6, "0");
    levelEl.textContent = String(level).padStart(2, "0");
    livesEl.textContent = Array(Math.max(0, lives)).fill("◆").join(" ") || "—";
    livesEl.setAttribute("aria-label", `${lives} ${lives === 1 ? "life" : "lives"}`);
    bestEl.textContent = String(best).padStart(6, "0");
    canvas.dataset.shift = String(level);
    canvas.dataset.mode = shiftType();
    canvas.dataset.player = `${player.targetCol},${player.targetRow}`;
    canvas.dataset.manifests = `${mazeManifests.filter(manifest => manifest.collected).length}/${mazeManifests.length}`;
    canvas.dataset.puzzle = `${puzzlePieces.filter(piece => piece.placed).length}/${puzzlePieces.length}`;
    canvas.dataset.puzzlePieces = puzzlePieces.map(piece => `${piece.id}:${piece.x.toFixed(2)},${piece.y.toFixed(2)}>${piece.targetX.toFixed(2)},${piece.targetY.toFixed(2)}:${piece.placed ? 1 : 0}`).join("|");
    canvas.dataset.loadMessage = loadMessage;
    const labels = {
      traffic: `Shift ${level}: live terminal traffic. Use arrow keys or WASD to cross.`,
      maze: `Shift ${level}: container maze with dock workers. Collect every manifest and reach the north checkpoint.`,
      vessel: `Shift ${level}: vessel platformer. Jump with up or W and fire dangerous-goods magic with Space or F.`,
      load: `Shift ${level}: drag the six scrambled photo pieces into the matching outlines to rebuild the vessel image.`
    };
    canvas.setAttribute("aria-label", labels[shiftType()]);
    actionButton.textContent = isLoadShift() ? "DRAG" : "FIRE";
    actionButton.setAttribute("aria-label", isLoadShift() ? "Drag photo puzzle pieces on the game board" : "Fire dangerous-goods magic stun");
  }

  function togglePause(force) {
    if (!running || gameOver) return;
    paused = typeof force === "boolean" ? force : !paused;
    pauseTitle.textContent = "PAUSED";
    pauseMessage.textContent = "The terminal is holding.";
    document.getElementById("resumeButton").innerHTML = "<span>RESUME</span><b>P</b>";
    pauseOverlay.classList.toggle("hidden", !paused);
  }

  function finishGame() {
    mood = "neutral";
    moodTimer = 0;
    personalityClock = 4 + Math.random() * 3;
    moveCount = 0;
    rainbowFarts = [];
    gameOver = true;
    paused = true;
    best = Math.max(best, score);
    localStorage.setItem("harborHopBest", String(best));
    updateHud();
    pauseTitle.textContent = "SHIFT OVER";
    pauseMessage.textContent = `Final manifest score: ${String(score).padStart(6, "0")}`;
    document.getElementById("resumeButton").innerHTML = "<span>NEW SHIFT</span><b>ENTER ↵</b>";
    pauseOverlay.classList.remove("hidden");
    playTone(110, .3, "sawtooth", .035);
  }
  function finishCampaign() {
    gameOver = true;
    paused = true;
    running = false;
    best = Math.max(best, score);
    localStorage.setItem("harborHopBest", String(best));
    canvas.dataset.campaign = "complete";
    levelSelector.value = "1";
    setMood("laugh", 10);
    updateHud();
    pauseTitle.textContent = "VOYAGE COMPLETE";
    pauseMessage.textContent = `All four shifts cleared. MV Unicorn Star sailed with a score of ${String(score).padStart(6, "0")}.`;
    document.getElementById("resumeButton").innerHTML = "<span>SAIL AGAIN</span><b>ENTER ↵</b>";
    pauseOverlay.classList.remove("hidden");
    playTone(523.25, .16, "triangle", .035);
    playTone(659.25, .2, "triangle", .03, .14);
    playTone(783.99, .34, "triangle", .028, .3);
  }

  function move(direction) {
    if (!running || paused || (isLoadShift() && loadComplete)) return;
    if (isLoadShift()) return;
    if (isVesselShift()) {
      platformControl(direction, true);
      return;
    }
    if (player.moving > 0) return;
    const delta = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[direction];
    const nextCol = player.col + delta[0];
    const nextRow = player.row + delta[1];
    const missingManifests = mazeManifests.some(manifest => !manifest.collected);
    if (nextCol < 0 || nextCol >= COLS || nextRow < 0 || nextRow >= ROWS ||
      (isMazeShift() && (mazeWalls[cellIndex(nextCol, nextRow)] || (nextRow === 0 && missingManifests)))) {
      playTone(missingManifests && nextRow === 0 ? 90 : 115, .05, "square", .022);
      return;
    }
    player.targetCol = nextCol;
    player.targetRow = nextRow;
    player.moving = 1;
    player.facing = direction;
    moveCount++;
    if (moveCount % 4 === 0) emitRainbowFart();
    if (moveCount % 9 === 0) setMood("laugh", 1.2);
    score += direction === "up" ? 20 : 5;
    updateHud();
    playTone(240 + (12 - nextRow) * 15, .035, "square", .018);
  }

  function hitPlayer() {
    if (flash > 0 || boardingProgress > 0) return;
    const respawnVessel = isVesselShift();
    lives--;
    shake = .35;
    flash = .8;
    setMood("cry", 2.4);
    const hitX = isVesselShift() ? platformPlayer.x : player.col + .5;
    const hitY = isVesselShift() ? platformPlayer.y : player.row + .5;
    burst(hitX, hitY, COLORS.pink, 14);
    playTone(85, .16, "sawtooth", .055);
    playNoise(.2, .035, 190);
    platformMove = 0;
    if (lives <= 0) {
      updateHud();
      window.setTimeout(finishGame, 430);
    } else {
      window.setTimeout(() => {
        resetPlayer();
        if (respawnVessel) {
          spawnInspectors();
          projectiles = [];
          boardingProgress = 0;
        }
      }, 360);
      updateHud();
    }
  }

  function reachGoal() {
    score += 1000 + Math.ceil(timeLeft) * 10;
    const goalX = isVesselShift() ? platformPlayer.x : player.col + .5;
    const goalY = isVesselShift() ? platformPlayer.y : player.row + .5;
    burst(goalX, goalY, COLORS.cyan, 26);
    setMood("laugh", 2.2);
    playTone(540, .06, "square", .035);
    playTone(720, .12, "square", .035, .08);
    level++;
    if (level % 4 === 1) lives = Math.min(4, lives + 1);
    best = Math.max(best, score);
    localStorage.setItem("harborHopBest", String(best));
    setupLevel();
    paused = true;
    pauseTitle.textContent = `SHIFT ${String(level).padStart(2, "0")}`;
    const messages = {
      traffic: "Traffic density has increased. Cross the live terminal again.",
      maze: "Collect all three manifests while angry dock workers patrol the container maze.",
      vessel: "Board the vessel. Your GMR is incorrect and a terror mark has triggered a Home Office inspection.",
      load: "Build the vessel load plan. Fit the pictured cargo pieces into numbered bays in the correct order."
    };
    const buttons = {
      traffic: "START SHIFT",
      maze: "ENTER MAZE",
      vessel: "BOARD VESSEL",
      load: "OPEN STOWAGE PUZZLE"
    };
    pauseMessage.textContent = messages[shiftType()];
    document.getElementById("resumeButton").innerHTML = `<span>${buttons[shiftType()]}</span><b>ENTER ↵</b>`;
    pauseOverlay.classList.remove("hidden");
  }

  function platformControl(direction, active) {
    if (!isVesselShift() || boardingProgress > 0) return;
    if (!active) {
      if ((direction === "left" && platformMove < 0) || (direction === "right" && platformMove > 0)) platformMove = 0;
      return;
    }
    if (direction === "left") { platformMove = -1; player.facing = "left"; }
    if (direction === "right") { platformMove = 1; player.facing = "right"; }
    if (direction === "up" && platformPlayer.grounded) {
      platformPlayer.vy = -8.7;
      moveCount++;
      if (moveCount % 3 === 0) emitRainbowFart();
      platformPlayer.grounded = false;
      playTone(360, .06, "square", .022);
    }
  }

  function fireDangerousGoods() {
    if (!running || paused || fireCooldown > 0 || isLoadShift()) return;
    if (!isVesselShift() || boardingProgress > 0) return;
    const direction = player.facing === "left" ? -1 : 1;
    projectiles.push({ x: platformPlayer.x + direction * .35, y: platformPlayer.y - .12, vx: direction * 7.5, life: 1.6 });
    fireCooldown = .28;
    playTone(610, .055, "sawtooth", .025);
    playNoise(.045, .012, 1900);
    setMood("angry", 1.1);
  }

  function nextWorkerStep(startCol, startRow, targetCol, targetRow) {
    const total = COLS * ROWS;
    const queue = new Int16Array(total);
    const visited = new Uint8Array(total);
    const firstStep = new Int16Array(total);
    firstStep.fill(-1);
    const start = cellIndex(startCol, startRow);
    const target = cellIndex(targetCol, targetRow);
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;

    while (head < tail) {
      const current = queue[head++];
      const col = current % COLS;
      const row = Math.floor(current / COLS);
      for (const [dx, dy] of CARDINALS) {
        const nextCol = col + dx;
        const nextRow = row + dy;
        if (nextCol < 0 || nextCol >= COLS || nextRow < 0 || nextRow >= ROWS) continue;
        const next = cellIndex(nextCol, nextRow);
        if (visited[next] || mazeWalls[next]) continue;
        visited[next] = 1;
        firstStep[next] = current === start ? next : firstStep[current];
        if (next === target) {
          const step = firstStep[next];
          return { col: step % COLS, row: Math.floor(step / COLS) };
        }
        queue[tail++] = next;
      }
    }
    return { col: startCol, row: startRow };
  }

  function updateDockWorkers(dt) {
    const playerT = 1 - player.moving;
    const playerX = player.col + (player.targetCol - player.col) * playerT + .5;
    const playerY = player.row + (player.targetRow - player.row) * playerT + .5;
    dockWorkers.forEach(worker => {
      if (worker.progress >= 1) {
        worker.col = worker.nextCol;
        worker.row = worker.nextRow;
        const next = nextWorkerStep(worker.col, worker.row, player.targetCol, player.targetRow);
        worker.nextCol = next.col;
        worker.nextRow = next.row;
        worker.progress = 0;
      }
      worker.progress = Math.min(1, worker.progress + dt * worker.speed);
      const x = worker.col + (worker.nextCol - worker.col) * worker.progress + .5;
      const y = worker.row + (worker.nextRow - worker.row) * worker.progress + .5;
      if ((x - playerX) ** 2 + (y - playerY) ** 2 < .28) hitPlayer();
    });
    canvas.dataset.workers = dockWorkers
      .map(worker => `${(worker.col + (worker.nextCol - worker.col) * worker.progress).toFixed(2)},${(worker.row + (worker.nextRow - worker.row) * worker.progress).toFixed(2)}`)
      .join(";");
  }

  function updateVesselPlatforms() {
    const time = performance.now() / 1000;
    vesselPlatforms.forEach((platform, index) => {
      const previousX = platform.x;
      const previousY = platform.y;
      const offset = Math.sin(time * platform.speed + platform.phase) * platform.amplitude;
      platform.x = platform.baseX + (platform.axis === "x" ? offset : 0);
      platform.y = platform.baseY + (platform.axis === "y" ? offset : 0);
      if (platformPlayer.grounded && platformPlayer.platformIndex === index) {
        platformPlayer.x += platform.x - previousX;
        platformPlayer.y += platform.y - previousY;
      }
    });
    canvas.dataset.platforms = vesselPlatforms.map(platform => `${platform.x.toFixed(2)},${platform.y.toFixed(2)}`).join(";");
  }

  function updatePlatformer(dt) {
    fireCooldown = Math.max(0, fireCooldown - dt);
    if (boardingProgress > 0) {
      boardingProgress += dt;
      platformMove = 0;
      platformPlayer.vx = 0;
      platformPlayer.vy = 0;
      platformPlayer.x += (10.5 - platformPlayer.x) * Math.min(1, dt * 3.2);
      platformPlayer.y += (.72 - platformPlayer.y) * Math.min(1, dt * 3.2);
      canvas.dataset.boarding = boardingProgress.toFixed(2);
      if (boardingProgress >= 1.85) reachGoal();
      return;
    }

    updateVesselPlatforms();
    platformPlayer.vx = platformMove * 4.2;
    platformPlayer.vy += 18 * dt;
    const previousBottom = platformPlayer.y + .38;
    platformPlayer.x = Math.max(.25, Math.min(COLS - .25, platformPlayer.x + platformPlayer.vx * dt));
    platformPlayer.y += platformPlayer.vy * dt;
    platformPlayer.grounded = false;

    if (platformPlayer.vy >= 0) {
      for (let index = 0; index < vesselPlatforms.length; index++) {
        const platform = vesselPlatforms[index];
        const nextBottom = platformPlayer.y + .38;
        if (previousBottom <= platform.y + .05 && nextBottom >= platform.y &&
          platformPlayer.x + .24 > platform.x && platformPlayer.x - .24 < platform.x + platform.w) {
          platformPlayer.y = platform.y - .38;
          platformPlayer.vy = 0;
          platformPlayer.grounded = true;
          platformPlayer.platformIndex = index;
          break;
        }
      }
    }

    inspectors.forEach(inspector => {
      if (!inspector.active) return;
      inspector.x += inspector.dir * (.72 + level * .025) * dt;
      if (inspector.x <= inspector.minX || inspector.x >= inspector.maxX) inspector.dir *= -1;
      if (Math.abs(inspector.x - platformPlayer.x) < .34 && Math.abs(inspector.y - platformPlayer.y) < .5) hitPlayer();
    });

    projectiles.forEach(projectile => {
      projectile.x += projectile.vx * dt;
      projectile.life -= dt;
      inspectors.forEach(inspector => {
        if (inspector.active && Math.abs(inspector.x - projectile.x) < .35 && Math.abs(inspector.y - projectile.y) < .45) {
          inspector.active = false;
          projectile.life = 0;
          score += 150;
          burst(inspector.x, inspector.y, COLORS.cyan, 12);
          playTone(760, .09, "square", .025);
          updateHud();
        }
      });
    });
    projectiles = projectiles.filter(projectile => projectile.life > 0 && projectile.x > -.5 && projectile.x < COLS + .5);

    canvas.dataset.playerX = platformPlayer.x.toFixed(2);
    canvas.dataset.playerY = platformPlayer.y.toFixed(2);
    canvas.dataset.inspectors = String(inspectors.filter(inspector => inspector.active).length);
    canvas.dataset.boarding = "0";
    if (platformPlayer.y > ROWS + .6) hitPlayer();
    if (platformPlayer.x > 10.15 && platformPlayer.y < 1.25) {
      boardingProgress = .001;
      platformMove = 0;
      score += 750;
      playTone(165, .5, "sawtooth", .03);
      playTone(220, .7, "sawtooth", .022, .18);
      playNoise(.55, .02, 120);
      updateHud();
    }
  }

  function updateLoadPuzzle(dt) {
    if (!loadComplete) return;
    sailAway += dt;
    canvas.dataset.sailAway = sailAway.toFixed(2);
    if (sailAway >= 4.2) finishCampaign();
  }


  function update(dt) {
    if (!running || paused) return;
    timeLeft -= dt;
    if (timeLeft <= 0 && !(isLoadShift() && loadComplete) && boardingProgress === 0) {
      timeLeft = 0;
      hitPlayer();
      timeLeft = isMazeShift() ? Math.max(44, 68 - Math.floor(level / 4) * 3)
        : isVesselShift() ? Math.max(52, 76 - Math.floor(level / 4) * 3)
          : isLoadShift() ? Math.max(60, 92 - Math.floor(level / 4) * 3)
            : Math.max(24, 46 - Math.floor(level / 4) * 2);
    }

    if (isTrafficShift()) {
      const levelSpeed = 1 + Math.floor(level / 4) * .12;
      vehicles.forEach(vehicle => {
        vehicle.x += vehicle.speed * vehicle.dir * levelSpeed * dt;
        if (vehicle.dir > 0 && vehicle.x > COLS + vehicle.length) vehicle.x = -vehicle.length;
        if (vehicle.dir < 0 && vehicle.x < -vehicle.length) vehicle.x = COLS + vehicle.length;
      });
    } else if (isVesselShift()) {
      updatePlatformer(dt);
    } else if (isLoadShift()) {
      updateLoadPuzzle(dt);
    }

    if (!isVesselShift() && player.moving > 0) {
      player.moving = Math.max(0, player.moving - dt * 7.5);
      if (player.moving === 0) {
        player.col = player.targetCol;
        player.row = player.targetRow;
        if (isMazeShift()) {
          const dotIndex = cellIndex(player.col, player.row);
          if (mazeDots[dotIndex]) {
            mazeDots[dotIndex] = 0;
            score += 10;
            playTone(420, .025, "square", .012);
            updateHud();
          }
          const manifest = mazeManifests.find(item => !item.collected && item.col === player.col && item.row === player.row);
          if (manifest) {
            manifest.collected = true;
            score += 250;
            burst(player.col + .5, player.row + .5, COLORS.amber, 14);
            playTone(680, .08, "square", .028);
            updateHud();
          }
        }
        if (player.row === 0 && !isLoadShift()) reachGoal();
      }
    }

    if (isTrafficShift()) {
      const px = player.col + (player.targetCol - player.col) * (1 - player.moving) + .5;
      const py = player.row + (player.targetRow - player.row) * (1 - player.moving) + .5;
      if (LANE_ROWS.includes(Math.round(py - .5))) {
        vehicles.forEach(vehicle => {
          if (Math.abs(py - (vehicle.row + .5)) < .42 && px > vehicle.x + .08 && px < vehicle.x + vehicle.length - .08) hitPlayer();
        });
      }
    } else if (isMazeShift()) {
      updateDockWorkers(dt);
    }

    moodTimer = Math.max(0, moodTimer - dt);
    if (moodTimer === 0 && mood !== "neutral") {
      mood = "neutral";
      canvas.dataset.mood = mood;
    }
    personalityClock -= dt;
    if (personalityClock <= 0 && mood === "neutral") {
      const moods = ["laugh", "cry", "angry"];
      setMood(moods[Math.floor(Math.random() * moods.length)], 1.25);
      personalityClock = 6 + Math.random() * 5;
    }
    updateMusic(dt);
    particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 1.7 * dt; p.life -= dt; });
    particles = particles.filter(p => p.life > 0);
    rainbowFarts.forEach(fart => { fart.x += fart.vx * dt; fart.y += fart.vy * dt; fart.life -= dt; });
    rainbowFarts = rainbowFarts.filter(fart => fart.life > 0);
    canvas.dataset.rainbowFarts = String(rainbowFarts.length);
    shake = Math.max(0, shake - dt);
    flash = Math.max(0, flash - dt);
    updateCamera(dt);
  }

  function setMood(nextMood, duration) {
    mood = nextMood;
    moodTimer = duration;
    canvas.dataset.mood = mood;
  }

  function emitRainbowFart() {
    const position = isVesselShift()
      ? { x: platformPlayer.x, y: platformPlayer.y }
      : cameraTarget();
    const behind = {
      up: [0, .42], down: [0, -.42], left: [.42, 0], right: [-.42, 0]
    }[player.facing] || [0, .42];
    const colors = ["#ff3f4b", "#ff9f2d", "#ffe64a", "#45dc70", "#32dce5", "#715de4", "#ef68b5"];
    colors.forEach((color, index) => {
      rainbowFarts.push({
        x: position.x + behind[0] + (index - 3) * Math.abs(behind[1]) * .05,
        y: position.y + behind[1] + (index - 3) * Math.max(.045, Math.abs(behind[0]) * .05),
        vx: behind[0] * 2.55 + (Math.random() - .5) * .18,
        vy: behind[1] * 2.55 - .24 + (Math.random() - .5) * .14,
        life: 1.8,
        color,
        size: 13 + Math.random() * 7,
        cloud: index === 0
      });
    });
    playTone(68, .16, "sawtooth", .035);
    playTone(45, .22, "square", .022, .035);
    playNoise(.16, .032, 105);
  }

  function drawRainbowFarts() {
    rainbowFarts.forEach(fart => {
      const alpha = Math.max(0, fart.life / 1.8);
      const x = fart.x * cellW;
      const y = fart.y * cellH;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = fart.color;
      ctx.fillStyle = fart.color;
      ctx.shadowColor = fart.color;
      ctx.shadowBlur = fart.size * .8;
      ctx.lineWidth = fart.size;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x - fart.vx * cellW * .14,
        y - fart.vy * cellH * .08 - fart.size,
        x - fart.vx * cellW * .28,
        y - fart.vy * cellH * .18
      );
      ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, fart.size * .55, 0, Math.PI * 2); ctx.fill();
      if (fart.cloud) {
        ctx.fillStyle = "rgba(245,255,252,.9)";
        ctx.shadowColor = "rgba(255,255,255,.7)";
        ctx.beginPath();
        ctx.arc(x + fart.size * .4, y, fart.size * .48, 0, Math.PI * 2);
        ctx.arc(x, y - fart.size * .25, fart.size * .58, 0, Math.PI * 2);
        ctx.arc(x - fart.size * .45, y, fart.size * .42, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 2.7;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .45 + Math.random() * .55, color, size: 1.5 + Math.random() * 2.5 });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = "#020a0f";
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - .5) * 8 * shake, (Math.random() - .5) * 8 * shake);
    applyCamera();
    if (isMazeShift()) {
      drawMaze();
      drawDockWorkers();
    } else if (isVesselShift()) {
      drawVessel();
    } else if (isLoadShift()) {
      drawLoadPuzzle();
    } else {
      drawTerminal();
      drawVehicles();
    }
    if (!isLoadShift()) drawPlayer();
    drawRainbowFarts();
    drawParticles();
    ctx.restore();
    drawCameraFrame();
    drawTelemetry();
    if (flash > .5) {
      ctx.fillStyle = `rgba(255,91,75,${(flash - .5) * .22})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }


  function drawTerminal() {
    const base = ctx.createLinearGradient(0, 0, 0, viewH);
    base.addColorStop(0, "#163239");
    base.addColorStop(.45, "#10242a");
    base.addColorStop(1, "#09171c");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, viewW, viewH);
    drawPhotoBackdrop("terminal", .42);
    ctx.save();
    ctx.globalAlpha = .82;

    for (let row = 0; row < ROWS; row++) {
      const y = row * cellH;
      if (SAFE_ROWS.has(row)) {
        const safe = ctx.createLinearGradient(0, y, 0, y + cellH);
        safe.addColorStop(0, row <= 1 ? "#17474b" : "#263b3e");
        safe.addColorStop(1, row <= 1 ? "#0e3035" : "#18292e");
        ctx.fillStyle = safe;
        ctx.fillRect(0, y, viewW, cellH);
        ctx.fillStyle = "rgba(255,255,255,.028)";
        for (let x = (row % 2) * cellW; x < viewW; x += cellW * 2) ctx.fillRect(x, y, cellW, cellH);
      } else {
        const road = ctx.createLinearGradient(0, y, 0, y + cellH);
        road.addColorStop(0, row % 2 ? "#1c3036" : "#192b31");
        road.addColorStop(.5, row % 2 ? "#15262c" : "#13242a");
        road.addColorStop(1, "#0f2025");
        ctx.fillStyle = road;
        ctx.fillRect(0, y, viewW, cellH);
        ctx.strokeStyle = "rgba(185,218,218,.2)";
        ctx.lineWidth = 1;
        ctx.setLineDash([cellW * .2, cellW * .24]);
        ctx.beginPath(); ctx.moveTo(0, y + cellH); ctx.lineTo(viewW, y + cellH); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(65, 217, 212, .025)";
        ctx.fillRect(0, y + cellH * .12, viewW, cellH * .18);
      }
    }
    ctx.restore();
    ctx.save();
    ctx.font = `600 ${Math.max(6, cellH * .115)}px IBM Plex Mono`;
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(177, 205, 207, .38)";
    laneConfig.forEach(lane => ctx.fillText(`L${lane.row}  ${lane.label}`, 8, lane.row * cellH + cellH * .2));
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = .26;
    ctx.fillStyle = "#07141a";
    for (const craneX of [cellW * .7, cellW * 7.7]) {
      ctx.fillRect(craneX, cellH * .4, cellW * .14, cellH * 4.6);
      ctx.strokeStyle = "#49636a";
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(craneX, cellH * .5); ctx.lineTo(craneX + cellW * 2.6, cellH * .08); ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(craneX + cellW * 1.9, cellH * .18); ctx.lineTo(craneX + cellW * 1.9, cellH * 2.2); ctx.stroke();
    }
    ctx.restore();

    for (const light of [[1.2, 3.5], [5.5, 7.5], [9.6, 4.5]]) {
      const glow = ctx.createRadialGradient(light[0] * cellW, light[1] * cellH, 0, light[0] * cellW, light[1] * cellH, cellW * 1.2);
      glow.addColorStop(0, "rgba(255,191,95,.15)");
      glow.addColorStop(1, "rgba(255,191,95,0)");
      ctx.fillStyle = glow;
      ctx.fillRect((light[0] - 1.2) * cellW, (light[1] - 1.2) * cellH, cellW * 2.4, cellH * 2.4);
    }

    ctx.fillStyle = "rgba(181,224,221,.045)";
    for (let puddle = 0; puddle < 18; puddle++) {
      const x = ((puddle * 71 + 23) % 109) / 109 * viewW;
      const y = ((puddle * 47 + 31) % 101) / 101 * viewH;
      ctx.beginPath(); ctx.ellipse(x, y, cellW * (.12 + puddle % 4 * .04), cellH * .035, -.08, 0, Math.PI * 2); ctx.fill();
    }

    ctx.strokeStyle = "rgba(180,218,214,.12)";
    ctx.lineWidth = 1;
    for (let rain = 0; rain < 42; rain++) {
      const x = (rain * 113 + performance.now() * .07) % (viewW + 50) - 25;
      const y = (rain * 61 + performance.now() * .13) % viewH;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 7, y + 16); ctx.stroke();
    }

    const checkpointGlow = ctx.createLinearGradient(0, 0, viewW, 0);
    checkpointGlow.addColorStop(0, "rgba(57,225,219,.04)");
    checkpointGlow.addColorStop(.5, "rgba(57,225,219,.22)");
    checkpointGlow.addColorStop(1, "rgba(57,225,219,.04)");
    ctx.fillStyle = checkpointGlow;
    ctx.fillRect(0, 0, viewW, cellH * 1.05);
    ctx.save();
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 12;
    ctx.fillStyle = COLORS.cyan;
    ctx.fillRect(0, cellH - 3, viewW, 3);
    ctx.restore();
    ctx.font = `${Math.max(7, cellH * .16)}px IBM Plex Mono`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(186,255,249,.78)";
    ctx.fillText("NORTH CHECKPOINT  /  NORTH CHECKPOINT  /  NORTH CHECKPOINT", viewW / 2, cellH * .57);

    drawSafeStripe(5, COLORS.amber, "HOLD  //  CHECK TRAFFIC  //  HOLD  //  CHECK TRAFFIC");
    drawSafeStripe(11, "#8aa1a4", "PEDESTRIAN QUAY  08  /  PEDESTRIAN QUAY  08");

    ctx.strokeStyle = "rgba(74,223,218,.1)";
    ctx.lineWidth = 1;
    for (let col = 1; col < COLS; col++) {
      ctx.beginPath(); ctx.moveTo(col * cellW, 0); ctx.lineTo(col * cellW, viewH); ctx.stroke();
    }

    const pulse = .6 + Math.sin(performance.now() / 420) * .25;
    for (let x = cellW * .6; x < viewW; x += cellW * 2.25) {
      drawBollard(x, cellH * 1.55);
      ctx.fillStyle = `rgba(255,181,46,${pulse})`;
      ctx.beginPath(); ctx.arc(x, cellH * 1.52, 2.2, 0, Math.PI * 2); ctx.fill();
    }

    const sheen = (performance.now() * .035) % (viewW + 240) - 240;
    const scan = ctx.createLinearGradient(sheen, 0, sheen + 240, 0);
    scan.addColorStop(0, "rgba(255,255,255,0)");
    scan.addColorStop(.5, "rgba(118,255,247,.028)");
    scan.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = scan;
    ctx.fillRect(0, 0, viewW, viewH);
  }
  function drawMaze() {
    const floor = ctx.createRadialGradient(viewW * .5, viewH * .45, 0, viewW * .5, viewH * .45, viewW * .8);
    floor.addColorStop(0, "#0b2732");
    floor.addColorStop(.62, "#071a25");
    floor.addColorStop(1, "#030b13");
    ctx.fillStyle = floor;
    ctx.fillRect(0, 0, viewW, viewH);
    drawPhotoBackdrop("containers", .3);

    ctx.fillStyle = "rgba(36, 193, 211, .025)";
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (!mazeWalls[cellIndex(col, row)]) ctx.fillRect(col * cellW, row * cellH, cellW, cellH);
      }
    }

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (!mazeWalls[cellIndex(col, row)]) continue;
        const x = col * cellW + 4;
        const y = row * cellH + 4;
        const width = cellW - 8;
        const height = cellH - 8;
        ctx.save();
        ctx.shadowColor = "rgba(18, 90, 138, .58)";
        ctx.shadowBlur = 7;
        const steel = ctx.createLinearGradient(x, y, x + width, y + height);
        steel.addColorStop(0, "#294655");
        steel.addColorStop(.42, "#102b3b");
        steel.addColorStop(.72, "#1d3945");
        steel.addColorStop(1, "#0a202d");
        ctx.fillStyle = steel;
        ctx.beginPath(); ctx.roundRect(x, y, width, height, Math.min(8, cellH * .14)); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(63,158,205,.8)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = "rgba(176,214,211,.16)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + 5, y + height * .34); ctx.lineTo(x + width - 5, y + height * .34); ctx.moveTo(x + 5, y + height * .7); ctx.lineTo(x + width - 5, y + height * .7); ctx.stroke();
        ctx.fillStyle = "#8ba3a0";
        for (const bolt of [[7,7],[width-7,7],[7,height-7],[width-7,height-7]]) {
          ctx.beginPath(); ctx.arc(x + bolt[0], y + bolt[1], 1.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = "rgba(155,69,42,.18)";
        ctx.fillRect(x + width * .68, y + 3, width * .08, height - 6);
        ctx.restore();
      }
    }

    const dotPulse = .72 + Math.sin(performance.now() / 210) * .18;
    ctx.fillStyle = `rgba(255, 205, 91, ${dotPulse})`;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (!mazeDots[cellIndex(col, row)]) continue;
        ctx.beginPath();
        ctx.arc((col + .5) * cellW, (row + .5) * cellH, Math.max(2, Math.min(cellW, cellH) * .045), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    mazeManifests.forEach(manifest => {
      if (manifest.collected) return;
      const x = (manifest.col + .5) * cellW;
      const y = (manifest.row + .5) * cellH;
      const pulse = 1 + Math.sin(performance.now() / 170 + manifest.col) * .12;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(pulse, pulse);
      ctx.shadowColor = COLORS.amber;
      ctx.shadowBlur = 18;
      ctx.fillStyle = "#fff3c6";
      ctx.beginPath(); ctx.roundRect(-11, -14, 22, 28, 3); ctx.fill();
      ctx.fillStyle = COLORS.red;
      ctx.fillRect(-7, -8, 14, 4);
      ctx.fillStyle = "#82601f";
      ctx.fillRect(-7, 1, 10, 2);
      ctx.fillRect(-7, 6, 13, 2);
      ctx.restore();
    });

    const collected = mazeManifests.filter(manifest => manifest.collected).length;
    const exitReady = collected === mazeManifests.length;
    const exitColor = exitReady ? COLORS.cyan : COLORS.red;
    ctx.save();
    ctx.shadowColor = exitColor;
    ctx.shadowBlur = 18;
    ctx.fillStyle = exitColor;
    ctx.fillRect(5 * cellW + 8, 0, cellW - 16, 5);
    ctx.restore();
    ctx.fillStyle = exitReady ? "rgba(57,225,219,.16)" : "rgba(255,91,75,.16)";
    ctx.fillRect(5 * cellW, 0, cellW, cellH);
    ctx.fillStyle = exitReady ? "#c8fffb" : "#ffb2aa";
    ctx.font = `700 ${Math.max(7, cellH * .16)}px IBM Plex Mono`;
    ctx.textAlign = "center";
    ctx.fillText(exitReady ? "EXIT" : "LOCKED", 5.5 * cellW, cellH * .58);

    ctx.fillStyle = "rgba(2,8,15,.88)";
    ctx.beginPath(); ctx.roundRect(9, 9, Math.min(viewW * .5, 370), 31, 5); ctx.fill();
    ctx.strokeStyle = "rgba(39,137,238,.65)";
    ctx.stroke();
    ctx.fillStyle = exitReady ? COLORS.cyan : COLORS.amber;
    ctx.textAlign = "left";
    ctx.font = `700 ${Math.max(8, cellH * .15)}px IBM Plex Mono`;
    ctx.fillText(`PAC-PORT // MANIFESTS ${collected}/3 // CHASERS ${dockWorkers.length}`, 19, 29);
  }
  function drawDockWorkers() {
    const now = performance.now();
    dockWorkers.forEach(worker => {
      const worldX = worker.col + (worker.nextCol - worker.col) * worker.progress;
      const worldY = worker.row + (worker.nextRow - worker.row) * worker.progress;
      const x = (worldX + .5) * cellW;
      const y = (worldY + .55) * cellH;
      const size = Math.min(cellW, cellH) * .94;
      const stride = Math.sin(now / 95 + worker.id * 1.7) * size * .09;
      const near = Math.abs(worldX - player.col) + Math.abs(worldY - player.row) < 4;
      ctx.save();
      ctx.translate(x, y);

      ctx.fillStyle = "rgba(0,0,0,.48)";
      ctx.beginPath(); ctx.ellipse(0, size * .39, size * .32, size * .1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = near ? "rgba(255, 62, 45, .88)" : "rgba(255, 106, 47, .5)";
      ctx.shadowBlur = near ? 18 : 9;

      ctx.strokeStyle = "#17232b";
      ctx.lineWidth = Math.max(4, size * .11);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-size * .1, size * .25); ctx.lineTo(-size * .16 + stride, size * .48);
      ctx.moveTo(size * .1, size * .25); ctx.lineTo(size * .16 - stride, size * .48);
      ctx.stroke();

      const vest = ctx.createLinearGradient(0, -size * .08, 0, size * .32);
      vest.addColorStop(0, "#ff8a32");
      vest.addColorStop(1, "#d94a21");
      ctx.fillStyle = vest;
      ctx.beginPath(); ctx.roundRect(-size * .29, -size * .08, size * .58, size * .42, size * .08); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(230,255,248,.9)";
      ctx.fillRect(-size * .27, size * .05, size * .54, size * .055);
      ctx.fillRect(-size * .27, size * .19, size * .54, size * .055);
      ctx.fillStyle = "#11252d";
      ctx.fillRect(-size * .025, -size * .04, size * .05, size * .35);

      ctx.strokeStyle = "#e0a982";
      ctx.lineWidth = Math.max(4, size * .1);
      ctx.beginPath();
      ctx.moveTo(-size * .25, 0); ctx.lineTo(-size * .38, size * .18 + stride * .4);
      ctx.moveTo(size * .25, 0); ctx.lineTo(size * .38, size * .18 - stride * .4);
      ctx.stroke();
      ctx.fillStyle = "#e3ad87";
      ctx.beginPath(); ctx.arc(-size * .4, size * .2 + stride * .4, size * .075, 0, Math.PI * 2); ctx.arc(size * .4, size * .2 - stride * .4, size * .075, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = "#e5b38f";
      ctx.beginPath(); ctx.arc(0, -size * .25, size * .22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#7a3428";
      ctx.beginPath(); ctx.arc(0, -size * .29, size * .18, 0, Math.PI); ctx.fill();
      ctx.fillStyle = COLORS.amber;
      ctx.beginPath(); ctx.arc(0, -size * .34, size * .25, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillRect(-size * .29, -size * .36, size * .58, size * .085);
      ctx.fillStyle = "rgba(255,255,255,.24)";
      ctx.fillRect(-size * .14, -size * .47, size * .28, size * .04);

      ctx.strokeStyle = "#4b1719";
      ctx.lineWidth = Math.max(1.8, size * .045);
      ctx.beginPath();
      ctx.moveTo(-size * .14, -size * .3); ctx.lineTo(-size * .035, -size * .25);
      ctx.moveTo(size * .14, -size * .3); ctx.lineTo(size * .035, -size * .25);
      ctx.moveTo(-size * .09, -size * .12); ctx.quadraticCurveTo(0, -size * .18, size * .09, -size * .12);
      ctx.stroke();
      ctx.fillStyle = "#1d1012";
      ctx.beginPath(); ctx.arc(-size * .075, -size * .23, size * .028, 0, Math.PI * 2); ctx.arc(size * .075, -size * .23, size * .028, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(61,39,47,.42)";
      ctx.beginPath(); ctx.ellipse(-size * .075, -size * .19, size * .072, size * .034, 0, 0, Math.PI * 2); ctx.ellipse(size * .075, -size * .19, size * .072, size * .034, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(72,48,39,.36)";
      for (let stubble = 0; stubble < 9; stubble++) {
        const sx = ((stubble * 17) % 13 - 6) * size * .018;
        const sy = -size * .12 + (stubble % 3) * size * .035;
        ctx.fillRect(sx, sy, 1, 1);
      }

      ctx.fillStyle = "#10212a";
      ctx.beginPath(); ctx.roundRect(size * .07, size * .09, size * .13, size * .1, 2); ctx.fill();
      ctx.fillStyle = COLORS.cyan;
      ctx.fillRect(size * .095, size * .115, size * .08, size * .02);

      if (near) {
        ctx.shadowColor = COLORS.red;
        ctx.shadowBlur = 10;
        ctx.fillStyle = COLORS.red;
        ctx.font = `900 ${Math.max(14, size * .34)}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText("!", 0, -size * .62);
      }
      ctx.restore();
    });
  }

  function drawVessel() {
    const now = performance.now();
    const sky = ctx.createLinearGradient(0, 0, 0, viewH);
    sky.addColorStop(0, "#020914");
    sky.addColorStop(.48, "#082332");
    sky.addColorStop(1, "#0b3e4b");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewW, viewH);
    drawPhotoBackdrop("vessel", .32);

    ctx.fillStyle = "rgba(189,232,225,.06)";
    ctx.beginPath(); ctx.arc(viewW * .82, viewH * .12, cellH * 1.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(218,246,239,.45)";
    ctx.beginPath(); ctx.arc(viewW * .82, viewH * .12, cellH * .38, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(193,238,234,.48)";
    for (let star = 0; star < 38; star++) {
      const x = ((star * 83 + 37) % 997) / 997 * viewW;
      const y = ((star * 47 + 19) % 311) / 311 * viewH * .42;
      ctx.fillRect(x, y, star % 5 === 0 ? 2 : 1, star % 5 === 0 ? 2 : 1);
    }

    ctx.fillStyle = "rgba(2,13,20,.62)";
    ctx.fillRect(0, viewH * .73, viewW, viewH * .27);
    ctx.strokeStyle = "rgba(57,225,219,.2)";
    ctx.lineWidth = 2;
    for (let wave = -1; wave < 12; wave++) {
      const offset = (now * .018 + wave * cellW) % (cellW * 2) - cellW;
      ctx.beginPath();
      ctx.moveTo(offset, viewH * .82 + (wave % 3) * 14);
      ctx.quadraticCurveTo(offset + cellW * .5, viewH * .78 + (wave % 3) * 14, offset + cellW, viewH * .82 + (wave % 3) * 14);
      ctx.stroke();
    }

    ctx.save();
    ctx.globalAlpha = .34;
    ctx.strokeStyle = "#315160";
    ctx.fillStyle = "#07141c";
    for (const craneX of [cellW * .5, cellW * 9.2]) {
      ctx.fillRect(craneX, cellH * 2.2, cellW * .16, cellH * 8.8);
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(craneX, cellH * 2.3); ctx.lineTo(craneX + cellW * 2.2, cellH * .8); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(craneX + cellW * 1.55, cellH * 1.25); ctx.lineTo(craneX + cellW * 1.55, cellH * 4.1); ctx.stroke();
    }
    ctx.restore();

    const hull = ctx.createLinearGradient(0, cellH, 0, viewH);
    hull.addColorStop(0, "rgba(35,76,88,.9)");
    hull.addColorStop(.55, "rgba(19,52,64,.96)");
    hull.addColorStop(1, "#092530");
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(cellW * .55, viewH);
    ctx.lineTo(cellW * 1.25, cellH * .65);
    ctx.lineTo(cellW * 10.65, cellH * .65);
    ctx.lineTo(viewW, viewH);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(90,165,174,.25)";
    ctx.lineWidth = 2;
    for (let col = 2; col < 11; col++) {
      ctx.beginPath(); ctx.moveTo(col * cellW, cellH * .68); ctx.lineTo((col - .55) * cellW, viewH); ctx.stroke();
    }
    for (let row = 2; row < 13; row += 2) {
      ctx.beginPath(); ctx.moveTo(cellW, row * cellH); ctx.lineTo(viewW, row * cellH); ctx.stroke();
    }

    ctx.fillStyle = "#06171e";
    ctx.strokeStyle = "rgba(89,225,217,.45)";
    for (let port = 0; port < 8; port++) {
      const x = (1.8 + port * 1.1) * cellW;
      const y = (1.35 + (port % 2) * .18) * cellH;
      ctx.beginPath(); ctx.arc(x, y, cellH * .11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = port % 3 === 0 ? "rgba(255,181,46,.55)" : "#06171e";
      ctx.beginPath(); ctx.arc(x, y, cellH * .055, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#06171e";
    }

    ctx.strokeStyle = "rgba(7,14,18,.78)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (let link = 0; link < 13; link++) {
      const x = cellW * (.95 + Math.sin(link * .62) * .17);
      const y = cellH * (2.1 + link * .72);
      if (link === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = "rgba(168,207,202,.46)";
    ctx.lineWidth = 2;
    [1, 3, 5].forEach(index => {
      const platform = vesselPlatforms[index];
      const center = (platform.x + platform.w * .5) * cellW;
      ctx.beginPath(); ctx.moveTo(center - cellW * .4, 0); ctx.lineTo(center - cellW * .4, platform.y * cellH); ctx.moveTo(center + cellW * .4, 0); ctx.lineTo(center + cellW * .4, platform.y * cellH); ctx.stroke();
    });

    vesselPlatforms.forEach((platform, index) => {
      const x = platform.x * cellW;
      const y = platform.y * cellH;
      const width = platform.w * cellW;
      const height = Math.max(9, platform.h * cellH);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.7)";
      ctx.shadowBlur = 14;
      const cargo = ctx.createLinearGradient(x, y, x, y + height);
      cargo.addColorStop(0, index % 2 ? "#e06145" : "#e1a634");
      cargo.addColorStop(1, index % 2 ? "#8d2d2a" : "#80601f");
      ctx.fillStyle = cargo;
      ctx.beginPath(); ctx.roundRect(x, y, width, height, 3); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,.2)";
      ctx.fillRect(x + 4, y + 3, width - 8, 2);
      ctx.strokeStyle = "rgba(5,15,19,.52)";
      for (let rib = 18; rib < width; rib += 22) { ctx.beginPath(); ctx.moveTo(x + rib, y + 3); ctx.lineTo(x + rib, y + height - 2); ctx.stroke(); }
      ctx.strokeStyle = "rgba(198,224,220,.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - cellH * .22); ctx.moveTo(x + width, y); ctx.lineTo(x + width, y - cellH * .22); ctx.moveTo(x, y - cellH * .22); ctx.lineTo(x + width, y - cellH * .22); ctx.stroke();
      for (let rail = 0; rail <= 5; rail++) {
        const railX = x + width * rail / 5;
        ctx.beginPath(); ctx.moveTo(railX, y); ctx.lineTo(railX, y - cellH * .22); ctx.stroke();
      }
      ctx.restore();
    });

    const doorX = 10.18 * cellW;
    const doorY = .18 * cellH;
    ctx.save();
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 22;
    ctx.fillStyle = "#123944";
    ctx.fillRect(doorX, doorY, cellW * .62, cellH * 1.05);
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 3;
    ctx.strokeRect(doorX, doorY, cellW * .62, cellH * 1.05);
    ctx.restore();
    ctx.fillStyle = "#bafffa";
    ctx.font = `700 ${Math.max(7, cellH * .13)}px IBM Plex Mono`;
    ctx.textAlign = "center";
    ctx.fillText("BOARD", doorX + cellW * .31, doorY + cellH * .62);

    const navPulse = .35 + Math.sin(now / 190) * .3;
    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = COLORS.red;
    ctx.fillStyle = `rgba(255,75,64,${navPulse + .4})`;
    ctx.beginPath(); ctx.arc(cellW * 1.3, cellH * .62, 5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = COLORS.cyan;
    ctx.fillStyle = `rgba(57,225,219,${navPulse + .4})`;
    ctx.beginPath(); ctx.arc(cellW * 10.65, cellH * .62, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.fillStyle = "rgba(3,10,15,.9)";
    ctx.beginPath(); ctx.roundRect(12, 12, Math.min(410, viewW * .48), 62, 5); ctx.fill();
    ctx.strokeStyle = "rgba(255,91,75,.55)";
    ctx.stroke();
    ctx.fillStyle = COLORS.red;
    ctx.font = `700 ${Math.max(9, cellH * .18)}px IBM Plex Mono`;
    ctx.textAlign = "left";
    ctx.fillText("HOME OFFICE // VESSEL INTERCEPT", 24, 34);
    ctx.fillStyle = "#ffaaa2";
    ctx.font = `600 ${Math.max(8, cellH * .14)}px IBM Plex Mono`;
    ctx.fillText("TERROR MARK: STAMPED    GMR: INCORRECT", 24, 55);

    inspectors.forEach(inspector => {
      if (!inspector.active) return;
      const x = inspector.x * cellW;
      const y = inspector.y * cellH;
      const size = Math.min(cellW, cellH) * .74;
      ctx.save();
      ctx.translate(x, y);
      if (inspector.dir < 0) ctx.scale(-1, 1);
      ctx.shadowColor = "rgba(255,91,75,.35)";
      ctx.shadowBlur = 9;
      ctx.fillStyle = "#101a24";
      ctx.beginPath(); ctx.roundRect(-size * .22, -size * .08, size * .44, size * .48, 4); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#e1bca0";
      ctx.beginPath(); ctx.arc(0, -size * .22, size * .17, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#172332";
      ctx.beginPath(); ctx.arc(0, -size * .27, size * .19, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLORS.red;
      ctx.beginPath(); ctx.moveTo(-size * .08, size * .02); ctx.lineTo(size * .08, size * .02); ctx.lineTo(0, size * .17); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#d5e7e8";
      ctx.fillRect(-size * .17, size * .05, size * .1, size * .08);
      ctx.fillStyle = "#0a1118";
      ctx.fillRect(-size * .2, size * .36, size * .14, size * .18);
      ctx.fillRect(size * .06, size * .36, size * .14, size * .18);
      ctx.restore();
    });

    projectiles.forEach(projectile => {
      const x = projectile.x * cellW;
      const y = projectile.y * cellH;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(now / 90);
      ctx.shadowColor = COLORS.cyan;
      ctx.shadowBlur = 16;
      ctx.fillStyle = COLORS.cyan;
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(8, 0); ctx.lineTo(0, 8); ctx.lineTo(-8, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = COLORS.pink;
      ctx.fillRect(-2, -2, 4, 4);
      ctx.restore();
    });

    ctx.strokeStyle = "rgba(170,220,218,.2)";
    ctx.lineWidth = 1;
    for (let rain = 0; rain < 58; rain++) {
      const x = ((rain * 97 + now * .08) % (viewW + 80)) - 40;
      const y = (rain * 53 + now * .17) % viewH;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 9, y + 19); ctx.stroke();
    }

    ctx.save();
    ctx.translate(cellW * 5.7, cellH * 10.85);
    ctx.rotate(-.035);
    ctx.fillStyle = "rgba(207,230,226,.72)";
    ctx.font = `800 ${Math.max(18, cellH * .48)}px Arial Narrow, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("MV UNICORN STAR", 0, 0);
    ctx.fillStyle = "rgba(207,230,226,.35)";
    ctx.font = `600 ${Math.max(8, cellH * .16)}px IBM Plex Mono`;
    ctx.fillText("LIVERPOOL // IMO 260904", 0, cellH * .28);
    ctx.restore();

    for (const ring of [[2.35, 8.0], [8.7, 3.75]]) {
      ctx.save();
      ctx.translate(ring[0] * cellW, ring[1] * cellH);
      ctx.strokeStyle = "#f2e9d4";
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(0, 0, cellH * .19, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = COLORS.red;
      ctx.lineWidth = 4;
      for (let quarter = 0; quarter < 4; quarter++) {
        ctx.beginPath(); ctx.arc(0, 0, cellH * .19, quarter * Math.PI / 2, quarter * Math.PI / 2 + .42); ctx.stroke();
      }
      ctx.restore();
    }

    ctx.strokeStyle = "rgba(170,220,218,.2)";
    ctx.lineWidth = 1;
    for (let rain = 0; rain < 58; rain++) {
      const x = ((rain * 97 + now * .08) % (viewW + 80)) - 40;
      const y = (rain * 53 + now * .17) % viewH;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 9, y + 19); ctx.stroke();
    }

    if (boardingProgress > 0) {
      const alpha = Math.min(1, boardingProgress * 2);
      const hatchX = 10.5 * cellW;
      const hatchY = .72 * cellH;
      const beam = ctx.createRadialGradient(hatchX, hatchY, 0, hatchX, hatchY, cellW * 1.4);
      beam.addColorStop(0, `rgba(183,255,246,${.58 * alpha})`);
      beam.addColorStop(1, "rgba(57,225,219,0)");
      ctx.fillStyle = beam;
      ctx.fillRect(hatchX - cellW * 1.5, hatchY - cellH * 1.5, cellW * 3, cellH * 3);
      ctx.fillStyle = `rgba(3,12,18,${.9 * alpha})`;
      ctx.beginPath(); ctx.roundRect(cellW * 7.6, cellH * 5.1, cellW * 3.05, cellH * 1.15, 6); ctx.fill();
      ctx.strokeStyle = COLORS.cyan;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#c9fff9";
      ctx.textAlign = "center";
      ctx.font = `800 ${Math.max(16, cellH * .38)}px Arial Narrow, sans-serif`;
      ctx.fillText("BOARDING MV UNICORN STAR", cellW * 9.125, cellH * 5.62);
      ctx.font = `600 ${Math.max(8, cellH * .16)}px IBM Plex Mono`;
      ctx.fillStyle = COLORS.amber;
      ctx.fillText("GANGWAY SECURED // HATCH OPEN", cellW * 9.125, cellH * 5.94);
    }

    ctx.fillStyle = "rgba(3,10,15,.84)";
    ctx.fillRect(viewW - 278, viewH - 36, 268, 26);
    ctx.fillStyle = COLORS.cyan;
    ctx.font = "700 8px IBM Plex Mono";
    ctx.textAlign = "right";
    ctx.fillText("SPACE / F // DANGEROUS-GOODS MAGIC", viewW - 20, viewH - 19);
  }
  function tracePuzzlePiece(x, y, width, height, tab) {
    const radius = Math.min(width, height) * .13;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width * .34, y);
    ctx.arc(x + width * .5, y, radius, Math.PI, 0, tab % 2 === 0);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + height * .34);
    ctx.arc(x + width, y + height * .5, radius, -Math.PI / 2, Math.PI / 2, tab % 2 !== 0);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x + width * .66, y + height);
    ctx.arc(x + width * .5, y + height, radius, 0, Math.PI, tab % 2 === 0);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + height * .66);
    ctx.arc(x, y + height * .5, radius, Math.PI / 2, -Math.PI / 2, tab % 2 !== 0);
    ctx.closePath();
  }


  function drawImagePuzzlePiece(piece, target = false) {
    const x = (target ? piece.targetX : piece.x) * cellW;
    const y = (target ? piece.targetY : piece.y) * cellH;
    const width = piece.width * cellW;
    const height = piece.height * cellH;
    ctx.save();
    tracePuzzlePiece(x, y, width, height, piece.id);
    ctx.clip();
    const image = photoAssets.vessel;
    if (image?.complete && image.naturalWidth) {
      const sourceWidth = image.naturalWidth / PUZZLE_BOARD.columns;
      const sourceHeight = image.naturalHeight / PUZZLE_BOARD.rows;
      ctx.globalAlpha = target ? .15 : 1;
      ctx.drawImage(
        image,
        piece.sourceColumn * sourceWidth,
        piece.sourceRow * sourceHeight,
        sourceWidth,
        sourceHeight,
        x,
        y,
        width,
        height
      );
    } else {
      ctx.fillStyle = target ? "rgba(44,78,86,.35)" : `hsl(${190 + piece.id * 18} 42% 34%)`;
      ctx.fillRect(x, y, width, height);
    }
    if (!target) {
      const shade = ctx.createLinearGradient(x, y, x, y + height);
      shade.addColorStop(0, "rgba(255,255,255,.08)");
      shade.addColorStop(1, "rgba(0,10,15,.28)");
      ctx.fillStyle = shade;
      ctx.fillRect(x, y, width, height);
    }
    ctx.restore();
    tracePuzzlePiece(x, y, width, height, piece.id);
    ctx.strokeStyle = piece.placed ? COLORS.cyan : target ? "rgba(255,181,46,.55)" : draggedPiece?.id === piece.id ? "#fff3ae" : "#c8d8d5";
    ctx.lineWidth = piece.placed ? 3 : 2;
    ctx.shadowColor = piece.placed ? COLORS.cyan : "rgba(0,0,0,.65)";
    ctx.shadowBlur = piece.placed ? 10 : 7;
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (target && !piece.placed) {
      ctx.fillStyle = "rgba(255,215,132,.75)";
      ctx.font = `800 ${Math.max(10, cellH * .2)}px IBM Plex Mono`;
      ctx.textAlign = "center";
      ctx.fillText(String(piece.id + 1), x + width / 2, y + height / 2);
    }
  }

  function drawLoadPuzzle() {
    if (loadComplete) {
      drawSailAway();
      return;
    }
    const backdrop = ctx.createLinearGradient(0, 0, 0, viewH);
    backdrop.addColorStop(0, "#0a2530");
    backdrop.addColorStop(1, "#07151c");
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, viewW, viewH);
    drawPhotoBackdrop("terminal", .34);
    ctx.fillStyle = "rgba(2,10,15,.55)";
    ctx.fillRect(0, 0, viewW, viewH);

    const boardX = PUZZLE_BOARD.x * cellW;
    const boardY = PUZZLE_BOARD.y * cellH;
    const boardWidth = PUZZLE_BOARD.w * cellW;
    const boardHeight = PUZZLE_BOARD.h * cellH;
    ctx.fillStyle = "rgba(3,13,18,.88)";
    ctx.beginPath(); ctx.roundRect(boardX - 16, boardY - 16, boardWidth + 32, boardHeight + 32, 10); ctx.fill();
    ctx.strokeStyle = "rgba(255,181,46,.65)";
    ctx.lineWidth = 2;
    ctx.stroke();

    puzzlePieces.forEach(piece => {
      if (!piece.placed) drawImagePuzzlePiece(piece, true);
    });
    puzzlePieces.filter(piece => piece.placed).forEach(piece => drawImagePuzzlePiece(piece));
    puzzlePieces.filter(piece => !piece.placed && draggedPiece?.id !== piece.id).forEach(piece => drawImagePuzzlePiece(piece));
    if (draggedPiece) drawImagePuzzlePiece(draggedPiece);

    const placed = puzzlePieces.filter(piece => piece.placed).length;
    ctx.fillStyle = "rgba(3,12,17,.9)";
    ctx.beginPath(); ctx.roundRect(cellW * 2.5, cellH * 6.96, cellW * 6, cellH * .58, 5); ctx.fill();
    ctx.fillStyle = COLORS.amber;
    ctx.font = `800 ${Math.max(9, cellH * .18)}px IBM Plex Mono`;
    ctx.textAlign = "center";
    ctx.fillText(`DRAG + DROP TO REBUILD MV UNICORN STAR // ${placed}/6`, cellW * 5.5, cellH * 7.32);
  }

  function drawSailAway() {
    const progress = Math.min(1, sailAway / 4.2);
    const sunset = ctx.createLinearGradient(0, 0, 0, viewH);
    sunset.addColorStop(0, "#352451");
    sunset.addColorStop(.42, "#d46d63");
    sunset.addColorStop(.7, "#f2b35c");
    sunset.addColorStop(.71, "#155063");
    sunset.addColorStop(1, "#062731");
    ctx.fillStyle = sunset;
    ctx.fillRect(0, 0, viewW, viewH);
    drawPhotoBackdrop("ocean", .48);
    ctx.fillStyle = "rgba(255,235,166,.9)";
    ctx.beginPath(); ctx.arc(viewW * .74, viewH * .3, cellH * .7, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = "rgba(184,251,241,.3)";
    ctx.lineWidth = 2;
    for (let wave = 0; wave < 9; wave++) {
      const y = cellH * (9 + wave * .45);
      ctx.beginPath();
      for (let x = -50; x <= viewW + 50; x += 25) {
        const waveY = y + Math.sin((x + performance.now() * .05 + wave * 30) * .04) * 6;
        if (x === -50) ctx.moveTo(x, waveY); else ctx.lineTo(x, waveY);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(80,220,196,.5)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    for (let hump = 0; hump < 4; hump++) {
      const x = cellW * (.5 + hump * .55);
      const y = cellH * (8.25 + Math.sin(performance.now() / 310 + hump) * .08);
      ctx.arc(x, y, cellH * .24, Math.PI, Math.PI * 2);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(80,220,196,.58)";
    ctx.beginPath(); ctx.arc(cellW * 2.55, cellH * 7.92, cellH * .15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cellW * 2.56, cellH * 7.79); ctx.lineTo(cellW * 2.68, cellH * 7.6); ctx.lineTo(cellW * 2.7, cellH * 7.84); ctx.fill();

    const shipX = cellW * (.35 + progress * 3.1);
    const shipY = cellH * 6.25;
    ctx.save();
    ctx.translate(shipX, shipY);
    const wakeColors = ["#ff5148", "#ffad31", "#ffe75a", "#55dc76", "#42dfe5", "#8d72ec"];
    wakeColors.forEach((color, index) => {
      ctx.strokeStyle = color;
      ctx.globalAlpha = .42;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cellW * .9, cellH * (2.05 + index * .055)); ctx.quadraticCurveTo(-cellW * .8, cellH * (2.2 + index * .08), -cellW * 2.1, cellH * (1.75 + index * .12)); ctx.stroke();
    });
    ctx.globalAlpha = 1;

    const upperHull = ctx.createLinearGradient(0, 0, 0, cellH * 2.5);
    upperHull.addColorStop(0, "#314b56"); upperHull.addColorStop(.55, "#142e3a"); upperHull.addColorStop(1, "#071a24");
    ctx.fillStyle = upperHull;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(cellW * 6.45, 0); ctx.quadraticCurveTo(cellW * 7.15, cellH * .52, cellW * 5.98, cellH * 2.4); ctx.lineTo(cellW * .85, cellH * 2.4); ctx.quadraticCurveTo(cellW * .18, cellH * 1.7, 0, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#8c302e";
    ctx.beginPath(); ctx.moveTo(cellW * .52, cellH * 1.65); ctx.lineTo(cellW * 6.37, cellH * 1.65); ctx.quadraticCurveTo(cellW * 6.25, cellH * 2.42, cellW * 5.98, cellH * 2.55); ctx.lineTo(cellW * .9, cellH * 2.55); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#d8d7c8";
    ctx.fillRect(cellW * .35, cellH * 1.58, cellW * 6.05, 4);
    ctx.strokeStyle = "rgba(154,194,195,.35)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const containerColors = ["#a94339", "#b4852f", "#2a7583", "#45665d"];
    for (let cargo = 0; cargo < 7; cargo++) {
      ctx.fillStyle = containerColors[cargo % containerColors.length];
      const x = cellW * (.45 + cargo * .47);
      const y = -cellH * (.38 + (cargo % 2) * .34);
      ctx.fillRect(x, y, cellW * .43, cellH * .34);
      ctx.strokeStyle = "rgba(0,0,0,.32)"; ctx.strokeRect(x, y, cellW * .43, cellH * .34);
    }

    ctx.fillStyle = "#edf0e8";
    ctx.fillRect(cellW * 4.0, -cellH * 1.45, cellW * 1.55, cellH * 1.45);
    ctx.fillStyle = "#183846";
    for (let port = 0; port < 4; port++) ctx.fillRect(cellW * (4.12 + port * .31), -cellH * 1.18, cellW * .18, cellH * .17);
    ctx.fillStyle = "#26363b";
    ctx.fillRect(cellW * 4.48, -cellH * 2.02, cellW * .42, cellH * .58);
    ctx.fillStyle = "#dc9d33";
    ctx.fillRect(cellW * 4.52, -cellH * 1.88, cellW * .34, cellH * .1);
    ctx.strokeStyle = "#cedbd7"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cellW * 5.18, -cellH * 1.45); ctx.lineTo(cellW * 5.18, -cellH * 2.45); ctx.moveTo(cellW * 4.75, -cellH * 2.28); ctx.lineTo(cellW * 5.65, -cellH * 2.28); ctx.stroke();
    ctx.fillStyle = "#c6ddd8";
    ctx.font = `800 ${Math.max(15, cellH * .34)}px Arial Narrow, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("MV UNICORN STAR", cellW * 3.35, cellH * 1.15);
    ctx.font = `600 ${Math.max(7, cellH * .14)}px IBM Plex Mono`;
    ctx.fillText("LIVERPOOL · IMO 260904", cellW * 3.35, cellH * 1.43);

    const unicornX = cellW * 4.62;
    const unicornY = -cellH * 1.62;
    ctx.fillStyle = "#f8ffff";
    ctx.beginPath(); ctx.ellipse(unicornX, unicornY + cellH * .18, cellH * .26, cellH * .34, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(unicornX, unicornY - cellH * .1, cellH * .24, cellH * .21, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COLORS.pink;
    ctx.beginPath(); ctx.moveTo(unicornX, unicornY - cellH * .28); ctx.lineTo(unicornX + cellH * .06, unicornY - cellH * .61); ctx.lineTo(unicornX + cellH * .13, unicornY - cellH * .26); ctx.fill();
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(unicornX - cellH * .2, unicornY + cellH * .12); ctx.quadraticCurveTo(unicornX - cellH * .48, unicornY + cellH * .22, unicornX - cellH * .36, unicornY + cellH * .42); ctx.stroke();
    ctx.fillStyle = "#071116"; ctx.beginPath(); ctx.arc(unicornX - cellH * .075, unicornY - cellH * .1, 2, 0, Math.PI * 2); ctx.arc(unicornX + cellH * .075, unicornY - cellH * .1, 2, 0, Math.PI * 2); ctx.fill();

    const waveAngle = -.8 + Math.sin(performance.now() / 150) * .55;
    ctx.save();
    ctx.translate(unicornX + cellH * .18, unicornY + cellH * .08);
    ctx.rotate(waveAngle);
    ctx.strokeStyle = "#f8ffff";
    ctx.lineWidth = cellH * .12;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(cellH * .44, 0); ctx.stroke();
    ctx.fillStyle = "#36ded6";
    ctx.beginPath(); ctx.arc(cellH * .46, 0, cellH * .085, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const drinkX = unicornX + cellH * 1.18;
    const drinkY = unicornY + cellH * .18;
    const drinkSize = cellH * 1.12;
    const cocktail = ctx.createLinearGradient(0, drinkY - drinkSize, 0, drinkY + drinkSize);
    cocktail.addColorStop(0, "#fff49c"); cocktail.addColorStop(.55, "#f3d34f"); cocktail.addColorStop(1, "#d79b2f");
    ctx.fillStyle = cocktail;
    ctx.beginPath(); ctx.moveTo(drinkX - drinkSize * .62, drinkY - drinkSize * .62); ctx.lineTo(drinkX + drinkSize * .62, drinkY - drinkSize * .62); ctx.lineTo(drinkX + drinkSize * .34, drinkY + drinkSize * .72); ctx.lineTo(drinkX - drinkSize * .34, drinkY + drinkSize * .72); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(drinkX, drinkY + drinkSize * .72); ctx.lineTo(drinkX, drinkY + drinkSize * 1.08); ctx.moveTo(drinkX - drinkSize * .44, drinkY + drinkSize * 1.08); ctx.lineTo(drinkX + drinkSize * .44, drinkY + drinkSize * 1.08); ctx.stroke();
    ctx.strokeStyle = "#ef78b7"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(drinkX + drinkSize * .18, drinkY - drinkSize * .58); ctx.lineTo(drinkX + drinkSize * .74, drinkY - drinkSize * 1.42); ctx.stroke();
    ctx.fillStyle = "#ef78b7";
    ctx.beginPath(); ctx.moveTo(drinkX + drinkSize * .26, drinkY - drinkSize * 1.16); ctx.quadraticCurveTo(drinkX + drinkSize * .78, drinkY - drinkSize * 1.65, drinkX + drinkSize * 1.24, drinkY - drinkSize * 1.12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e6aa35"; ctx.beginPath(); ctx.arc(drinkX - drinkSize * .48, drinkY - drinkSize * .68, drinkSize * .27, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4a9d49"; ctx.beginPath(); ctx.moveTo(drinkX - drinkSize * .5, drinkY - drinkSize * .88); ctx.lineTo(drinkX - drinkSize * .75, drinkY - drinkSize * 1.28); ctx.lineTo(drinkX - drinkSize * .34, drinkY - drinkSize * .94); ctx.fill();
    ctx.restore();

    ctx.fillStyle = "rgba(5,12,18,.82)";
    ctx.beginPath(); ctx.roundRect(cellW * 2.6, cellH * 2.2, cellW * 5.8, cellH * 1.45, 8); ctx.fill();
    ctx.fillStyle = "#fff3ca";
    ctx.font = `900 ${Math.max(24, cellH * .55)}px Arial Narrow, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("LOAD COMPLETE", cellW * 5.5, cellH * 2.85);
    ctx.fillStyle = COLORS.amber;
    ctx.font = `700 ${Math.max(10, cellH * .2)}px IBM Plex Mono`;
    ctx.fillText("PINACOLADA SERVED // BON VOYAGE", cellW * 5.5, cellH * 3.25);
  }

  function drawSafeStripe(row, color, label) {
    const y = row * cellH;
    ctx.fillStyle = color;
    ctx.fillRect(0, y, viewW, 2);
    ctx.globalAlpha = .34;
    ctx.fillStyle = color;
    for (let x = -cellH; x < viewW; x += cellH * 1.2) {
      ctx.beginPath(); ctx.moveTo(x, y + cellH); ctx.lineTo(x + cellH * .35, y + cellH); ctx.lineTo(x + cellH * .8, y + 2); ctx.lineTo(x + cellH * .45, y + 2); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(220,230,225,.45)";
    ctx.font = `${Math.max(6, cellH * .12)}px IBM Plex Mono`;
    ctx.fillText(label, viewW / 2, y + cellH * .68);
  }

  function drawBollard(x, y) {
    ctx.fillStyle = "#091519";
    ctx.fillRect(x - 5, y, 10, cellH * .28);
    ctx.fillStyle = COLORS.amber;
    ctx.fillRect(x - 7, y, 14, 3);
  }

  function drawVehicles() {
    vehicles.forEach(v => {
      const x = v.x * cellW;
      const y = v.row * cellH;
      const w = v.length * cellW;
      const h = cellH;
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, .55)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 5;
      if (v.dir < 0) { ctx.translate(x + w, 0); ctx.scale(-1, 1); }
      else ctx.translate(x, 0);
      drawVehicle(v, w, y, h);
      ctx.restore();
    });
  }

  function drawVehicle(v, w, y, h) {
    const top = y + h * .14;
    const bodyH = h * .65;
    const wheelY = top + bodyH * .86;
    ctx.fillStyle = "rgba(0,0,0,.38)";
    ctx.beginPath(); ctx.ellipse(w * .5, top + bodyH + 5, w * .45, 4, 0, 0, Math.PI * 2); ctx.fill();

    if (v.kind === "straddle") {
      ctx.fillStyle = v.color;
      ctx.beginPath(); ctx.roundRect(0, top, w, bodyH * .17, 3); ctx.fill();
      ctx.fillRect(0, top, w * .11, bodyH * .88);
      ctx.fillRect(w * .89, top, w * .11, bodyH * .88);
      ctx.fillStyle = "#9c4e3e";
      ctx.beginPath(); ctx.roundRect(w * .17, top + bodyH * .28, w * .66, bodyH * .48, 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.3)";
      for (let rib = .25; rib < .8; rib += .12) { ctx.beginPath(); ctx.moveTo(w * rib, top + bodyH * .3); ctx.lineTo(w * rib, top + bodyH * .74); ctx.stroke(); }
      ctx.fillStyle = "#17333b";
      ctx.beginPath(); ctx.roundRect(w * .69, top + bodyH * .02, w * .16, bodyH * .32, 2); ctx.fill();
    } else if (v.kind === "boxTruck") {
      ctx.fillStyle = v.color;
      ctx.beginPath(); ctx.roundRect(0, top + bodyH * .05, w * .66, bodyH * .7, 3); ctx.fill();
      ctx.fillStyle = "rgba(41,87,94,.18)";
      ctx.fillRect(w * .06, top + bodyH * .16, w * .48, 2);
      ctx.fillStyle = "#e9f0ed";
      ctx.beginPath(); ctx.roundRect(w * .64, top + bodyH * .27, w * .34, bodyH * .52, 3); ctx.fill();
      ctx.fillStyle = "#183940";
      ctx.beginPath(); ctx.roundRect(w * .76, top + bodyH * .32, w * .16, bodyH * .2, 2); ctx.fill();
    } else if (v.kind === "reachStacker") {
      ctx.fillStyle = v.color;
      ctx.beginPath(); ctx.roundRect(w * .08, top + bodyH * .48, w * .62, bodyH * .34, 4); ctx.fill();
      ctx.fillStyle = "#17383f";
      ctx.beginPath(); ctx.roundRect(w * .19, top + bodyH * .14, w * .25, bodyH * .42, 3); ctx.fill();
      ctx.strokeStyle = "#db7a3e";
      ctx.lineWidth = Math.max(4, h * .11);
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(w * .46, top + bodyH * .47); ctx.lineTo(w * .9, top + bodyH * .08); ctx.stroke();
      ctx.strokeStyle = "#a9bdba";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(w * .84, top + bodyH * .08); ctx.lineTo(w, top + bodyH * .08); ctx.stroke();
    } else if (v.kind === "forklift") {
      ctx.fillStyle = v.color;
      ctx.beginPath(); ctx.roundRect(w * .06, top + bodyH * .45, w * .61, bodyH * .4, 3); ctx.fill();
      ctx.strokeStyle = "#d9e7e3";
      ctx.lineWidth = 2;
      ctx.strokeRect(w * .23, top + bodyH * .04, w * .34, bodyH * .52);
      ctx.fillStyle = "#17343b";
      ctx.fillRect(w * .29, top + bodyH * .13, w * .22, bodyH * .29);
      ctx.strokeStyle = "#aab9b7";
      ctx.beginPath(); ctx.moveTo(w * .74, top + bodyH * .06); ctx.lineTo(w * .74, top + bodyH * .76); ctx.lineTo(w, top + bodyH * .76); ctx.stroke();
    } else if (v.kind === "shunt") {
      ctx.fillStyle = "#25383c";
      ctx.fillRect(w * .08, top + bodyH * .62, w * .84, bodyH * .16);
      ctx.fillStyle = v.color;
      ctx.beginPath(); ctx.roundRect(w * .48, top + bodyH * .22, w * .45, bodyH * .58, 4); ctx.fill();
      ctx.fillStyle = "#18373f";
      ctx.beginPath(); ctx.roundRect(w * .63, top + bodyH * .27, w * .21, bodyH * .23, 2); ctx.fill();
      ctx.fillStyle = "#aebdb9";
      ctx.beginPath(); ctx.ellipse(w * .26, top + bodyH * .61, w * .12, bodyH * .1, 0, 0, Math.PI * 2); ctx.fill();
    } else if (v.kind === "containerLorry") {
      ctx.fillStyle = "#263538";
      ctx.fillRect(w * .03, top + bodyH * .68, w * .76, bodyH * .1);
      ctx.fillStyle = v.color;
      ctx.beginPath(); ctx.roundRect(w * .03, top, w * .64, bodyH * .68, 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.3)";
      for (let rib = .12; rib < .65; rib += .1) { ctx.beginPath(); ctx.moveTo(w * rib, top + 2); ctx.lineTo(w * rib, top + bodyH * .66); ctx.stroke(); }
      ctx.fillStyle = "#e4ece9";
      ctx.beginPath(); ctx.roundRect(w * .72, top + bodyH * .26, w * .26, bodyH * .54, 3); ctx.fill();
      ctx.fillStyle = "#183a41";
      ctx.fillRect(w * .79, top + bodyH * .31, w * .13, bodyH * .19);
    } else if (v.kind === "tankerLorry") {
      ctx.fillStyle = "#27373a";
      ctx.fillRect(w * .03, top + bodyH * .68, w * .78, bodyH * .1);
      ctx.fillStyle = v.color;
      ctx.beginPath(); ctx.roundRect(w * .04, top + bodyH * .08, w * .65, bodyH * .57, bodyH * .28); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.2)";
      ctx.beginPath(); ctx.roundRect(w * .1, top + bodyH * .14, w * .48, bodyH * .08, 3); ctx.fill();
      ctx.fillStyle = "#e1e9e6";
      ctx.beginPath(); ctx.roundRect(w * .73, top + bodyH * .26, w * .25, bodyH * .54, 3); ctx.fill();
      ctx.fillStyle = "#173a40";
      ctx.fillRect(w * .8, top + bodyH * .31, w * .12, bodyH * .19);
    } else {
      ctx.fillStyle = v.color;
      ctx.beginPath(); ctx.roundRect(w * .05, top + bodyH * .35, w * .9, bodyH * .48, 5); ctx.fill();
      ctx.fillStyle = "#17373e";
      ctx.beginPath(); ctx.roundRect(w * .55, top + bodyH * .16, w * .27, bodyH * .35, 3); ctx.fill();
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(w * .1, top + bodyH * .54, w * .2, 3);
    }

    ctx.fillStyle = "#050d10";
    const radius = Math.max(3, h * .085);
    ctx.beginPath();
    ctx.arc(w * .19, wheelY, radius, 0, Math.PI * 2);
    ctx.arc(w * .8, wheelY, radius, 0, Math.PI * 2);
    if (v.kind.includes("Lorry")) ctx.arc(w * .59, wheelY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#71888b";
    ctx.beginPath(); ctx.arc(w * .19, wheelY, radius * .35, 0, Math.PI * 2); ctx.arc(w * .8, wheelY, radius * .35, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.shadowColor = "#eafff8";
    ctx.shadowBlur = 7;
    ctx.fillStyle = "#eafff8";
    ctx.fillRect(w - 3, top + bodyH * .5, 3, 5);
    ctx.restore();
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(0, top + bodyH * .5, 3, 5);
  }

  function drawPlayer() {
    if (flash > 0 && Math.floor(flash * 18) % 2 === 0) return;
    const now = performance.now();
    const t = 1 - player.moving;
    const col = isVesselShift() ? platformPlayer.x - .5 : player.col + (player.targetCol - player.col) * t;
    const row = isVesselShift() ? platformPlayer.y - .55 : player.row + (player.targetRow - player.row) * t;
    const cx = (col + .5) * cellW;
    const cy = (row + .55) * cellH;
    const s = Math.min(cellW, cellH) * 1.18;
    const active = isVesselShift() ? Math.abs(platformPlayer.vx) > .1 || !platformPlayer.grounded : player.moving > 0;
    const gait = active ? Math.sin(now / 72) : Math.sin(now / 310) * .25;
    const breathe = 1 + Math.sin(now / 390) * .025;
    const boardScale = boardingProgress > 0 ? Math.max(.12, 1 - boardingProgress / 2) : 1;
    const blink = now % 2750 > 2620;
    const bounce = isVesselShift() ? (platformPlayer.grounded ? Math.abs(gait) * s * .025 : 0)
      : player.moving > 0 ? Math.sin(t * Math.PI) * s * .2 : Math.sin(now / 250) * 1.8;

    ctx.save();
    ctx.globalAlpha = boardingProgress > 0 ? Math.max(.12, 1 - boardingProgress / 1.9) : 1;
    ctx.translate(cx, cy - bounce);
    if (player.facing === "left") ctx.rotate(-Math.PI / 2);
    if (player.facing === "right") ctx.rotate(Math.PI / 2);
    if (player.facing === "down") ctx.rotate(Math.PI);
    ctx.rotate(Math.sin(now / 230) * .025);
    ctx.scale(breathe * boardScale, (2 - breathe) * boardScale);

    ctx.fillStyle = "rgba(0,0,0,.42)";
    ctx.beginPath(); ctx.ellipse(0, s * .33 + bounce, s * .36, s * .1, 0, 0, Math.PI * 2); ctx.fill();

    if (active) {
      for (let sparkle = 0; sparkle < 4; sparkle++) {
        const phase = (now / 280 + sparkle * 1.7) % 4;
        const sx = -s * (.35 + phase * .16);
        const sy = s * (.18 - sparkle * .11 + Math.sin(now / 150 + sparkle) * .08);
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = sparkle % 2 ? COLORS.pink : COLORS.cyan;
        ctx.fillRect(-2, -2, 4, 4); ctx.restore();
      }
    }

    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(2, s * .058);
    const tailWave = Math.sin(now / 115) * s * .11;
    ctx.strokeStyle = "#42e2dc";
    ctx.beginPath(); ctx.moveTo(-s * .18, -s * .01); ctx.bezierCurveTo(-s * .5, s * .02, -s * .5 + tailWave, s * .24, -s * .36, s * .36); ctx.stroke();
    ctx.strokeStyle = "#9b7ff0";
    ctx.beginPath(); ctx.moveTo(-s * .19, s * .05); ctx.bezierCurveTo(-s * .47, s * .12, -s * .42 - tailWave * .4, s * .31, -s * .28, s * .4); ctx.stroke();
    ctx.strokeStyle = "#ef78b7";
    ctx.beginPath(); ctx.moveTo(-s * .17, s * .11); ctx.bezierCurveTo(-s * .4, s * .2, -s * .34 + tailWave * .25, s * .38, -s * .2, s * .42); ctx.stroke();

    const body = ctx.createLinearGradient(-s * .25, -s * .35, s * .25, s * .35);
    body.addColorStop(0, "#ffffff");
    body.addColorStop(.55, "#eaffff");
    body.addColorStop(1, "#c4c7f8");
    ctx.fillStyle = body;
    ctx.strokeStyle = "rgba(255,255,255,.82)";
    ctx.lineWidth = Math.max(1, s * .025);
    ctx.beginPath(); ctx.ellipse(0, s * .07, s * .3, s * .34, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -s * .24, s * .23, s * .21, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    ctx.strokeStyle = "#b36fe7";
    ctx.lineWidth = Math.max(2, s * .065);
    ctx.beginPath(); ctx.moveTo(-s * .2, -s * .22); ctx.quadraticCurveTo(-s * .32 - gait * s * .025, -s * .04, -s * .23, s * .14); ctx.stroke();
    ctx.strokeStyle = "#49ddd5";
    ctx.beginPath(); ctx.moveTo(-s * .12, -s * .34); ctx.quadraticCurveTo(-s * .27 + gait * s * .02, -s * .18, -s * .2, -s * .01); ctx.stroke();
    ctx.strokeStyle = "#ef78b7";
    ctx.beginPath(); ctx.moveTo(-s * .04, -s * .39); ctx.quadraticCurveTo(-s * .15, -s * .28, -s * .12, -s * .14); ctx.stroke();

    ctx.save();
    ctx.translate(-s * .2, -s * .36); ctx.rotate(-.16 + gait * .04);
    ctx.fillStyle = "#ef8fc1";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-s * .11, -s * .2); ctx.lineTo(s * .11, -s * .06); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(s * .2, -s * .36); ctx.rotate(.16 - gait * .04);
    ctx.fillStyle = "#ef8fc1";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * .11, -s * .2); ctx.lineTo(-s * .11, -s * .06); ctx.closePath(); ctx.fill();
    ctx.restore();

    const horn = ctx.createLinearGradient(0, -s * .78, s * .11, -s * .35);
    horn.addColorStop(0, "#fff7a8"); horn.addColorStop(.48, "#ffb52e"); horn.addColorStop(1, "#ff6c9f");
    ctx.fillStyle = horn;
    ctx.shadowColor = "rgba(255,181,46,.8)";
    ctx.shadowBlur = 7 + Math.sin(now / 120) * 3;
    ctx.beginPath(); ctx.moveTo(-s * .02, -s * .39); ctx.lineTo(s * .05, -s * .79); ctx.lineTo(s * .12, -s * .38); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "#071116";
    ctx.lineWidth = blink || mood === "laugh" ? s * .025 : s * .01;
    ctx.beginPath();
    if (blink || mood === "laugh") {
      ctx.moveTo(-s * .11, -s * .26); ctx.quadraticCurveTo(-s * .078, -s * .29, -s * .045, -s * .26);
      ctx.moveTo(s * .045, -s * .26); ctx.quadraticCurveTo(s * .078, -s * .29, s * .11, -s * .26);
      ctx.stroke();
    } else {
      ctx.fillStyle = "#071116";
      ctx.beginPath(); ctx.arc(-s * .078, -s * .26, s * .033, 0, Math.PI * 2); ctx.arc(s * .078, -s * .26, s * .033, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#5cf1ea";
      ctx.beginPath(); ctx.arc(-s * .068, -s * .271, s * .011, 0, Math.PI * 2); ctx.arc(s * .088, -s * .271, s * .011, 0, Math.PI * 2); ctx.fill();
    }
    if (mood === "angry") {
      ctx.strokeStyle = "#79282e";
      ctx.lineWidth = s * .035;
      ctx.beginPath(); ctx.moveTo(-s * .15, -s * .34); ctx.lineTo(-s * .035, -s * .29); ctx.moveTo(s * .15, -s * .34); ctx.lineTo(s * .035, -s * .29); ctx.stroke();
    }
    if (mood === "cry") {
      ctx.fillStyle = "#42dfe5";
      ctx.beginPath(); ctx.ellipse(-s * .085, -s * .18, s * .022, s * .075, 0, 0, Math.PI * 2); ctx.ellipse(s * .085, -s * .18, s * .022, s * .075, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#e382ad";
    ctx.beginPath(); ctx.ellipse(0, -s * .17, s * .045, s * .025, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#8b4a67";
    ctx.lineWidth = 1.5;
    if (mood === "laugh") {
      ctx.fillStyle = "#9d4267";
      ctx.beginPath(); ctx.ellipse(0, -s * .105, s * .07, s * .065, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillRect(-s * .045, -s * .145, s * .09, s * .025);
    } else {
      ctx.beginPath();
      if (mood === "cry" || mood === "angry") ctx.arc(0, -s * .075, s * .06, Math.PI + .15, Math.PI * 2 - .15);
      else ctx.arc(0, -s * .13, s * .06, .15, Math.PI - .15);
      ctx.stroke();
    }

    ctx.fillStyle = "#36ded6";
    ctx.shadowColor = "rgba(57,225,219,.65)";
    ctx.shadowBlur = 6;
    const leftStep = gait * s * .075;
    const rightStep = -gait * s * .075;
    ctx.beginPath(); ctx.roundRect(-s * .23, s * .27 + leftStep, s * .13, s * .11, 3); ctx.roundRect(s * .1, s * .27 + rightStep, s * .13, s * .11, 3); ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x * cellW - p.size / 2, p.y * cellH - p.size / 2, p.size, p.size);
    });
    ctx.globalAlpha = 1;
  }

  function drawTelemetry() {
    const pad = 10;
    const barW = Math.min(120, viewW * .2);
    const maxTime = isMazeShift() ? Math.max(44, 68 - Math.floor(level / 4) * 3)
      : isVesselShift() ? Math.max(52, 76 - Math.floor(level / 4) * 3)
        : isLoadShift() ? Math.max(60, 92 - Math.floor(level / 4) * 3)
          : Math.max(24, 46 - Math.floor(level / 4) * 2);
    const ratio = timeLeft / maxTime;
    ctx.fillStyle = "rgba(5,14,17,.74)";
    ctx.fillRect(viewW - barW - pad * 2, pad, barW + pad, 16);
    ctx.fillStyle = ratio < .25 ? COLORS.red : COLORS.amber;
    ctx.fillRect(viewW - barW - pad * 1.5, pad + 10, barW * ratio, 2);
    ctx.fillStyle = "#9aadb0";
    ctx.font = "7px IBM Plex Mono";
    ctx.textAlign = "right";
    const label = isVesselShift() ? "INSPECTION" : isMazeShift() ? "SHIFT" : isLoadShift() ? "LOAD WINDOW" : "TIDE";
    ctx.fillText(`${label} ${Math.ceil(timeLeft)}s`, viewW - pad, pad + 8);
  }

  function ensureAudio() {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume();
    canvas.dataset.audio = audioContext.state;
    return audioContext;
  }

  function playNoise(duration = .08, volume = .012, frequency = 900, delay = 0) {
    if (!soundOn) return;
    try {
      const audio = ensureAudio();
      if (!noiseBuffer) {
        noiseBuffer = audio.createBuffer(1, Math.floor(audio.sampleRate * .5), audio.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
      }
      const start = audio.currentTime + delay;
      const source = audio.createBufferSource();
      const filter = audio.createBiquadFilter();
      const gain = audio.createGain();
      source.buffer = noiseBuffer;
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(frequency, start);
      filter.Q.setValueAtTime(.8, start);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
      source.connect(filter).connect(gain).connect(audio.destination);
      source.start(start);
      source.stop(start + duration);
    } catch (_) { /* Audio remains optional when blocked by the browser. */ }
  }

  function updateMusic(dt) {
    if (!soundOn || !running || paused) return;
    musicClock -= dt;
    if (musicClock > 0) return;
    const track = musicTracks[shiftType()];
    const step = musicStep % track.lead.length;
    playTone(track.bass[step], track.tempo * 1.7, "triangle", .011);
    if (step % 2 === 0) playTone(track.lead[step], track.tempo * .72, isVesselShift() ? "sine" : "square", .007, .025);
    if (step % 4 === 0) playNoise(.045, .006, isLoadShift() ? 1400 : 520);
    if (isVesselShift() && step === 0) playTone(55, 1.2, "sine", .012, .04);
    musicStep++;
    canvas.dataset.musicStep = String(musicStep);
    musicClock += track.tempo;
  }

  function playTone(frequency, duration, type = "square", volume = .02, delay = 0) {
    if (!soundOn) return;
    try {
      const audio = ensureAudio();
      const start = audio.currentTime + delay;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
    } catch (_) { /* Audio is optional. */ }
  }

  function loop(time) {
    const dt = Math.min((time - lastTime) / 1000 || 0, .05);
    lastTime = time;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function pointerToWorld(event) {
    const rect = canvas.getBoundingClientRect();
    const screenX = (event.clientX - rect.left) * viewW / rect.width;
    const screenY = (event.clientY - rect.top) * viewH / rect.height;
    return {
      x: (screenX - viewW / 2) / camera.zoom / cellW + camera.x,
      y: (screenY - viewH / 2) / camera.zoom / cellH + camera.y
    };
  }

  function handlePuzzlePointerDown(event) {
    if (!running || paused || !isLoadShift() || loadComplete) return;
    const point = pointerToWorld(event);
    for (let index = puzzlePieces.length - 1; index >= 0; index--) {
      const piece = puzzlePieces[index];
      if (piece.placed) continue;
      if (point.x >= piece.x && point.x <= piece.x + piece.width && point.y >= piece.y && point.y <= piece.y + piece.height) {
        draggedPiece = piece;
        piece.dragOffsetX = point.x - piece.x;
        piece.dragOffsetY = point.y - piece.y;
        canvas.setPointerCapture?.(event.pointerId);
        canvas.style.cursor = "grabbing";
        loadMessage = `MOVING PIECE ${piece.id + 1} // DROP ON MATCHING OUTLINE`;
        updateHud();
        event.preventDefault();
        return;
      }
    }
  }

  function handlePuzzlePointerMove(event) {
    if (!draggedPiece || !isLoadShift()) return;
    const point = pointerToWorld(event);
    draggedPiece.x = Math.max(0, Math.min(COLS - draggedPiece.width, point.x - draggedPiece.dragOffsetX));
    draggedPiece.y = Math.max(0, Math.min(ROWS - draggedPiece.height, point.y - draggedPiece.dragOffsetY));
    event.preventDefault();
  }

  function handlePuzzlePointerUp(event) {
    if (!draggedPiece || !isLoadShift()) return;
    const piece = draggedPiece;
    const correct = Math.abs(piece.x - piece.targetX) < .42 && Math.abs(piece.y - piece.targetY) < .42;
    if (correct) {
      piece.x = piece.targetX;
      piece.y = piece.targetY;
      piece.placed = true;
      score += 400;
      loadMessage = `PIECE ${piece.id + 1} LOCKED INTO PLACE`;
      setMood("laugh", .9);
      playTone(620, .06, "square", .03);
      playTone(820, .1, "square", .025, .06);
    } else {
      piece.x = piece.homeX;
      piece.y = piece.homeY;
      loadMessage = `PIECE ${piece.id + 1} RETURNED // MATCH THE PHOTO EDGES`;
      setMood("angry", .8);
      playTone(105, .09, "sawtooth", .025);
    }
    draggedPiece = null;
    canvas.releasePointerCapture?.(event.pointerId);
    canvas.style.cursor = "grab";
    if (puzzlePieces.every(item => item.placed)) {
      score += 2200;
      loadComplete = true;
      sailAway = .001;
      loadMessage = "VESSEL IMAGE COMPLETE // PINACOLADA SERVED";
      setMood("laugh", 10);
      playTone(523.25, .12, "triangle", .035);
      playTone(659.25, .16, "triangle", .03, .1);
      playTone(783.99, .24, "triangle", .028, .22);
    }
    updateHud();
    event.preventDefault();
  }

  function handleKey(event) {
    const key = event.key.toLowerCase();
    const directions = { arrowup: "up", w: "up", arrowdown: "down", s: "down", arrowleft: "left", a: "left", arrowright: "right", d: "right" };
    if (directions[key]) {
      event.preventDefault();
      if (!event.repeat || directions[key] === "left" || directions[key] === "right") move(directions[key]);
    }
    if (key === " " || key === "f") { event.preventDefault(); fireDangerousGoods(); }
    if (key === "p" || key === "escape") { event.preventDefault(); togglePause(); }
    if (key === "enter" && (!running || gameOver)) { event.preventDefault(); startGame(); }
    else if (key === "enter" && paused) { event.preventDefault(); togglePause(false); }
  }

  function handleKeyUp(event) {
    if (!isVesselShift()) return;
    const key = event.key.toLowerCase();
    if (key === "arrowleft" || key === "a") platformControl("left", false);
    if (key === "arrowright" || key === "d") platformControl("right", false);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", handleKey);
  document.addEventListener("visibilitychange", () => { if (document.hidden && running && !paused) togglePause(true); });
  window.addEventListener("keyup", handleKeyUp);
  canvas.addEventListener("pointerdown", handlePuzzlePointerDown);
  canvas.addEventListener("pointermove", handlePuzzlePointerMove);
  canvas.addEventListener("pointerup", handlePuzzlePointerUp);
  canvas.addEventListener("pointercancel", handlePuzzlePointerUp);
  document.getElementById("startButton").addEventListener("click", startGame);
  levelSelector.addEventListener("change", startGame);
  document.getElementById("pauseButton").addEventListener("click", () => togglePause());
  document.getElementById("resumeButton").addEventListener("click", () => gameOver ? startGame() : togglePause(false));
  soundButton.addEventListener("click", () => {
    soundOn = !soundOn;
    soundButton.classList.toggle("muted", !soundOn);
    soundButton.setAttribute("aria-label", soundOn ? "Mute music and sound" : "Enable music and sound");
    if (soundOn) ensureAudio();
    else if (audioContext?.state === "running") audioContext.suspend();
  });
  document.querySelectorAll("[data-dir]").forEach(button => {
    button.addEventListener("pointerdown", event => { event.preventDefault(); move(button.dataset.dir); });
    button.addEventListener("pointerup", () => platformControl(button.dataset.dir, false));
    button.addEventListener("pointercancel", () => platformControl(button.dataset.dir, false));
  });
  document.querySelector("[data-action='fire']").addEventListener("pointerdown", event => { event.preventDefault(); fireDangerousGoods(); });
  bestEl.textContent = String(best).padStart(6, "0");
  resize();
  setupLevel();
  requestAnimationFrame(loop);
})();
