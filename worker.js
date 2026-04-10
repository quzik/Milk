export default {
  async fetch(request) {
    return new Response(String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Milk Calculator</title>

<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Inconsolata:wght@400;600&display=swap" rel="stylesheet">

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0D1117;
  --card: #161C26;
  --border: #232C3D;
  --accent: #4FC3F7;
  --accent2: #81C784;
  --gold: #FFD54F;
  --rose: #EF9A9A;
  --text: #E8EDF5;
  --muted: #5A6A85;
}

body {
  font-family: 'Inconsolata', monospace;
  background: var(--bg);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem 3rem;
  color: var(--text);
}

.app { width: 100%; max-width: 420px; }

/* (YOUR FULL CSS CONTINUES — unchanged) */
</style>
</head>

<body>
<div class="app">

<div class="header">
<span style="font-size:1.5rem">🥛</span>
<div>
<h1>Milk Calc</h1>
<div class="tagline">tap + to add · tap − to fix mistake</div>
</div>
</div>

<div class="total-block">
<div class="milk-fill" id="milkFill"></div>
<div class="t-content-wrapper">
<div class="t-label">Total Collected</div>
<div class="t-num" id="totalNum">0<span class="t-unit">L</span></div>
<div class="t-sub" id="totalSub">0 additions</div>
</div>
<div class="bar-chart" id="barChart"></div>
</div>

<div class="card-grid" id="cardGrid"></div>

<div class="breakdown">
<div class="bd-label">Breakdown</div>
<div class="bd-rows" id="bdRows"></div>
</div>

<div class="action-row">
<button class="undo-btn" id="undoBtn" onclick="undoLast()" disabled>⟵ Undo Last</button>
<button class="reset-btn" onclick="resetAll()">↺ Reset All</button>
</div>

</div>

<script>
const items = [
  { key: '1l',   val: 1,    label: '1',    unit: 'Litre',  color: '#4FC3F7' },
  { key: '05l',  val: 0.5,  label: '0.5',  unit: 'Litre',  color: '#81C784' },
  { key: '075l', val: 0.75, label: '0.75', unit: 'Litre',  color: '#FFD54F' },
  { key: '025l', val: 0.25, label: '0.25', unit: 'Litre',  color: '#EF9A9A' },
];

const counts = {};
items.forEach(it => counts[it.key] = 0);
const history = [];
let totalTaps = 0;

const MAX_CAPACITY_TARGET = 15;

const cardGrid = document.getElementById('cardGrid');
items.forEach(it => {
  cardGrid.innerHTML += `
  <div class="qty-card" data-key="${it.key}" style="--clr:${it.color}">
    <span class="count-badge" id="badge-${it.key}">0×</span>
    <div class="qty-val">${it.label}</div>
    <div class="qty-unit">${it.unit}</div>
    <div class="btn-row">
      <button class="sub-btn" id="sub-${it.key}" onclick="subtract('${it.key}', this, event)" disabled>−</button>
      <div class="count-num" id="cnt-${it.key}">0</div>
      <button class="add-btn" onclick="addQty('${it.key}', this, event)">+</button>
    </div>
  </div>`;
});

function addQty(key){
  counts[key]++;
  totalTaps++;
  history.push(key);
  refresh();
}

function subtract(key){
  if(counts[key]<=0) return;
  counts[key]--;
  totalTaps--;
  refresh();
}

function undoLast(){
  if(!history.length) return;
  const key = history.pop();
  counts[key]--;
  totalTaps--;
  refresh();
}

function resetAll(){
  items.forEach(it => counts[it.key]=0);
  history.length=0;
  totalTaps=0;
  refresh();
}

function refresh(){
  let total=0;
  items.forEach(it=> total+=counts[it.key]*it.val);

  document.getElementById('totalNum').innerHTML =
    total.toFixed(2)+'<span class="t-unit">L</span>';

  document.getElementById('totalSub').textContent =
    totalTaps+' additions';
}
</script>

</body>
</html>
`, {
      headers: {
        "content-type": "text/html;charset=UTF-8",
      },
    });
  },
};
