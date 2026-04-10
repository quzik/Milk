export default {
  async fetch(request) {
    return new Response(String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Milk Calculator</title>
<style>
body{font-family:monospace;background:#0D1117;color:#E8EDF5;display:flex;justify-content:center;align-items:center;height:100vh;}
button{margin:5px;padding:10px;}
</style>
</head>
<body>
<div>
<h1>🥛 Milk Calc</h1>
<p>Total: <span id="total">0</span> L</p>
<button onclick="add(1)">+1L</button>
<button onclick="add(0.5)">+0.5L</button>
<button onclick="add(0.75)">+0.75L</button>
<button onclick="add(0.25)">+0.25L</button>
<br><br>
<button onclick="reset()">Reset</button>
</div>
<script>
let total=0;
function add(v){total+=v;update();}
function reset(){total=0;update();}
function update(){document.getElementById("total").textContent=total.toFixed(2);}
</script>
</body>
</html>`, {
      headers: { "content-type": "text/html;charset=UTF-8" },
    });
  },
};
