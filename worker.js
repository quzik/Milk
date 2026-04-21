export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // SAVE
    if (url.pathname === "/save" && request.method === "POST") {
      const data = await request.json();
      await env.MILK_DB.put("milk-data", JSON.stringify(data));
      return json({ success: true });
    }

    // LOAD
    if (url.pathname === "/load") {
      const data = await env.MILK_DB.get("milk-data");
      return new Response(data || "{}", {
        headers: { "Content-Type": "application/json" },
      });
    }

    // UI
    return new Response(html, {
      headers: { "Content-Type": "text/html;charset=UTF-8" },
    });
  },
};

function json(data) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}

const html = `
<!DOCTYPE html>
<html lang="ta">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Milk Delivery Management</title>

<style>
body { font-family: 'Segoe UI', sans-serif; background: #eef2f3; padding: 20px; }
.container { background: white; padding: 20px; border-radius: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { border: 1px solid #aaa; padding: 6px; text-align: center; }
th { background: #34495e; color: white; }
.sunday { background: #ffcccc !important; }
input { width: 70px; }
button { padding: 10px; background: green; color: white; border: none; }
</style>
</head>

<body>

<div class="container">
<h2>பால் விநியோக மேலாண்மை ☁️</h2>

<select id="year"></select>
<select id="month" onchange="generate()">
<option value="0">Jan</option>
<option value="1">Feb</option>
<option value="2">Mar</option>
<option value="3">Apr</option>
<option value="4">May</option>
<option value="5">Jun</option>
<option value="6">Jul</option>
<option value="7">Aug</option>
<option value="8">Sep</option>
<option value="9">Oct</option>
<option value="10">Nov</option>
<option value="11">Dec</option>
</select>

<table>
<thead id="head"></thead>
<tbody id="body"></tbody>
</table>

<br>
<button onclick="addRow()">+ Add</button>
<button onclick="save()">💾 Save</button>
</div>

<script>
let yearEl = document.getElementById("year");
for (let y=2020;y<=2045;y++){
  let o=document.createElement("option");
  o.value=y;o.text=y;
  if(y===2026) o.selected=true;
  yearEl.appendChild(o);
}

function daysInMonth(y,m){
  return new Date(y,m+1,0).getDate();
}

function generate(){
  let y=+yearEl.value;
  let m=+document.getElementById("month").value;
  let d=daysInMonth(y,m);

  let h="<tr><th>Name</th><th>Qty</th><th>Rate</th>";
  for(let i=1;i<=d;i++){
    let date=new Date(y,m,i);
    let s=date.getDay()==0?'class="sunday"':'';
    h+=\`<th \${s}>\${i}</th>\`;
  }
  h+="<th>Total</th></tr>";
  document.getElementById("head").innerHTML=h;
}

function addRow(data={}){
  let y=+yearEl.value;
  let m=+document.getElementById("month").value;
  let d=daysInMonth(y,m);

  let tr=document.createElement("tr");
  tr.innerHTML=\`
<td><input value="\${data.name||""}"></td>
<td><input type="number" value="\${data.qty||1}" oninput="calc(this)"></td>
<td><input type="number" value="\${data.rate||50}" oninput="calc(this)"></td>\`;

  for(let i=0;i<d;i++){
    let c=data.days?.[i]?"checked":"";
    tr.innerHTML+=\`<td><input type="checkbox" \${c} onclick="calc(this)"></td>\`;
  }

  tr.innerHTML+=\`<td class="total">0</td>\`;
  document.getElementById("body").appendChild(tr);
  calc(tr);
}

function calc(el){
  let tr=el.closest?el.closest("tr"):el;
  let qty=+tr.children[1].firstChild.value||0;
  let rate=+tr.children[2].firstChild.value||0;
  let days=[...tr.querySelectorAll("input[type=checkbox]")].filter(x=>x.checked).length;
  tr.querySelector(".total").innerText=qty*rate*days;
}

async function save(){
  let rows=[...document.querySelectorAll("#body tr")].map(tr=>({
    name: tr.children[0].firstChild.value,
    qty: tr.children[1].firstChild.value,
    rate: tr.children[2].firstChild.value,
    days: [...tr.querySelectorAll("input[type=checkbox]")].map(x=>x.checked)
  }));

  await fetch("/save",{method:"POST",body:JSON.stringify({rows})});
  alert("Saved");
}

async function load(){
  let r=await fetch("/load");
  let data=await r.json();

  if(data.rows){
    document.getElementById("body").innerHTML="";
    data.rows.forEach(addRow);
  }
}

generate();
load();
</script>

</body>
</html>
`;
