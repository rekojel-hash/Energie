// ── Constants ────────────────────────────────────────────────────────────────
const MONTHS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
const MONTHS_FULL = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth();
const TYPES = ["electricite","eau","bois"];
const ENERGY_COLORS = { electricite:"#f59e0b", eau:"#38bdf8", bois:"#a3e635" };
const ENERGY_ICONS  = { electricite:"⚡", eau:"💧", bois:"🪵" };
const ENERGY_LABELS = { electricite:"Électricité", eau:"Eau", bois:"Bois" };
const DEFAULT_UNITS = { electricite:"kWh", eau:"m³", bois:"stère" };

const USAGES = {
  electricite:[
    {id:"chauffage_elec",label:"Chauffage électrique",unit:"kWh/jour",defaultVal:10},
    {id:"eau_chaude",label:"Chauffe-eau électrique",unit:"kWh/jour",defaultVal:3},
    {id:"cuisine",label:"Cuisine / four",unit:"kWh/jour",defaultVal:1.5},
    {id:"eclairage",label:"Éclairage",unit:"kWh/jour",defaultVal:0.5},
    {id:"electromenager",label:"Électroménager",unit:"kWh/jour",defaultVal:2},
    {id:"autre_elec",label:"Autre",unit:"kWh/jour",defaultVal:0},
  ],
  eau:[
    {id:"douche",label:"Douches / jour",unit:"douches/jour",factor:0.055,defaultVal:2},
    {id:"bain",label:"Bains / semaine",unit:"bains/sem.",factor:0.15/7,defaultVal:0},
    {id:"wc",label:"Chasses d'eau / jour",unit:"fois/jour",factor:0.009,defaultVal:10},
    {id:"lave_linge",label:"Lave-linge / semaine",unit:"cycles/sem.",factor:0.06/7,defaultVal:3},
    {id:"lave_vaisselle",label:"Lave-vaisselle / semaine",unit:"cycles/sem.",factor:0.015/7,defaultVal:7},
    {id:"jardin",label:"Arrosage jardin",unit:"m³/jour",factor:1,defaultVal:0},
  ],
  bois:[
    {id:"insert",label:"Insert / poêle à bois",unit:"h/jour",factor:0.008,defaultVal:4},
    {id:"chaudiere_bois",label:"Chaudière bois",unit:"stère/mois",factor:1/30,defaultVal:0},
  ],
};

// ── State ────────────────────────────────────────────────────────────────────
let state = {
  tab: "releves",
  selectedYear: CURRENT_YEAR,
  selectedMonth: CURRENT_MONTH,
  prices: { electricite:0.2516, eau:4.5, bois:90 },
  budgets: { electricite:80, eau:30, bois:120, total:250 },
  showBudgetEdit: false,
  store: {},       // { year: { readings: {0..11: {e,eau,bois}}, context: {0..11: {temp,personnes}} } }
  usageInputs: {}, // { electricite: {id: val}, ... }
};

function initReadings() {
  const r={};
  for(let i=0;i<12;i++) r[i]={electricite:"",eau:"",bois:""};
  return r;
}
function initContext() {
  const c={};
  for(let i=0;i<12;i++) c[i]={temp:"",personnes:2};
  return c;
}
function initUsages() {
  const u={};
  TYPES.forEach(t=>{ u[t]={}; USAGES[t].forEach(x=>{ u[t][x.id]=x.defaultVal; }); });
  return u;
}
function ensureYear(yr) {
  if(!state.store[yr]) state.store[yr]={readings:initReadings(),context:initContext()};
}
function daysIn(year,month){ return new Date(year,month+1,0).getDate(); }

// ── Persistence ──────────────────────────────────────────────────────────────
function saveToStorage() {
  try { localStorage.setItem('energie_maison_v1', JSON.stringify(state)); } catch(e){}
}
function loadFromStorage() {
  try {
    const raw = localStorage.getItem('energie_maison_v1');
    if(raw) {
      const saved = JSON.parse(raw);
      state = { ...state, ...saved };
    }
  } catch(e){}
}

