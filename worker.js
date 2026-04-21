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
<title>Milk Diary Pro</title>

<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>

<style>
body { font-family: Arial; background:#eef2f3; padding:10px; }

.container {
    background:#fff;
    padding:15px;
    border-radius:10px;
    box-shadow:0 10px 20px rgba(0,0,0,0.1);
}

h2 { text-align:center; }

.controls {
    display:flex;
    flex-wrap:wrap;
    gap:10px;
    justify-content:center;
    margin-bottom:10px;
}

.table-wrapper { overflow:auto; }

table {
    border-collapse:collapse;
    width:max-content;
    min-width:100%;
    font-size:12px;
}

th, td {
    border:1px solid #999;
    padding:6px;
    text-align:center;
    vertical-align:middle;
}

/* NAME FIX */
.name-col { min-width:250px; }
.name-input {
    width:100%;
    text-align:left;
    word-break:break-word;
}

/* CENTER FIX */
td input[type="number"],
td input[type="checkbox"] {
    display:block;
    margin:auto;
    text-align:center;
}

tbody tr { height:42px; }

.sunday { background:#ffe0e0; }

.total { background:#f2f2f2; font-weight:bold; }
.net { background:#d9f7ef; font-weight:bold; }

button {
    padding:8px 12px;
    border:none;
    border-radius:5px;
    background:#27ae60;
    color:#fff;
}
</style>
</head>

<body>

<div class="container" id="pdfArea">

<h2>பால் விநியோகம் / Milk Delivery</h2>

<div class="controls">
<select id="year"></select>
<select id="month"></select>

<button onclick="addRow()">Add</button>
<button onclick="save()">💾 Save</button>
<button onclick="exportPDF()">PDF</button>
<button onclick="exportExcel()">Excel</button>
</div>

<div class="table-wrapper">
<table id="tbl">
<thead></thead>
<tbody></tbody>
</table>
</div>

</div>

<script>

let y=document.getElementById("year");
let m=document.getElementById("month");

/* YEAR */
for(let i=2024;i<=2045;i++){
let o=document.createElement("option");
o.value=i;o.text=i;
if(i==2026)o.selected=true;
y.appendChild(o);
}

/* MONTH */
let months=["Jan/ஜன","Feb/பிப்","Mar/மார்","Apr/ஏப்","May/மே","Jun/ஜூன்","Jul/ஜூலை","Aug/ஆக","Sep/செப்","Oct/அக்","Nov/நவ","Dec/டிச"];
months.forEach((v,i)=>{
let o=document.createElement("option");
o.value=i;o.text=v;
m.appendChild(o);
});

/* DAYS */
function days(y,m){ return new Date(y,m+1,0).getDate(); }

/* HEADER */
function build(){
let year=y.value,month=m.value,d=days(year,month);

let t=\`<tr>
<th>Sl No / வ.எண்</th>
<th class="name-col">Customer Name / வாடிக்கையாளர் பெயர்</th>
<th>Qty (L) / லிட்டர்</th>
<th>Rate / விலை</th>\`;

let tamil=['ஞா','தி','செ','பு','வி','வெ','ச'];

for(let i=1;i<=d;i++){
let day=new Date(year,month,i).getDay();
let sun=day==0?'class="sunday"':'';
t+=\`<th \${sun}>\${i}<br>\${tamil[day]}</th>\`;
}

t+=\`<th>Old Balance / கடந்த மாத நிலுவை</th>
<th>Current Bill / இந்த மாத தொகை</th>
<th>Amount Received / பெற்ற தொகை</th>
<th>Net Balance / நிகர நிலுவை</th></tr>\`;

tbl.querySelector("thead").innerHTML=t;
load();
}

/* ADD ROW */
function addRow(data={}){
let tr=tbl.querySelector("tbody").insertRow();
let d=days(y.value,m.value);

tr.innerHTML=\`
<td>\${tbl.rows.length-1}</td>
<td class="name-col"><input class="name-input" value="\${data.name||""}"></td>
<td><input type="number" class="qty" value="\${data.qty||1}"></td>
<td><input type="number" class="rate" value="\${data.rate||50}"></td>\`;

for(let i=0;i<d;i++){
let c=data.days?.[i]?"checked":"";
tr.innerHTML+=\`<td><input type="checkbox" class="day" \${c}></td>\`;
}

tr.innerHTML+=\`
<td><input type="number" class="old" value="\${data.old||0}"></td>
<td class="total">0</td>
<td><input type="number" class="rec" value="\${data.rec||0}"></td>
<td class="net">0</td>\`;

tr.querySelectorAll("input").forEach(i=>i.oninput=()=>calc(tr));

calc(tr);
}

/* CALC */
function calc(tr){
let q=+tr.querySelector(".qty").value||0;
let r=+tr.querySelector(".rate").value||0;
let o=+tr.querySelector(".old").value||0;
let rc=+tr.querySelector(".rec").value||0;

let d=[...tr.querySelectorAll(".day")].filter(x=>x.checked).length;

let bill=q*r*d;
let net=bill+o-rc;

tr.querySelector(".total").innerText=bill;
tr.querySelector(".net").innerText=net;
}

/* SAVE */
async function save(){
let rows=[];
document.querySelectorAll("tbody tr").forEach(tr=>{
rows.push({
name:tr.querySelector(".name-input").value,
qty:tr.querySelector(".qty").value,
rate:tr.querySelector(".rate").value,
old:tr.querySelector(".old").value,
rec:tr.querySelector(".rec").value,
days:[...tr.querySelectorAll(".day")].map(x=>x.checked)
});
});

await fetch("/save",{method:"POST",body:JSON.stringify({rows})});
alert("Saved ✔");
}

/* LOAD */
async function load(){
let r=await fetch("/load");
let data=await r.json();

if(data.rows){
tbl.querySelector("tbody").innerHTML="";
data.rows.forEach(addRow);
}
}

/* PDF */
async function exportPDF(){
const { jsPDF } = window.jspdf;
let canvas=await html2canvas(document.getElementById("pdfArea"),{scale:2});
let img=canvas.toDataURL("image/png");

let pdf=new jsPDF('l','mm','a4');
let w=297;
let h=(canvas.height*w)/canvas.width;

pdf.addImage(img,'PNG',0,0,w,h);
pdf.save("MilkDiary.pdf");
}

/* EXCEL */
function exportExcel(){
let wb=XLSX.utils.table_to_book(document.getElementById("tbl"));
XLSX.writeFile(wb,"MilkDiary.xlsx");
}

/* INIT */
y.onchange=build;
m.onchange=build;

build();

</script>

</body>
</html>
`;
