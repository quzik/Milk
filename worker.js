export default {
  async fetch(request) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Milk Calculator 2026</title>

<style>
body {
    font-family: Arial, sans-serif;
    background: #f1f1f1;
    padding: 30px;
    text-align: center;
}

.box {
    background: #ffffff;
    padding: 25px;
    margin: auto;
    width: 340px;
    border-radius: 20px;
    box-shadow: 0 12px 25px rgba(0,0,0,0.15);
}

button {
    width: 140px;
    height: 50px;
    margin: 10px;
    border: none;
    border-radius: 12px;
    background: #ffcc00;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
}

button:hover {
    transform: scale(1.05);
}

.reset {
    background: #ff4444;
    color: white;
}

input {
    width: 80px;
    padding: 8px;
    margin: 10px;
    font-size: 16px;
    border-radius: 8px;
    border: 1px solid #999;
}

select {
    padding: 8px;
    font-size: 16px;
    border-radius: 8px;
    margin-bottom: 10px;
}
</style>
</head>

<body>

<div class="box">

<h2>Milk Calculator (2026)</h2>

<!-- Select Month -->
<select id="month" onchange="updateDays()">
<option value="1">January</option>
<option value="2">February</option>
<option value="3">March</option>
<option value="4">April</option>
<option value="5">May</option>
<option value="6">June</option>
<option value="7">July</option>
<option value="8">August</option>
<option value="9">September</option>
<option value="10">October</option>
<option value="11">November</option>
<option value="12">December</option>
</select>

<p id="daysText">Days: 31</p>

<!-- Milk Rate -->
<p>Milk Rate (₹ per L): 
<input id="rate" type="number" value="50" oninput="calculateAmount()">
</p>

<h3>Total: <span id="liters">0</span> L</h3>
<h3>Amount: ₹ <span id="amount">0</span></h3>

<button onclick="addMilk(1)">1 L</button>
<button onclick="addMilk(0.5)">0.5 L</button><br>
<button onclick="addMilk(0.75)">0.75 L</button>
<button onclick="addMilk(0.25)">0.25 L</button>

<br><br>
<button class="reset" onclick="reset()">Reset</button>

</div>

<script>
let total = 0;

// Add Milk
function addMilk(l) {
    total += l;
    document.getElementById("liters").innerText = total.toFixed(2);
    calculateAmount();
}

// Reset
function reset() {
    total = 0;
    document.getElementById("liters").innerText = "0";
    document.getElementById("amount").innerText = "0";
}

// Calculate Amount
function calculateAmount() {
    let rate = Number(document.getElementById("rate").value);
    let amt = total * rate;
    document.getElementById("amount").innerText = amt.toFixed(2);
}

// Update days when month changes
function updateDays() {
    let m = Number(document.getElementById("month").value);
    let days = 31;

    if (m === 2) { days = 28; } // Feb normal
    if ([4,6,9,11].includes(m)) { days = 30; } // Apr, Jun, Sep, Nov

    document.getElementById("daysText").innerText = "Days: " + days;
}
</script>

</body>
</html>
`;

    return new Response(html, {
      headers: { "content-type": "text/html;charset=UTF-8" }
    });
  }
};