// ── Computed ─────────────────────────────────────────────────────────────────
function getUsageConsumption(month, year) {
  const days = daysIn(year, month);
  const refDays = daysIn(state.selectedYear, state.selectedMonth);
  const ratio = days / refDays;
  const r = {};
  r.electricite = Object.entries(state.usageInputs.electricite||{}).reduce((s,[,v])=>s+(parseFloat(v)||0),0) * days;
  r.eau = Object.entries(state.usageInputs.eau||{}).reduce((s,[id,v])=>{
    const u=USAGES.eau.find(x=>x.id===id); return s+(parseFloat(v)||0)*(u?.factor||0)*days;
  },0);
  r.bois = Object.entries(state.usageInputs.bois||{}).reduce((s,[id,v])=>{
    const u=USAGES.bois.find(x=>x.id===id); return s+(parseFloat(v)||0)*(u?.factor||0)*days;
  },0);
  return r;
}

function effectiveFor(rdgs, month, year) {
  const uc = getUsageConsumption(month, year);
  const ev = {};
  TYPES.forEach(t=>{
    const m=parseFloat(rdgs?.[month]?.[t]);
    ev[t] = (!isNaN(m)&&m>0) ? m : uc[t];
  });
  return ev;
}

function getAnnualData(year) {
  ensureYear(year);
  const rdgs = state.store[year].readings;
  return MONTHS.map((_,i)=>{
    const ev = effectiveFor(rdgs,i,year);
    return { month:i, ...ev, cost:TYPES.reduce((s,t)=>s+ev[t]*state.prices[t],0) };
  });
}

function getAlerts(ev, monthCost) {
  const a=[];
  TYPES.forEach(t=>{ if(ev[t]*state.prices[t]>state.budgets[t]) a.push(t); });
  if(monthCost>state.budgets.total) a.push("total");
  return a;
}

// ── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, type="success") {
  let t = document.getElementById('toast');
  if(!t){ t=document.createElement('div'); t.id='toast'; document.body.appendChild(t); }
  t.textContent=msg;
  t.style.cssText=`position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9999;
    background:${type==="error"?"#7f1d1d":"#14532d"};
    border:1px solid ${type==="error"?"#ef444455":"#4ade8055"};
    border-radius:10px;padding:10px 20px;font-size:13px;color:#f1f5f9;
    box-shadow:0 8px 32px #00000066;white-space:nowrap;transition:opacity .3s;opacity:1;font-family:'IBM Plex Sans',sans-serif;`;
  clearTimeout(t._timer);
  t._timer=setTimeout(()=>{ t.style.opacity='0'; },2500);
}

// ── Export / Import ──────────────────────────────────────────────────────────
function exportJSON() {
  const data=JSON.stringify({store:state.store,prices:state.prices,budgets:state.budgets,usageInputs:state.usageInputs},null,2);
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));
  a.download=`energie_maison_${Date.now()}.json`; a.click();
  showToast('✅ Sauvegarde exportée');
}
function importJSON(e) {
  const file=e.target.files[0]; if(!file)return;
  const r=new FileReader();
  r.onload=ev=>{
    try {
      const d=JSON.parse(ev.target.result);
      if(d.store) state.store=d.store;
      if(d.prices) state.prices=d.prices;
      if(d.budgets) state.budgets=d.budgets;
      if(d.usageInputs) state.usageInputs=d.usageInputs;
      saveToStorage(); render();
      showToast('✅ Données importées');
    } catch { showToast('❌ Fichier invalide','error'); }
  };
  r.readAsText(file); e.target.value="";
}
function exportCSV() {
  const rows=[["Année","Mois","Électricité (kWh)","Eau (m³)","Bois (stère)","Coût (€)","Temp. (°C)","Nb personnes"]];
  Object.keys(state.store).sort().forEach(yr=>{
    const rdgs=state.store[yr].readings; const ctx=state.store[yr].context;
    MONTHS.forEach((_,i)=>{
      const ev=effectiveFor(rdgs,i,parseInt(yr));
      const cost=TYPES.reduce((s,t)=>s+ev[t]*state.prices[t],0);
      rows.push([yr,MONTHS_FULL[i],ev.electricite.toFixed(1),ev.eau.toFixed(2),ev.bois.toFixed(2),cost.toFixed(2),ctx[i]?.temp||"",ctx[i]?.personnes||""]);
    });
  });
  const csv=rows.map(r=>r.join(";")).join("\n");
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:'text/csv;charset=utf-8'}));
  a.download=`energie_maison_${Date.now()}.csv`; a.click();
  showToast('✅ CSV exporté');
}

