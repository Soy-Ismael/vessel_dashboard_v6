/* ======================================================
   Vessel Dashboard v6 — app.js
   Requires: index.html + styles.css + boat-telemetry.json
   UMass Boston — IMPACT Program
   ====================================================== */

'use strict';

/* ── App state ── */
const APP = {
  theme:       document.documentElement.dataset.theme || 'dark',
  apiEndpoint: '',
  telemetry:   null
};

/* ── DOM refs ── */
const UI = {};

/* ======================================================
   INIT
====================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  cacheUI();
  applyTheme(APP.theme);
  bindEvents();
  await loadTelemetry();
  seedChat();
});

function cacheUI() {
  [
    'connLabel','themeBtn','themeIcon',
    'healthRing','healthScore',
    'vName','vMmsi','vFlag','vTime',
    'speedVal','speedTrend','speedSpark',
    'headingVal','headingSpark',
    'rpmVal','rpmTrend','rpmSpark',
    'battVal','battSpark',
    'navGrid','engGrid',
    'alertsList','freeStack','checklist',
    'chatWindow','chatForm','chatInput','chatMode',
    'apiEndpoint','saveEndpoint',
    'telemetryPre','apiPre','eventTimeline'
  ].forEach(id => { UI[id] = document.getElementById(id); });
}

/* ======================================================
   THEME
====================================================== */
function applyTheme(t) {
  APP.theme = t;
  document.documentElement.setAttribute('data-theme', t);
  if (UI.themeIcon) UI.themeIcon.textContent = t === 'dark' ? '\u2600' : '\u263e';
  if (UI.themeBtn)  UI.themeBtn.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
}

/* ======================================================
   EVENT BINDINGS
====================================================== */
function bindEvents() {
  UI.themeBtn.addEventListener('click', () =>
    applyTheme(APP.theme === 'dark' ? 'light' : 'dark'));

  UI.saveEndpoint.addEventListener('click', () => {
    APP.apiEndpoint = UI.apiEndpoint.value.trim();
    UI.connLabel.textContent = APP.apiEndpoint ? 'External API connected' : 'Signal K simulated';
    UI.chatMode.textContent  = APP.apiEndpoint
      ? 'External mode: responses from your Python API.'
      : 'Local mode active — no external endpoint configured.';
  });

  UI.chatForm.addEventListener('submit', async e => {
    e.preventDefault();
    const q = UI.chatInput.value.trim();
    if (!q) return;
    UI.chatInput.value = '';
    autoResize(UI.chatInput);
    await handleQuestion(q);
  });

  UI.chatInput.addEventListener('input', () => autoResize(UI.chatInput));

  document.querySelectorAll('[data-q]').forEach(btn =>
    btn.addEventListener('click', () => handleQuestion(btn.dataset.q)));

  document.querySelectorAll('.tab').forEach(btn =>
    btn.addEventListener('click', () => activateTab(btn)));
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

/* ======================================================
   TABS
====================================================== */
function activateTab(btn) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  btn.setAttribute('aria-selected', 'true');
  const panel = document.getElementById('panel-' + btn.dataset.tab);
  if (panel) panel.classList.add('active');
}

