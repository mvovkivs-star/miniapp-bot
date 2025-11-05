// Telegram WebApp init
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand(); // повноекранний режим
}

const SIZE = 5;
let grid = [];
let bombsNum = 5;
let seed = "";
let gameActive = false;
let openedSafe = 0;
let stake = 1.0;
let balance = 100.0; // демо баланс

const gridEl = document.getElementById("grid");
const bombsRange = document.getElementById("bombs");
const bombsValue = document.getElementById("bombsValue");
const stakeInput = document.getElementById("stake");
const statusEl = document.getElementById("status");
const newGameBtn = document.getElementById("newGame");
const cashoutBtn = document.getElementById("cashout");
const balanceEl = document.getElementById("balance");
const seedEl = document.getElementById("seed");
const sendBtn = document.getElementById("sendResult");

// UI bindings
bombsRange.addEventListener("input", () => {
  bombsNum = Number(bombsRange.value);
  bombsValue.textContent = bombsNum;
});
stakeInput.addEventListener("input", () => {
  stake = Math.max(0.1, Number(stakeInput.value || 0.1));
  stakeInput.value = stake.toFixed(1);
});

newGameBtn.addEventListener("click", startNewGame);
cashoutBtn.addEventListener("click", cashout);
sendBtn.addEventListener("click", sendResultToBot);

// Helpers: PRNG with seed for fairness
function makeSeed() {
  // включимо user id та час для унікальності (з Telegram, якщо доступний)
  const uid = tg?.initDataUnsafe?.user?.id || Math.floor(Math.random() * 1e9);
  const now = Date.now();
  return `uid:${uid}|t:${now}|b:${bombsNum}|s:${stake}`;
}
function hash32(str) {
  // простий 32-bit хеш (FNV-like), щоб робити псевдо-випадковість з сидом
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function rng(seedNum) {
  // xorshift32
  let x = seedNum || 2463534242;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17; x >>>= 0;
    x ^= x << 5;  x >>>= 0;
    return (x >>> 0) / 0xFFFFFFFF;
  };
}

// Grid generation
function generateGrid() {
  grid = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => ({ mine: false, open: false, around: 0 }))
  );
  const seedNum = hash32(seed);
  const rand = rng(seedNum);

  // place bombs
  let placed = 0;
  while (placed < bombsNum) {
    const r = Math.floor(rand() * SIZE);
    const c = Math.floor(rand() * SIZE);
    if (!grid[r][c].mine) {
      grid[r][c].mine = true;
      placed++;
    }
  }
  // counts
  const dirs = [-1, 0, 1];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c].mine) continue;
      let cnt = 0;
      dirs.forEach(dr => dirs.forEach(dc => {
        if (dr === 0 && dc === 0) return;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && grid[nr][nc].mine) cnt++;
      }));
      grid[r][c].around = cnt;
    }
  }
}

function renderGrid() {
  gridEl.innerHTML = "";
  gridEl.style.pointerEvents = gameActive ? "auto" : "none";
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.addEventListener("click", onCellClick);
      gridEl.appendChild(cell);
    }
  }
  updateCells();
}

function updateCells(revealAll = false) {
  const cells = gridEl.querySelectorAll(".cell");
  cells.forEach(cell => {
    const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
    const data = grid[r][c];
    cell.classList.remove("open","safe","mine","flag");
    if (data.open || revealAll) {
      cell.classList.add("open");
      if (data.mine) {
        cell.classList.add("mine");
        cell.textContent = "💣";
      } else {
        cell.classList.add("safe");
        cell.textContent = data.around > 0 ? String(data.around) : "";
      }
    } else {
      cell.textContent = "";
    }
  });
}

function startNewGame() {
  if (stake > balance) {
    setStatus("Недостатньо балансу для ставки.");
    return;
  }
  seed = makeSeed();
  seedEl.textContent = seed;
  balance -= stake;
  balanceEl.textContent = balance.toFixed(1);
  openedSafe = 0;
  gameActive = true;
  cashoutBtn.disabled = true;
  setStatus("Гра почалася. Відкривай клітинки! Не натрап на бомбу.");
  generateGrid();
  renderGrid();
}

function onCellClick(e) {
  if (!gameActive) return;
  const r = Number(e.currentTarget.dataset.r);
  const c = Number(e.currentTarget.dataset.c);
  const cell = grid[r][c];
  if (cell.open) return;

  cell.open = true;
  if (cell.mine) {
    gameActive = false;
    setStatus("Бомба! Раунд програно.");
    updateCells(true);
    cashoutBtn.disabled = true;
    return;
  } else {
    openedSafe++;
    updateCells(false);
    cashoutBtn.disabled = false; // можна забрати виграш у будь-який момент після хоча б одного безпечного кроку
    const remainingSafe = SIZE*SIZE - bombsNum;
    if (openedSafe === remainingSafe) {
      // усі безпечні відкриті — автоперемога
      gameActive = false;
      const reward = calcReward(openedSafe);
      balance += reward;
      balanceEl.textContent = balance.toFixed(1);
      setStatus(`Перемога! Виграш: +${reward.toFixed(2)} TON`);
      updateCells(true);
      cashoutBtn.disabled = true;
    }
  }
}

function calcReward(safeOpens) {
  // Простий мультиплікатор з ростом ризику: чим більше бомб — тим вище множник.
  // Базово на крок: stepMult = 1 + bombsNum/(SIZE*SIZE*2)
  const stepMult = 1 + (bombsNum / (SIZE*SIZE*2));
  let mult = 1.0;
  for (let i = 0; i < safeOpens; i++) mult *= stepMult;
  // невелика комісія за чесність/будет майбутня house edge? залишимо 0%
  return stake * (mult - 1); // виграш — надбавка понад ставку
}

function cashout() {
  if (!gameActive || openedSafe === 0) return;
  const reward = calcReward(openedSafe);
  balance += reward;
  balanceEl.textContent = balance.toFixed(1);
  gameActive = false;
  setStatus(`Кеш-аут: +${reward.toFixed(2)} TON. Раунд завершено.`);
  updateCells(true);
  cashoutBtn.disabled = true;
}

function setStatus(text) {
  statusEl.textContent = text;
}

// Send result back to bot
function sendResultToBot() {
  const payload = {
    type: "result",
    seed,
    bombs: bombsNum,
    stake,
    openedSafe,
    balance,
    time: Date.now()
  };
  const data = JSON.stringify(payload);
  if (tg?.sendData) {
    tg.sendData(data);
    setStatus("Результат надіслано у бот.");
  } else {
    setStatus("Не вдалося надіслати дані у бот (tg.sendData недоступний).");
  }
}