// ── HTML Builders ─────────────────────────────────────────────────────────────
function pct(val,max){ return Math.min(100,(val/(max||1))*100); }

function deltaBadge(cur,prev) {
  if(!prev||prev===0) return '';
  const p=((cur-prev)/prev)*100;
  const up=p>0;
  return `<span class="delta ${up?'up':'down'}">${up?'▲':'▼'} ${Math.abs(p).toFixed(1)}%</span>`;
}

function budgetBar(value, budget, color) {
  const p=pct(value,budget); const over=value>budget;
  return `<div class="bbar-wrap">
    <div class="bbar-track"><div class="bbar-fill" style="width:${p}%;background:${over?'#ef4444':color}"></div></div>
    <div class="bbar-labels">
      <span style="color:${over?'#ef4444':'#64748b'}">${over?'⚠️ Dépassement':'En cours'}</span>
      <span>${value.toFixed(0)} / ${budget.toFixed(0)} €</span>
    </div>
  </div>`;
}

function miniBar(val,max,color='#6366f1') {
  return `<div class="minibar"><div class="minibar-fill" style="width:${pct(val,max)}%;background:${color}"></div></div>`;
}

// ── Render Tabs ───────────────────────────────────────────────────────────────
function renderReleves(ev, monthCost, alerts, annualData) {
  const yr=state.selectedYear, mo=state.selectedMonth;
  ensureYear(yr);
  const rdgs=state.store[yr].readings;
  const uc=getUsageConsumption(mo,yr);

  let html=`<div class="tab-body">
    <p class="tab-desc">Relevés pour <strong>${MONTHS_FULL[mo]} ${yr}</strong>. Laissez vide pour utiliser l'estimation par usage.</p>`;

  TYPES.forEach(t=>{
    const manual=rdgs[mo]?.[t]||"";
    const isM=manual!=="";
    const cost=(ev[t]*state.prices[t]).toFixed(2);
    html+=`<div class="field-group">
      <label class="field-label">${ENERGY_ICONS[t]} ${ENERGY_LABELS[t]} <span class="field-unit">(${DEFAULT_UNITS[t]})</span></label>
      <div class="field-row">
        <input class="num-input" style="border-color:${isM?ENERGY_COLORS[t]:'#1e293b'}"
          type="number" data-field="reading-${t}" value="${manual}" placeholder="Relevé manuel…">
        <div class="field-cost">
          <span class="cost-val" style="color:${ENERGY_COLORS[t]}">${cost} €</span>
          <span class="cost-tag" style="color:${isM?'#22d3ee':'#475569'}">${isM?'✅ Manuel':'⚙️ Estimé'}</span>
        </div>
      </div>
    </div>`;
  });

  // Tarifs
  html+=`<div class="card mt20">
    <div class="card-title">💰 Tarifs unitaires</div>`;
  [{k:"electricite",l:"Électricité",u:"€/kWh"},{k:"eau",l:"Eau",u:"€/m³"},{k:"bois",l:"Bois",u:"€/stère"}].forEach(({k,l,u})=>{
    html+=`<div class="tarif-row">
      <span class="tarif-label">${ENERGY_ICONS[k]} ${l}</span>
      <input class="num-input sm" style="color:${ENERGY_COLORS[k]}" type="number" step="0.01" data-field="price-${k}" value="${state.prices[k]}">
      <span class="tarif-unit">${u}</span>
    </div>`;
  });
  html+=`</div>`;

  // Budgets
  html+=`<div class="card mt12">
    <div class="card-title-row">
      <span class="card-title">🎯 Budgets mensuels</span>
      <button class="link-btn" onclick="toggleBudgetEdit()">
        ${state.showBudgetEdit?'Fermer':'Modifier'}
      </button>
    </div>`;
  if(state.showBudgetEdit) {
    [{k:"electricite",l:"Électricité"},{k:"eau",l:"Eau"},{k:"bois",l:"Bois"},{k:"total",l:"Total mensuel"}].forEach(({k,l})=>{
      html+=`<div class="tarif-row">
        <span class="tarif-label">${ENERGY_ICONS[k]||'💶'} ${l}</span>
        <input class="num-input sm" type="number" data-field="budget-${k}" value="${state.budgets[k]}">
        <span class="tarif-unit">€</span>
      </div>`;
    });
  } else {
    html+=`<div class="budget-grid">`;
    [{k:"electricite",l:"Électricité"},{k:"eau",l:"Eau"},{k:"bois",l:"Bois"},{k:"total",l:"Total"}].forEach(({k,l})=>{
      const over=alerts.includes(k);
      html+=`<div class="budget-cell">
        <div class="budget-cell-label">${l}</div>
        <div class="budget-cell-val" style="color:${over?'#f87171':'#f1f5f9'}">${state.budgets[k]} €</div>
      </div>`;
    });
    html+=`</div>`;
  }
  html+=`</div></div>`;
  return html;
}