/* ======================================================
   TELEMETRY
====================================================== */
async function loadTelemetry() {
  try {
    const res = await fetch('boat-telemetry.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    APP.telemetry = await res.json();
    renderAll(APP.telemetry);
  } catch (err) {
    console.error('Error loading telemetry:', err);
    if (UI.connLabel) UI.connLabel.textContent = 'Error loading JSON';
  }
}

/* ======================================================
   RENDER
====================================================== */
function renderAll(d) {
  /* Vessel meta */
  UI.vName.textContent  = d.vessel.name;
  UI.vMmsi.textContent  = d.vessel.mmsi;
  UI.vFlag.textContent  = d.vessel.flag;
  UI.vTime.textContent  = fmtDate(d.timestamp);

  /* Health ring */
  const score = d.analytics.maintenanceScore;
  UI.healthScore.textContent = score;
  setRing(score);

  /* KPIs */
  const h = d.history;
  UI.speedVal.textContent   = fmt1(last(h.speedKn)) + ' kn';
  UI.headingVal.textContent = fmt0(last(h.headingDeg)) + '\u00b0';
  UI.rpmVal.textContent     = fmt0(last(h.rpm));
  UI.battVal.textContent    = fmt1(last(h.batteryVoltage)) + ' V \u00b7 ' + d.energy.batteries.house.socPercent + '%';

  setTrend(UI.speedTrend, h.speedKn);
  setTrend(UI.rpmTrend,   h.rpm);

  sparkline(UI.speedSpark,   h.speedKn);
  sparkline(UI.headingSpark, h.headingDeg);
  sparkline(UI.rpmSpark,     h.rpm);
  sparkline(UI.battSpark,    h.batteryVoltage);

  /* Nav grid */
  renderMetrics(UI.navGrid, [
    ['Latitude',        fmt4(d.navigation.position.latitude)  + '\u00b0'],
    ['Longitude',       fmt4(d.navigation.position.longitude) + '\u00b0'],
    ['COG',             fmt0(d.navigation.courseOverGroundDeg) + '\u00b0'],
    ['Depth',           fmt1(d.navigation.depthBelowTransducerM) + ' m'],
    ['Apparent wind',   fmt1(d.environment.wind.apparentSpeedKn) + ' kn'],
    ['True wind',       fmt1(d.environment.wind.trueSpeedKn) + ' kn'],
    ['Water temp',      fmt1(d.environment.water.temperatureC) + ' \u00b0C'],
    ['Pressure',        fmt1(d.environment.weather.pressureHpa) + ' hPa']
  ]);

  /* Engine grid */
  renderMetrics(UI.engGrid, [
    ['RPM',             fmt0(d.propulsion.engine1.rpm)],
    ['Engine load',     d.propulsion.engine1.loadPercent + '%'],
    ['Coolant temp',    fmt1(d.propulsion.engine1.coolantTempC) + ' \u00b0C'],
    ['Oil pressure',    fmt0(d.propulsion.engine1.oilPressureKpa) + ' kPa'],
    ['Alternator',      fmt1(d.energy.charging.alternatorVoltage) + ' V'],
    ['Fuel level',      d.tanks.fuel.main.levelPercent + '%'],
    ['Range estimate',  d.analytics.rangeEstimateNm + ' nm'],
    ['AI anomaly',      Math.round(d.analytics.anomalyScore * 100) + ' / 100']
  ]);

  /* Alerts */
  UI.alertsList.innerHTML = d.analytics.alerts.map(a => `
    <article class="alert-card ${a.severity}">
      <div class="row">
        <strong>${a.title}</strong>
        <span class="mini-badge ${a.severity === 'danger' ? 'err' : 'warn'}">${a.severity}</span>
      </div>
      <p>${a.description}</p>
      <p><strong>Action:</strong> ${a.recommendation}</p>
    </article>`).join('');

  /* Free stack */
  UI.freeStack.innerHTML = d.integrations.freeStack.map(s => `
    <div class="stack-item">
      <div><strong>${s.name}</strong><span>${s.role}</span></div>
      <span class="mini-badge acc">free</span>
    </div>`).join('');

  /* Checklist */
  UI.checklist.innerHTML = d.analytics.checklist.map(c => `<li>${c}</li>`).join('');

  /* JSON panels */
  UI.telemetryPre.textContent = JSON.stringify(d, null, 2);
  UI.apiPre.textContent       = JSON.stringify(d.apiExamples, null, 2);

  /* Timeline */
  UI.eventTimeline.innerHTML = d.events.map(ev => `
    <article class="tl-item">
      <time>${ev.time}</time>
      <strong>${ev.title}</strong>
      <p>${ev.description}</p>
    </article>`).join('');
}

function renderMetrics(container, rows) {
  container.innerHTML = rows.map(([label, value]) => `
    <div class="metric-card">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>`).join('');
}

/* ======================================================
   HEALTH RING
====================================================== */
function setRing(score) {
  const circ   = 301.59;
  const offset = circ - (score / 100) * circ;
  UI.healthRing.style.strokeDashoffset = offset;
  UI.healthRing.style.stroke =
    score >= 80 ? 'var(--ok)' :
    score >= 60 ? 'var(--warn)' : 'var(--err)';
}

/* ======================================================
   SPARKLINES
====================================================== */
function sparkline(container, values) {
  const W = 220, H = 44;
  const min   = Math.min(...values);
  const max   = Math.max(...values);
  const range = max - min || 1;
  const pts   = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - 4 - ((v - min) / range) * (H - 10);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const polyline  = pts.join(' ');
  const closedArea = `${pts[0]} ${polyline} ${W},${H} 0,${H}`;
  const uid = container.id || Math.random().toString(36).slice(2);
  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="sg${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="var(--acc)" stop-opacity=".32"/>
          <stop offset="100%" stop-color="var(--acc)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon class="spark-area" points="${closedArea}" fill="url(#sg${uid})"/>
      <polyline class="spark-line" points="${polyline}"/>
    </svg>`;
}

/* ======================================================
   TREND BADGES
====================================================== */
function setTrend(el, series) {
  const delta = last(series) - series[0];
  el.className = 'trend-badge';
  if (delta > 0.3) {
    el.textContent = '+' + fmt1(delta);
    el.classList.add('up');
  } else if (delta < -0.3) {
    el.textContent = fmt1(delta);
    el.classList.add('down');
  } else {
    el.textContent = 'stable';
    el.classList.add('flat');
  }
}

/* ======================================================
   CHAT
====================================================== */
function seedChat() {
  addBubble(
    'Hello! I am the maritime AI copilot. I can give you a vessel summary, ' +
    'help with alerts, emergency procedures, and connect to your Python backend ' +
    'when you configure the endpoint in the sidebar.',
    'ai'
  );
}

async function handleQuestion(question) {
  addBubble(question, 'user');
  const typing = addTyping();
  const answer = await getAnswer(question);
  typing.remove();
  addBubble(answer, 'ai');
}

function addBubble(text, role) {
  const el = document.createElement('article');
  el.className = 'bubble ' + role;
  el.textContent = text;
  UI.chatWindow.appendChild(el);
  UI.chatWindow.scrollTop = UI.chatWindow.scrollHeight;
  return el;
}

function addTyping() {
  const el = document.createElement('div');
  el.className = 'bubble ai typing';
  el.innerHTML = '<span></span><span></span><span></span>';
  UI.chatWindow.appendChild(el);
  UI.chatWindow.scrollTop = UI.chatWindow.scrollHeight;
  return el;
}

async function getAnswer(question) {
  if (APP.apiEndpoint) {
    try {
      const res = await fetch(APP.apiEndpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ question, telemetry: APP.telemetry, source: 'vessel-dashboard-v6' })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      return data.answer || data.response || 'API responded without an "answer" field.';
    } catch (err) {
      return 'Could not reach external API (' + err.message + '). Local fallback: ' + localAnswer(question);
    }
  }
  await sleep(320);
  return localAnswer(question);
}

/* ======================================================
   LOCAL COPILOT
====================================================== */
function localAnswer(q) {
  const t  = APP.telemetry;
  if (!t) return 'Telemetry is not available yet.';
  const lo = q.toLowerCase();

  if (has(lo, ['summary','status','vessel','general','overview'])) {
    const nav = t.navigation; const eng = t.propulsion.engine1; const bat = t.energy.batteries.house;
    return `${t.vessel.name} is sailing at ${fmt1(nav.speedOverGroundKn)} knots, heading ${fmt0(nav.headingTrueDeg)}\u00b0. ` +
           `Engine at ${fmt0(eng.rpm)} rpm, coolant ${fmt1(eng.coolantTempC)} \u00b0C. ` +
           `House battery at ${bat.socPercent}% (${fmt1(bat.voltage)} V). ` +
           t.analytics.healthSummary;
  }
  if (has(lo, ['engine','rpm','temperature','coolant','oil','motor'])) {
    const e = t.propulsion.engine1;
    return `Engine at ${fmt0(e.rpm)} rpm, load ${e.loadPercent}%. ` +
           `Coolant: ${fmt1(e.coolantTempC)} \u00b0C. Oil pressure: ${fmt0(e.oilPressureKpa)} kPa. ` +
           `Engine hours: ${fmt1(e.engineHours)}. ` +
           'If temperature rises, check raw water intake, heat exchanger and filters.';
  }
  if (has(lo, ['power','battery','alternator','solar','voltage','soc'])) {
    const bat = t.energy.batteries.house; const chg = t.energy.charging;
    return `House battery: ${fmt1(bat.voltage)} V, SOC ${bat.socPercent}%, ` +
           `current ${fmt1(bat.currentA)} A, ~${bat.timeRemainingMin} min remaining. ` +
           `Alternator: ${fmt1(chg.alternatorVoltage)} V. Solar: ${chg.solarInputW} W. ` +
           `Shore power: ${chg.shorePowerConnected ? 'connected' : 'disconnected'}.`;
  }
  if (has(lo, ['alert','alerts','risk','priority'])) {
    return t.analytics.alerts.map(a =>
      `[${a.severity.toUpperCase()}] ${a.title}: ${a.recommendation}`
    ).join(' | ');
  }
  if (has(lo, ['fuel','tank','range','autonomy'])) {
    const tk = t.tanks.fuel.main;
    return `Fuel at ${tk.levelPercent}% (${tk.remainingL} L of ${tk.capacityL} L). ` +
           `Consumption: ${fmt1(t.propulsion.engine1.fuelRateLh)} L/h. ` +
           `Estimated range: ${t.analytics.rangeEstimateNm} nm.`;
  }
  if (has(lo, ['depth','draft','keel'])) {
    return `Depth below transducer: ${fmt1(t.navigation.depthBelowTransducerM)} m. ` +
           `Depth below keel: ${fmt1(t.navigation.depthBelowKeelM)} m. ` +
           `Vessel draft: ${t.vessel.draftM} m.`;
  }
  if (has(lo, ['wind'])) {
    const w = t.environment.wind;
    return `Apparent wind: ${fmt1(w.apparentSpeedKn)} kn at ${fmt0(w.apparentAngleDeg)}\u00b0. ` +
           `True wind: ${fmt1(w.trueSpeedKn)} kn at ${fmt0(w.trueAngleDeg)}\u00b0.`;
  }
  if (has(lo, ['ais','traffic','collision','cpa','tcpa'])) {
    const s = t.safety.ais;
    return `${s.targetsNearby} AIS targets nearby. ` +
           `Closest CPA: ${s.closestCpaNm} NM, TCPA: ${s.closestTcpaMin} min. ` +
           'Verify with ARPA/AIS and maintain visual watch.';
  }
  if (has(lo, ['mob','man overboard','man over board'])) {
    return 'MOB procedure: 1) Press MOB on GPS/plotter immediately. ' +
           '2) Throw life ring and light device. ' +
           '3) Assign a dedicated visual observer, never lose sight of the person. ' +
           '4) Reduce speed and execute recovery maneuver according to wind and sea state. ' +
           '5) Transmit MAYDAY on VHF channel 16 if you cannot recover alone.';
  }
  if (has(lo, ['fire','engine room fire'])) {
    return 'Fire on board: 1) Sound the alarm. ' +
           '2) Reduce ventilation and shut off fuel to the affected compartment. ' +
           '3) Activate fixed suppression system if available. ' +
           '4) Use appropriate extinguisher for the fire type. ' +
           '5) If not controlled within 60 seconds, transmit MAYDAY and prepare to abandon.';
  }
  if (has(lo, ['water','bilge','flooding','ingress'])) {
    return 'Water ingress: 1) Locate the source and apply a temporary plug. ' +
           '2) Activate bilge pumps immediately. ' +
           '3) Reduce speed to lower hydrostatic pressure. ' +
           '4) Redistribute weights if listing. ' +
           '5) Report the situation and evaluate abandonment.';
  }
  if (has(lo, ['propulsion','no engine','loss of propulsion'])) {
    return 'Loss of propulsion: 1) Check emergency stop and restart if safe. ' +
           '2) Check fuel and filters. ' +
           '3) Anchor if depth and situation allow. ' +
           '4) Broadcast PAN PAN message with your position and status.';
  }
  if (has(lo, ['mayday','distress','radio','vhf'])) {
    return 'MAYDAY on VHF channel 16: ' +
           '"MAYDAY MAYDAY MAYDAY, this is [vessel name], ' +
           'position [lat/lon or reference], [type of emergency], ' +
           '[number of people on board], requesting immediate assistance. Out."';
  }
  if (has(lo, ['python','api','endpoint','fastapi','backend'])) {
    return 'Configure your endpoint in the sidebar input field. ' +
           'The frontend sends POST with { question, telemetry, source }. ' +
           'Your backend must respond with { "answer": "..." }. ' +
           'See python_api_example.py for a ready-to-use FastAPI server.';
  }
  if (has(lo, ['signal k','signalk','nmea','raspberry'])) {
    return 'Signal K is an open-source server that acts as a gateway between ' +
           'the vessel NMEA 2000 devices and web applications. ' +
           'With a Raspberry Pi and a CAN HAT you connect to the N2K bus and get ' +
           'all vessel data as JSON via REST or WebSocket.';
  }
  return 'I can help with: vessel summary, engine, power, fuel, navigation, wind, depth, ' +
         'AIS, alerts, checklist, and emergencies (MOB, fire, flooding, propulsion, MAYDAY). ' +
         'You can also connect your Python backend via the sidebar.';
}

/* ======================================================
   HELPERS
====================================================== */
const last  = arr => arr[arr.length - 1];
const fmt0  = n   => Number(n).toFixed(0);
const fmt1  = n   => Number(n).toFixed(1);
const fmt4  = n   => Number(n).toFixed(4);
const sleep = ms  => new Promise(r => setTimeout(r, ms));
const has   = (str, terms) => terms.some(t => str.includes(t));
function fmtDate(iso) {
  try { return new Date(iso).toLocaleString('en-US'); }
  catch { return iso; }
}
