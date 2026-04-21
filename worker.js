const html = `
<!DOCTYPE html>
<html lang="ta">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Milk Dashboard Pro</title>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body { font-family: 'Segoe UI', sans-serif; margin:0; background:#eef2f3; }
header { background:#2c3e50; color:#fff; padding:15px; text-align:center; }

.container { padding:15px; }

.card {
  background:white;
  padding:15px;
  border-radius:10px;
  margin-bottom:15px;
  box-shadow:0 5px 15px rgba(0,0,0,0.1);
}

input, select {
  padding:8px;
  margin:5px;
}

button {
  padding:8px 12px;
  background:#27ae60;
  color:white;
  border:none;
  border-radius:6px;
}

.table-wrapper {
  overflow-x:auto;
}

table {
  width:100%;
  border-collapse:collapse;
  font-size:12px;
}

th, td {
  border:1px solid #ccc;
  padding:5px;
  text-align:center;
}

th { background:#34495e; color:white; }

.sunday { background:#ffd6d6; }

.total { font-weight:bold; background:#f1f2f6; }
</style>
</head>

<body>

<header>🥛 Milk Management Pro</header>

<div class="container">

<!-- LOGIN -->
<div class="card">
<h3>Login</h3>
<input id="user" placeholder="Username">
<input id="pass" type="password" placeholder="Password">
<button onclick="login()">Login</button>
</div>

<!-- CONTROLS -->
<div class="card">
<select id="year"></select>
<select id="month" onchange="generateTable()">
${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
.map((m,i)=>`<option value="${i}">${m}</option>`).join("")}
</select>

<button onclick="save()">💾 Save</button>
</div>

<!-- ADD CUSTOMER -->
<div class="card">
<input id="custName" placeholder="Customer name">
<button onclick="addCustomer()">Add Customer</button>
</div>

<!-- TABLE -->
<div class="card table-wrapper">
<table>
<thead id="thead"></thead>
<tbody id="tbody"></tbody>
</table>
</div>

<!-- ANALYTICS -->
<div class="card">
<h3>Analytics</h3>
<canvas id="chart"></canvas>
</div>

</div>

<script>
let customers = [];

// YEAR
for(let y=2024;y<=2035;y++){
  year.innerHTML += \`<option>\${y}</option>\`;
}

// LOGIN
async function login(){
  await fetch('/login',{
    method:'POST',
    body:JSON.stringify({
      username:user.value,
      password:pass.value
    })
  });
  loadCustomers();
  loadChart();
}

// LOAD CUSTOMERS
async function loadCustomers(){
  const res = await fetch('/customers');
  customers = await res.json();
  generateTable();
}

// GENERATE TABLE
function generateTable(){
  const y = year.value;
  const m = +month.value;
  const days = new Date(y, m+1, 0).getDate();

  let head = "<tr><th>Name</th><th>Qty</th><th>Rate</th>";

  for(let d=1; d<=days; d++){
    let dt = new Date(y,m,d);
    let s = dt.getDay()==0 ? 'class="sunday"' : '';
    head += \`<th \${s}>\${d}</th>\`;
  }

  head += "<th>Total</th></tr>";
  thead.innerHTML = head;

  tbody.innerHTML = customers.map(c => {
    return \`
    <tr data-id="\${c.id}">
      <td>\${c.name}</td>
      <td><input type="number" value="1" class="qty"></td>
      <td><input type="number" value="50" class="rate"></td>
      \${Array(days).fill(0).map(()=>'<td><input type="checkbox" class="day"></td>').join("")}
      <td class="total">0</td>
    </tr>\`;
  }).join("");

  document.querySelectorAll(".day, .qty, .rate").forEach(el=>{
    el.oninput = calc;
  });
}

// CALC
function calc(){
  document.querySelectorAll("#tbody tr").forEach(tr=>{
    const qty = +tr.querySelector(".qty").value || 0;
    const rate = +tr.querySelector(".rate").value || 0;
    const days = [...tr.querySelectorAll(".day")].filter(d=>d.checked).length;

    tr.querySelector(".total").innerText = qty * rate * days;
  });
}

// SAVE
async function save(){
  const monthKey = \`\${year.value}-\${String(+month.value+1).padStart(2,"0")}\`;

  const rows = [...document.querySelectorAll("#tbody tr")].map(tr=>({
    customer_id: tr.dataset.id,
    qty: tr.querySelector(".qty").value,
    rate: tr.querySelector(".rate").value,
    oldBal: 0,
    received: 0,
    days: [...tr.querySelectorAll(".day")].map(d=>d.checked)
  }));

  await fetch('/save',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({month:monthKey, rows})
  });

  alert("Saved");
}

// ADD CUSTOMER
async function addCustomer(){
  await fetch('/customer',{
    method:'POST',
    body:JSON.stringify({name:custName.value})
  });
  loadCustomers();
}

// CHART
async function loadChart(){
  const res = await fetch('/analytics');
  const data = await res.json();

  new Chart(chart,{
    type:'line',
    data:{
      labels:data.map(d=>d.month),
      datasets:[{
        label:"Revenue",
        data:data.map(d=>d.revenue)
      }]
    }
  });
}
</script>

</body>
</html>
`;