function renderUsages() {
  let html=`<div class="tab-body">
    <p class="tab-desc">Estimez votre consommation par usage. Utilisé si aucun relevé manuel n'est saisi.</p>`;
  TYPES.forEach(t=>{
    const uc=getUsageConsumption(state.selectedMonth,state.selectedYear);
    html+=`<div class="usage-group">
      <div class="usage-group-title" style="color:${ENERGY_COLORS[t]}">
        ${ENERGY_ICONS[t]} ${ENERGY_LABELS[t]}
        <span class="usage-total">≈ ${uc[t].toFixed(1)} ${DEFAULT_UNITS[t]}/mois</span>
      </div>`;
    USAGES[t].forEach(u=>{
      const val=state.usageInputs[t]?.[u.id]??u.defaultVal;
      const max=u.defaultVal*4||20;
      html+=`<div class="usage-item">
        <div class="usage-item-head"><span>${u.label}</span><span class="usage-unit">${u.unit}</span></div>
        <div class="usage-item-ctrl">
          <input type="range" min="0" max="${max}" step="${u.defaultVal>2?0.5:0.1}"
            value="${val}" style="accent-color:${ENERGY_COLORS[t]};flex:1"
            data-field="usage-${t}-${u.id}">
          <span class="usage-val" style="color:${ENERGY_COLORS[t]}">${parseFloat(val).toFixed(1)}</span>
        </div>
      </div>`;
    });
    html+=`</div>`;
  });
  html+=`</div>`;
  return html;
}

function renderPrevisionnel() {
  const yr=state.selectedYear, mo=state.selectedMonth;
  const annualData=getAnnualData(yr);
  const totals={electricite:0,eau:0,bois:0,cost:0};
  annualData.forEach(d=>{ TYPES.forEach(t=>{ totals[t]+=d[t]||0; }); totals.cost+=d.cost; });
  const maxCost=Math.max(...annualData.map(d=>d.cost),1);
  ensureYear(yr); const rdgs=state.store[yr].readings;

  // Prev year comparison
  let compHtml='';
  if(state.store[yr-1]) {
    compHtml=`<div class="card mb14"><div class="card-title">📊 ${yr} vs ${yr-1}</div>`;
    TYPES.forEach(t=>{
      const cur=annualData.reduce((s,d)=>s+d[t],0);
      const prevYrData=MONTHS.map((_,i)=>effectiveFor(state.store[yr-1].readings,i,yr-1));
      const prev=prevYrData.reduce((s,d)=>s+(d[t]||0),0);
      compHtml+=`<div class="comp-row">
        <span class="comp-icon">${ENERGY_ICONS[t]}</span>
        <span class="comp-label">${ENERGY_LABELS[t]}</span>
        <span class="comp-val">${cur.toFixed(0)} ${DEFAULT_UNITS[t]}</span>
        ${deltaBadge(cur,prev)}
      </div>`;
    });
    compHtml+=`</div>`;
  }

  let html=`<div class="tab-body">${compHtml}
    <div class="total-card mb14">
      <div class="total-label">Coût total ${yr}</div>
      <div class="total-val">${totals.cost.toFixed(0)} <span class="total-unit">€</span></div>
      <div class="total-sub">${(totals.cost/12).toFixed(0)} €/mois en moyenne</div>
    </div>
    <div class="energy-grid mb14">`;
  TYPES.forEach(t=>{
    html+=`<div class="card p12">
      <div class="eg-icon">${ENERGY_ICONS[t]}</div>
      <div class="eg-cost" style="color:${ENERGY_COLORS[t]}">${(totals[t]*state.prices[t]).toFixed(0)} €</div>
      <div class="eg-qty">${totals[t].toFixed(0)} ${DEFAULT_UNITS[t]}</div>
    </div>`;
  });
  html+=`</div>
    <div class="card mb14" style="padding:16px">
      <div class="card-title">Coût mensuel ${yr}</div>
      <div class="barchart">`;
  annualData.forEach((d,i)=>{
    const h=Math.max(4,(d.cost/maxCost)*82);
    const isSel=i===mo;
    const hasM=TYPES.some(t=>parseFloat(rdgs[i]?.[t])>0);
    const bg=isSel?'linear-gradient(to top,#6366f1,#818cf8)':hasM?'linear-gradient(to top,#334155,#475569)':'linear-gradient(to top,#1e2a3a,#334155)';
    html+=`<div class="bar-col" onclick="selectMonth(${i})">
      <div class="bar" style="height:${h}px;background:${bg}"></div>
      <div class="bar-label" style="color:${isSel?'#818cf8':'#334155'}">${MONTHS[i]}</div>
    </div>`;
  });
  html+=`</div>${state.budgets.total?`<div class="budget-hint">Budget mensuel : <span>${state.budgets.total} €</span></div>`:''}</div>
    <div class="card" style="overflow:hidden">
      <div class="section-head">Détail par mois</div>`;
  annualData.forEach((d,i)=>{
    const hasM=TYPES.some(t=>parseFloat(rdgs[i]?.[t])>0);
    const over=d.cost>state.budgets.total&&state.budgets.total>0;
    const isSel=i===mo;
    html+=`<div class="month-row ${isSel?'selected':''}" onclick="selectMonth(${i})">
      <span class="month-row-label" style="color:${isSel?'#6366f1':'#475569'}">${MONTHS[i]}</span>
      <div style="flex:1">${miniBar(d.cost,maxCost,isSel?'#6366f1':'#334155')}</div>
      <span class="month-row-cost" style="color:${over?'#f87171':isSel?'#f1f5f9':'#94a3b8'}">${d.cost.toFixed(0)} €</span>
      ${hasM?'<span class="tag cyan">relevé</span>':''}
      ${over?'<span class="tag red">⚠️</span>':''}
    </div>`;
  });
  html+=`</div></div>`;
  return html;
}

function renderContexte() {
  const yr=state.selectedYear, mo=state.selectedMonth;
  ensureYear(yr);
  const ctx=state.store[yr].context;
  const annualData=getAnnualData(yr);

  let html=`<div class="tab-body">
    <p class="tab-desc">Données contextuelles pour <strong>${MONTHS_FULL[mo]} ${yr}</strong>.</p>
    <div class="card mb14" style="padding:16px">
      <div class="card-title">🌡️ Météo & foyer</div>
      <div class="field-group">
        <label class="field-label">Température extérieure moyenne (°C)</label>
        <input class="num-input" type="number" data-field="ctx-temp" value="${ctx[mo]?.temp||''}" placeholder="Ex: 5">
      </div>
      <div class="field-group">
        <label class="field-label">Nombre de personnes dans le foyer</label>
        <div class="persons-grid">`;
  [1,2,3,4,5,6].forEach(n=>{
    const sel=(ctx[mo]?.personnes||2)===n;
    html+=`<button class="person-btn ${sel?'sel':''}" onclick="setPersonnes(${n})">${n}</button>`;
  });
  html+=`</div></div></div>
    <div class="card" style="overflow:hidden">
      <div class="section-head">Vue annuelle du contexte</div>`;
  MONTHS.forEach((m,i)=>{
    const c=ctx[i]||{};
    const isSel=i===mo;
    html+=`<div class="month-row ${isSel?'selected':''}" onclick="selectMonth(${i})">
      <span class="month-row-label" style="color:${isSel?'#6366f1':'#475569'}">${m}</span>
      <div style="flex:1;display:flex;gap:12px">
        ${c.temp?`<span class="ctx-tag">🌡️ ${c.temp}°C</span>`:'<span style="color:#334155">—</span>'}
        ${c.personnes?`<span class="ctx-tag">👥 ${c.personnes}</span>`:''}
      </div>
      <span style="font-family:'DM Mono',monospace;font-size:12px;color:#64748b">${annualData[i]?.cost.toFixed(0)} €</span>
    </div>`;
  });
  html+=`</div></div>`;
  return html;
}

function renderSauvegarde() {
  const years=Object.keys(state.store).sort();
  let html=`<div class="tab-body">
    <p class="tab-desc">Sauvegardez et restaurez toutes vos données, ou exportez pour Excel.</p>
    <div class="card mb12" style="padding:16px">
      <div class="card-title">💾 Sauvegarde complète</div>
      <p style="font-size:12px;color:#94a3b8;line-height:1.6;margin-bottom:14px">
        Exporte toutes vos années, relevés, budgets et paramètres dans un fichier JSON restaurable.
      </p>
      <button class="big-btn indigo" onclick="exportJSON()">⬇️ Exporter la sauvegarde (.json)</button>
      <label class="big-btn-outline mt8">
        ⬆️ Importer une sauvegarde
        <input type="file" accept=".json" onchange="importJSON(event)" style="display:none">
      </label>
    </div>
    <div class="card mb12" style="padding:16px">
      <div class="card-title">📄 Export CSV (Excel)</div>
      <p style="font-size:12px;color:#94a3b8;line-height:1.6;margin-bottom:14px">
        Toutes les années en un fichier CSV, ouvrable dans Excel ou LibreOffice.
      </p>
      <button class="big-btn green" onclick="exportCSV()">📊 Exporter en CSV</button>
    </div>
    <div class="card" style="padding:16px">
      <div class="card-title">📋 Années enregistrées</div>`;
  years.forEach(yr=>{
    const yrR=state.store[yr]?.readings||{};
    const filled=MONTHS.filter((_,i)=>TYPES.some(t=>parseFloat(yrR[i]?.[t])>0)).length;
    const yrCost=MONTHS.reduce((s,_,i)=>{
      const ev=effectiveFor(yrR,i,parseInt(yr));
      return s+TYPES.reduce((ss,t)=>ss+ev[t]*state.prices[t],0);
    },0);
    html+=`<div class="yr-row">
      <span class="yr-label" style="color:${parseInt(yr)===state.selectedYear?'#818cf8':'#94a3b8'}">${yr}</span>
      <div style="flex:1">${miniBar(filled,12,'#6366f1')}<div style="font-size:10px;color:#64748b;margin-top:2px">${filled} mois saisis</div></div>
      <span style="font-family:'DM Mono',monospace;font-size:13px;color:#f1f5f9">${yrCost.toFixed(0)} €</span>
    </div>`;
  });
  html+=`</div></div>`;
  return html;
}

// ── Main Render ───────────────────────────────────────────────────────────────
function render() {
  const yr=state.selectedYear, mo=state.selectedMonth;
  ensureYear(yr);
  const rdgs=state.store[yr].readings;
  const ctx=state.store[yr].context;
  const ev=effectiveFor(rdgs,mo,yr);
  const monthCost=TYPES.reduce((s,t)=>s+ev[t]*state.prices[t],0);
  const alerts=getAlerts(ev,monthCost);

  const prevMo=mo===0?11:mo-1;
  const prevYr=mo===0?yr-1:yr;
  const prevRdgs=state.store[prevYr]?.readings||initReadings();
  const prevEv=effectiveFor(prevRdgs,prevMo,prevYr);
  const prevCost=TYPES.reduce((s,t)=>s+prevEv[t]*state.prices[t],0);

  const lastYrRdgs=state.store[yr-1]?.readings||initReadings();
  const lastYrEv=effectiveFor(lastYrRdgs,mo,yr-1);
  const lastYrCost=TYPES.reduce((s,t)=>s+lastYrEv[t]*state.prices[t],0);

  const annualData=getAnnualData(yr);
  const years=Object.keys(state.store).map(Number).sort();

  // Header
  const alertHtml=alerts.length?`<div class="alert-badge">⚠️ ${alerts.length} alerte${alerts.length>1?'s':''}</div>`:'';
  document.getElementById('header-alert').innerHTML=alertHtml;

  // Year pills
  let yearHtml=years.map(y=>`
    <button class="pill ${y===yr?'active':''}" onclick="selectYear(${y})">${y}</button>
  `).join('');
  yearHtml+=`<button class="pill-add" onclick="addYear()">+ Année</button>`;
  document.getElementById('year-pills').innerHTML=yearHtml;

  // Month pills
  document.getElementById('month-pills').innerHTML=MONTHS.map((m,i)=>`
    <button class="pill ${i===mo?'active':''}" onclick="selectMonth(${i})">${m}</button>
  `).join('');

  // Summary
  const ctxMo=ctx[mo]||{};
  const lastYrHtml=lastYrCost>0?`<div class="summary-sub">vs ${yr-1} même mois : <span style="color:${monthCost>lastYrCost?'#f87171':'#4ade80'}">${lastYrCost.toFixed(0)} €</span></div>`:'';
  document.getElementById('summary-total').innerHTML=`
    <div class="summary-card ${alerts.includes('total')?'alert':''}">
      <div class="summary-left">
        <div class="summary-label">Total ${MONTHS_FULL[mo]} ${yr}</div>
        <div class="summary-val">${monthCost.toFixed(2)} <span class="summary-currency">€</span>
          ${deltaBadge(monthCost,prevCost)}
        </div>
        ${lastYrHtml}
      </div>
      <div class="summary-right">
        <div class="summary-proj">≈ ${(monthCost*12).toFixed(0)} €/an</div>
        ${ctxMo.temp?`<div class="summary-ctx">🌡️ ${ctxMo.temp}°C</div>`:''}
        ${ctxMo.personnes?`<div class="summary-ctx">👥 ${ctxMo.personnes} pers.</div>`:''}
      </div>
    </div>
    ${state.budgets.total?budgetBar(monthCost,state.budgets.total,'#6366f1'):''}
  `;

  document.getElementById('summary-energies').innerHTML=TYPES.map(t=>{
    const cost=ev[t]*state.prices[t];
    const prevC=prevEv[t]*state.prices[t];
    const over=alerts.includes(t);
    return `<div class="energy-card ${over?'alert':''}">
      <span class="ec-icon">${ENERGY_ICONS[t]}</span>
      <div class="ec-info">
        <div class="ec-label">${ENERGY_LABELS[t]}</div>
        <div class="ec-val">${ev[t].toFixed(1)} <span class="ec-unit">${DEFAULT_UNITS[t]}</span></div>
      </div>
      <div class="ec-right">
        <div class="ec-cost" style="color:${over?'#ef4444':ENERGY_COLORS[t]}">${cost.toFixed(2)} € ${over?'⚠️':''}</div>
        ${deltaBadge(cost,prevC)}
        ${state.budgets[t]?budgetBar(cost,state.budgets[t],ENERGY_COLORS[t]):''}
      </div>
    </div>`;
  }).join('');

  // Tab content
  const tabs={
    releves:()=>renderReleves(ev,monthCost,alerts,annualData),
    usages:()=>renderUsages(),
    previsionnel:()=>renderPrevisionnel(),
    contexte:()=>renderContexte(),
    sauvegarde:()=>renderSauvegarde(),
  };
  document.getElementById('tab-content').innerHTML=(tabs[state.tab]||tabs.releves)();

  // Tab bar
  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.tab===state.tab);
  });
}

// ── Event handlers (global) ──────────────────────────────────────────────────
window.selectYear = function(y){ state.selectedYear=y; ensureYear(y); saveToStorage(); render(); };
window.selectMonth = function(m){ state.selectedMonth=m; saveToStorage(); render(); };
window.addYear = function(){
  const ny=Math.max(...Object.keys(state.store).map(Number))+1;
  ensureYear(ny); state.selectedYear=ny; saveToStorage(); render();
  showToast(`✅ Année ${ny} ajoutée`);
};
window.toggleBudgetEdit = function(){ state.showBudgetEdit=!state.showBudgetEdit; render(); };
window.setPersonnes = function(n){
  const yr=state.selectedYear, mo=state.selectedMonth;
  ensureYear(yr);
  state.store[yr].context[mo]={...state.store[yr].context[mo], personnes:n};
  saveToStorage(); render();
};
window.exportJSON=exportJSON;
window.importJSON=importJSON;
window.exportCSV=exportCSV;

// Live input delegation
document.addEventListener('input', e=>{
  const f=e.target.dataset.field; if(!f) return;
  const yr=state.selectedYear, mo=state.selectedMonth;
  ensureYear(yr);
  const v=e.target.value;

  if(f.startsWith('reading-')){
    const t=f.replace('reading-','');
    state.store[yr].readings[mo]={...state.store[yr].readings[mo],[t]:v};
  } else if(f.startsWith('price-')){
    const t=f.replace('price-','');
    state.prices[t]=parseFloat(v)||0;
  } else if(f.startsWith('budget-')){
    const t=f.replace('budget-','');
    state.budgets[t]=parseFloat(v)||0;
  } else if(f.startsWith('usage-')){
    const [,type,id]=f.split('-').reduce((acc,p,i)=>{ if(i===0) return acc; if(i===1){acc.push(p);}else{acc[1]=acc[1]?acc[1]+'-'+p:p;} return acc; },[f.split('-')[0],'']);
    // parse usage-TYPE-ID
    const parts=f.split('-'); const tp=parts[1]; const uid=parts.slice(2).join('-');
    if(!state.usageInputs[tp]) state.usageInputs[tp]={};
    state.usageInputs[tp][uid]=parseFloat(v)||0;
    // update display val inline
    const span=e.target.parentElement.querySelector('.usage-val');
    if(span) span.textContent=(parseFloat(v)||0).toFixed(1);
    // update total
    const uc=getUsageConsumption(mo,yr);
    const groupTitle=e.target.closest('.usage-group')?.querySelector('.usage-total');
    if(groupTitle) groupTitle.textContent=`≈ ${uc[tp].toFixed(1)} ${DEFAULT_UNITS[tp]}/mois`;
  } else if(f==='ctx-temp'){
    state.store[yr].context[mo]={...state.store[yr].context[mo],temp:v};
  }
  saveToStorage();
  // lightweight re-render only summary for performance
  if(!f.startsWith('usage-')) render();
});

document.addEventListener('change', e=>{
  const f=e.target.dataset.field; if(!f) return;
  saveToStorage(); render();
});

// Tab switching
document.querySelectorAll('.tab-btn').forEach(b=>{
  b.addEventListener('click',()=>{ state.tab=b.dataset.tab; render(); });
});

// ── Boot ─────────────────────────────────────────────────────────────────────
loadFromStorage();
ensureYear(CURRENT_YEAR);
if(!state.usageInputs||!state.usageInputs.electricite) state.usageInputs=initUsages();
render();

// Service Worker
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
