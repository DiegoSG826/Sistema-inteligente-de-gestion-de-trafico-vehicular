import { DEFAULT_CONFIG, simulateComparison, phaseAt } from './simulation.js';
import { renderProject } from './project-view.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const number = (value, digits = 0) => Number(value).toLocaleString('es-MX', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const clock = value => `${Math.floor(value / 60).toString().padStart(2, '0')}:${Math.floor(value % 60).toString().padStart(2, '0')}`;
const state = { result: null, view: 'simulador', time: 0, playing: !matchMedia('(prefers-reduced-motion: reduce)').matches, projectReady: false, sweep: null };
const corridors = { reforma: 'Reforma × Insurgentes', tlalpan: 'Tlalpan × Eje 5 Sur', universidad: 'Universidad × División del Norte' };
const presets = { light: [350, 250], medium: [1100, 650], heavy: [1850, 1200] };
let lastFrame = 0;
let toastTimer;

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}

function badge(fixed, adaptive, lower = true) {
  if (fixed === 0) {
    return adaptive === 0 ? '<span class="delta neutral">Sin cambio</span>' : '<span class="delta neutral">Sin base porcentual</span>';
  }
  const delta = (adaptive - fixed) / fixed * 100;
  if (Math.abs(delta) < 0.05) return '<span class="delta neutral">Sin cambio</span>';
  const good = lower ? delta < 0 : delta > 0;
  return `<span class="delta${good ? '' : ' worse'}">${delta < 0 ? '↓' : '↑'} ${number(Math.abs(delta), 1)}%</span>`;
}

function readConfig() {
  const fields = ['demandNS', 'demandEW', 'greenNS', 'greenEW', 'duration', 'seed'];
  for (const name of fields) {
    const input = $(`#${name}`);
    if (input.value.trim() === '' || !input.checkValidity()) {
      input.focus();
      throw new Error(`${input.labels?.[0]?.textContent.trim().split('\n')[0] || name}: escribe un valor entre ${input.min} y ${input.max}${name === 'seed' || name.startsWith('green') || name === 'duration' ? ', sin decimales' : ''}.`);
    }
  }
  return { ...DEFAULT_CONFIG, ...Object.fromEntries(fields.map(name => [name, Number($(`#${name}`).value)])), duration: Number($('#duration').value) * 60 };
}

function refreshControls() {
  for (const axis of ['NS', 'EW']) $(`#demand${axis}-value`).innerHTML = `${number($(`#demand${axis}`).value)} <small>veh/h</small>`;
  $('#cycle-length').textContent = `${Number($('#greenNS').value) + Number($('#greenEW').value) + 10} s`;
  const selected = Object.entries(presets).find(([, demands]) => demands[0] === Number($('#demandNS').value) && demands[1] === Number($('#demandEW').value))?.[0];
  $$('[data-preset]').forEach(button => {
    button.classList.toggle('selected', button.dataset.preset === selected);
    button.setAttribute('aria-pressed', String(button.dataset.preset === selected));
  });
}

function simulate(announce = true) {
  try {
    const config = readConfig();
    state.result = simulateComparison(config);
    state.sweep = null;
    state.time = 0;
    $('#config-error').hidden = true;
    $('#timeline').max = config.duration;
    $('#map-title').textContent = corridors[$('#corridor').value];
    $('#chart-horizon').textContent = `${config.duration / 60} min`;
    renderMetrics();
    $('#queue-chart').innerHTML = queueChart(state.result, 156);
    $('#scenario-notice').textContent = state.result.warnings.length ? state.result.warnings.join(' ') : 'El controlador adaptativo redistribuye los verdes al inicio de cada ciclo. La mejora depende del escenario; un cruce saturado puede seguir acumulando vehículos.';
    renderResults();
    refreshCharts();
    renderPlayback();
    if (announce) toast(`Comparación actualizada · ${number(state.result.fixed.metrics.arrived)} llegadas idénticas por estrategia.`);
  } catch (error) {
    $('#config-error').textContent = error.message;
    $('#config-error').hidden = false;
  }
}

function renderMetrics() {
  const f = state.result.fixed.metrics;
  const a = state.result.adaptive.metrics;
  const cards = [
    { label: 'Espera observada por llegada', symbol: '◷', value: number(a.meanWait, 1), unit: 's', fixed: f.meanWait, adaptive: a.meanWait, lower: true },
    { label: 'Vehículos que cruzaron', symbol: '+', value: number(a.passed), unit: 'veh', fixed: f.passed, adaptive: a.passed, lower: false },
    { label: 'Cola media del cruce', symbol: '≋', value: number(a.meanQueue, 1), unit: 'veh', fixed: f.meanQueue, adaptive: a.meanQueue, lower: true },
  ];
  $('#metrics').innerHTML = cards.map(card => `<article class="metric-card"><div class="metric-label"><span class="metric-symbol" aria-hidden="true">${card.symbol}</span>${card.label}</div><div class="metric-value">${card.value}<small>${card.unit}</small></div><div class="metric-bottom">${badge(card.fixed, card.adaptive, card.lower)}<span>adaptativo vs. fijo</span></div></article>`).join('');
}

function queueChart(result, height = 220, availableWidth = 720) {
  const width = Math.max(280, Math.min(720, availableWidth)), left = 36, right = 16, top = 15, bottom = 29;
  const max = Math.max(5, Math.ceil(Math.max(result.fixed.metrics.maxQueue, result.adaptive.metrics.maxQueue) / 5) * 5);
  const x = time => left + time / result.config.duration * (width - left - right);
  const y = queue => height - bottom - queue / max * (height - bottom - top);
  const sampleEvery = Math.max(1, Math.floor(result.config.duration / 180));
  const values = history => history.filter((_, i) => i % sampleEvery === 0 || i === history.length - 1);
  const points = history => values(history).map(h => `${x(h.time).toFixed(1)},${y(h.queueNS + h.queueEW).toFixed(1)}`).join(' ');
  const ticks = [0, max / 2, max].map(n => `<line x1="${left}" y1="${y(n)}" x2="${width - right}" y2="${y(n)}" stroke="#edf0e8"/><text x="${left - 9}" y="${y(n) + 3}" fill="#929c89" font-size="9" text-anchor="end">${number(n, Number.isInteger(n) ? 0 : 1)}</text>`).join('');
  const times = [0, .25, .5, .75, 1].map(t => `<text x="${x(t * result.config.duration)}" y="${height - 5}" fill="#929c89" font-size="9" text-anchor="middle">${(t * result.config.duration / 60).toLocaleString('es-MX', { maximumFractionDigits: 2 })} min</text>`).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Cola total a lo largo de ${result.config.duration / 60} minutos; fijo, máximo ${result.fixed.metrics.maxQueue} vehículos; adaptativo, máximo ${result.adaptive.metrics.maxQueue} vehículos. El CSV contiene la serie completa.">${ticks}${times}<polygon points="${left},${height - bottom} ${points(result.adaptive.history)} ${width - right},${height - bottom}" fill="#e7773b" opacity=".055"/><polyline points="${points(result.fixed.history)}" fill="none" stroke="#abb3a4" stroke-width="1.7" stroke-dasharray="5 4" stroke-linejoin="round"/><polyline points="${points(result.adaptive.history)}" fill="none" stroke="#e7773b" stroke-width="2" stroke-linejoin="round"/></svg>`;
}

function renderPlayback() {
  if (!state.result) return;
  const { adaptive, config } = state.result;
  const time = Math.min(config.duration, Math.floor(state.time));
  const h = adaptive.history[time];
  const plan = [...adaptive.timings].reverse().find(p => p.time <= time) || adaptive.timings[0];
  const phase = phaseAt(time, plan, config.clearance);
  $('#timeline').value = time;
  $('#playback-time').textContent = `${clock(time)} / ${clock(config.duration)}`;
  $('#playback').innerHTML = state.playing ? '<svg class="play-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3h3v10H4zm5 0h3v10H9z"/></svg>' : '<svg class="play-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 8 5-8 5Z"/></svg>';
  $('#playback').setAttribute('aria-label', state.playing ? 'Pausar animación' : 'Reproducir animación');
  $('#playback').setAttribute('aria-pressed', String(state.playing));
  $('#phase-label').textContent = time === config.duration ? 'Fin del horizonte' : phase === 'NS' ? 'Norte–sur en verde' : phase === 'EW' ? 'Oriente–poniente en verde' : 'Despeje · ambos en rojo';
  $('#map-green-ns').textContent = `${plan.greenNS} s`;
  $('#map-green-ew').textContent = `${plan.greenEW} s`;
  $('#signal-ns').setAttribute('fill', time < config.duration && phase === 'NS' ? '#579a75' : '#df7964');
  $('#signal-ew').setAttribute('fill', time < config.duration && phase === 'EW' ? '#579a75' : '#df7964');
  const cars = [];
  const colors = ['#e58c5e', '#819b88', '#a2ad99', '#c4b494', '#7293a0'];
  for (let i = 0; i < Math.min(h.queueNS, 12); i++) {
    const lane = i % 2, row = Math.floor(i / 2);
    const cx = 388 + lane * 18, cy = 265 + row * 14;
    cars.push(`<rect x="${cx}" y="${cy}" width="8" height="12" rx="2" fill="${colors[i % colors.length]}"/>`);
  }
  for (let i = 0; i < Math.min(h.queueEW, 18); i++) {
    const lane = i % 2, row = Math.floor(i / 2);
    cars.push(`<rect x="${292 - row * 18}" y="${192 + lane * 17}" width="14" height="8" rx="2" fill="${colors[(i + 2) % colors.length]}"/>`);
  }
  if (time < config.duration && phase === 'NS' && h.queueNS > 0) {
    cars.push(`<rect x="390" y="${230 - (state.time % 4) / 4 * 110}" width="8" height="12" rx="2" fill="#427968"/>`);
  } else if (time < config.duration && phase === 'EW' && h.queueEW > 0) {
    cars.push(`<rect x="${330 + (state.time % 4) / 4 * 120}" y="194" width="14" height="8" rx="2" fill="#e7773b"/>`);
  }
  $('#car-layer').innerHTML = cars.join('');
  $('#map-svg-description').textContent = `Cruce ilustrativo; a los ${time} segundos esperan ${h.queueNS} vehículos norte-sur y ${h.queueEW} oriente-poniente. Se muestran hasta 12 y 18 iconos respectivamente; el movimiento es ilustrativo.`;
}

function timingBar(plan, cycleLength) {
  const { clearance } = state.result.config;
  let offset = 0;
  const pieces = [[plan.greenNS, '#427968', `${plan.greenNS}s NS`], [clearance, '#cbd1c5', ''], [plan.greenEW, '#e7773b', `${plan.greenEW}s OP`], [clearance, '#cbd1c5', '']];
  return `<svg viewBox="0 0 400 28" role="img" aria-label="Verde norte-sur ${plan.greenNS} segundos, despeje ${clearance}, verde oriente-poniente ${plan.greenEW}, despeje ${clearance}">${pieces.map(([seconds, color, label]) => {
    const width = seconds / cycleLength * 400;
    const part = `<rect x="${offset}" y="0" width="${width}" height="28" fill="${color}"/><text x="${offset + width / 2}" y="18" text-anchor="middle" font-size="10" fill="white">${label}</text>`;
    offset += width;
    return part;
  }).join('')}</svg>`;
}

function renderResults() {
  const r = state.result, f = r.fixed.metrics, a = r.adaptive.metrics;
  const rows = [
    ['Llegadas (muestra idéntica)', f.arrived, a.arrived, 'veh', 0, true],
    ['Espera observada por llegada', f.meanWait, a.meanWait, 's', 1, true],
    ['Vehículos que cruzaron', f.passed, a.passed, 'veh', 0, false],
    ['Flujo de salida equivalente', f.throughput, a.throughput, 'veh/h', 0, false],
    ['Cola media total', f.meanQueue, a.meanQueue, 'veh', 1, true],
    ['Cola máxima total', f.maxQueue, a.maxQueue, 'veh', 0, true],
    ['Vehículos pendientes al cierre', f.remaining, a.remaining, 'veh', 0, true],
    ['Pendientes norte–sur', f.remainingNS, a.remainingNS, 'veh', 0, true],
    ['Pendientes oriente–poniente', f.remainingEW, a.remainingEW, 'veh', 0, true],
  ];
  $('#view-resultados').innerHTML = `<div class="section-intro"><div><p class="eyebrow">02 / EVIDENCIA DEL ESCENARIO</p><h2>Dos estrategias. Un mismo cruce.</h2><p>Resultados de ${r.config.duration / 60} minutos, semilla ${r.config.seed}. La comparación conserva llegadas, capacidad y duración del ciclo. El resultado puede favorecer cualquiera de las estrategias.</p></div><div class="button-row"><button id="export-json" class="secondary-button">Descargar escenario JSON ↓</button><button id="export-csv" class="secondary-button">Descargar resultados CSV ↓</button></div></div>
  <div class="panel"><div class="table-scroll"><table><caption class="sr-only">Métricas de estrategias fija y adaptativa</caption><thead><tr><th>Métrica</th><th>Plan fijo</th><th>Plan adaptativo</th><th>Cambio relativo</th></tr></thead><tbody>${rows.map(([label, fv, av, unit, digits, lower]) => `<tr><td>${label}</td><td>${number(fv, digits)} ${unit}</td><td>${number(av, digits)} ${unit}</td><td>${badge(fv, av, lower)}</td></tr>`).join('')}</tbody></table></div><p class="table-note">Espera observada = suma de colas por segundo ÷ llegadas. Incluye vehículos que no han cruzado; su espera posterior al horizonte no se observa. No representa el tiempo de viaje completo. En el CSV, la fila t resume el intervalo [t−1, t); la fila 0 es el estado inicial.</p></div>
  <div class="result-grid"><section class="panel content-panel"><div class="chart-heading"><div><p class="eyebrow">EVOLUCIÓN DE COLAS</p><h3>Lo que ocurre durante el recorrido</h3></div><div class="chart-legend"><span><i class="legend-line fixed"></i>Fijo</span><span><i class="legend-line adaptive"></i>Adaptativo</span></div></div><div id="result-queue-chart" class="line-chart">${queueChart(r, 250)}</div><p>Ambas estrategias recibieron ${number(f.arrivedNS)} vehículos norte–sur y ${number(f.arrivedEW)} oriente–poniente. Llegadas = salidas + pendientes, en cada eje.</p></section>
  <section class="panel content-panel"><p class="eyebrow">REPARTO DEL CICLO</p><h3>El verde se ajusta, el ciclo se conserva.</h3><p>Primer ciclo: mismo plan para observar demanda. Después, el adaptativo reparte ${r.config.greenNS + r.config.greenEW} s verdes según colas y llegadas observadas. Los dos despejes suman ${r.config.clearance * 2} s.</p><div class="timing-chart"><div class="timing-row"><span>Plan fijo</span>${timingBar(r.fixed.timings[0], r.cycleLength)}<span>${r.cycleLength} s</span></div>${r.adaptive.timings.filter((_, i, all) => i < 2 || i === Math.floor(all.length / 2) || i === all.length - 1).map(plan => `<div class="timing-row"><span>Ciclo ${plan.cycle}</span>${timingBar(plan, r.cycleLength)}<span>${clock(plan.time)}</span></div>`).join('')}</div><p>Verde NS <span class="legend-dot green"></span> · Verde OP <span class="legend-dot orange"></span> · Gris: despeje sin servicio.</p></section></div>
  <section class="panel content-panel"><div class="chart-heading"><div><p class="eyebrow">SENSIBILIDAD AL AZAR</p><h3>Una semilla es un escenario, no una conclusión.</h3></div><button id="seed-sweep" class="secondary-button">Comprobar 20 semillas</button></div><p>Repite la comparación con semillas consecutivas a partir de ${r.config.seed}, sin cambiar el resto del escenario. Los resultados describen este modelo sintético y no demuestran eficacia en calles reales.</p><div id="sweep-output" role="status" class="result-note">Aún no se ejecuta la comprobación de sensibilidad.</div></section>
  ${r.warnings.length ? `<div class="result-note">${r.warnings.join(' ')}</div>` : ''}`;
  $('#export-json').addEventListener('click', exportJSON);
  $('#export-csv').addEventListener('click', exportCSV);
  $('#seed-sweep').addEventListener('click', sweepSeeds);
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJSON() {
  const { config, fixed, adaptive, warnings, cycleLength } = state.result;
  download('nodo-escenario.json', JSON.stringify({ schemaVersion: 1, source: 'Datos simulados. Sin acceso a Waze.', corridor: corridors[$('#corridor').value], config, cycleLength, warnings, fixed: fixed.metrics, adaptive: adaptive.metrics, sensitivity: state.sweep, assumptions: ['Cruce aislado de dos fases y un carril equivalente por eje.', 'Llegadas Poisson homogéneas compartidas entre estrategias.', 'Despejes todo rojo; sin modelo de ámbar o peatones.', 'Espera truncada por horizonte por llegada, no tiempo de viaje.', 'Control adaptativo por regla de colas y EWMA; sin ML entrenado.'] }, null, 2), 'application/json');
  toast('Escenario descargado con semilla, parámetros y supuestos.');
}

function exportCSV() {
  const r = state.result;
  const lines = ['tiempo_s,llegadas_ns,llegadas_op,cola_fija_ns,cola_fija_op,cola_adaptativa_ns,cola_adaptativa_op,salidas_fijas_acum,salidas_adaptativas_acum,verde_fijo_ns_s,verde_fijo_op_s,verde_adaptativo_ns_s,verde_adaptativo_op_s,semilla'];
  r.fixed.history.forEach((f, time) => {
    const a = r.adaptive.history[time];
    const arrival = time === 0 ? { ns: 0, ew: 0 } : r.arrivals[time - 1];
    lines.push([time, arrival.ns, arrival.ew, f.queueNS, f.queueEW, a.queueNS, a.queueEW, f.passed, a.passed, f.greenNS, f.greenEW, a.greenNS, a.greenEW, r.config.seed].join(','));
  });
  download('nodo-resultados-simulados.csv', '\ufeff' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  toast('Serie temporal completa descargada. Fuente: simulación.');
}

async function sweepSeeds() {
  const button = $('#seed-sweep');
  button.disabled = true;
  button.textContent = 'Calculando…';
  const config = { ...state.result.config };
  const records = [];
  let improved = 0, worsened = 0, tied = 0, difference = 0;
  for (let i = 0; i < 20; i++) {
    const result = simulateComparison({ ...config, seed: (config.seed + i) >>> 0 });
    const delta = result.adaptive.metrics.meanWait - result.fixed.metrics.meanWait;
    difference += delta;
    if (Math.abs(delta) < 1e-9) tied++; else if (delta < 0) improved++; else worsened++;
    records.push({ seed: result.config.seed, fixedWait: result.fixed.metrics.meanWait, adaptiveWait: result.adaptive.metrics.meanWait, delta });
    if (i % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  // A user may have recomputed while this yielded; never attach old evidence to a new run.
  if (state.result.config.seed !== config.seed || Object.entries(config).some(([key, value]) => state.result.config[key] !== value)) return;
  state.sweep = { count: 20, improved, worsened, tied, meanDifferenceSeconds: difference / 20, records };
  $('#sweep-output').textContent = `20 semillas: espera menor en ${improved}, mayor en ${worsened}, igual en ${tied}. Diferencia media (adaptativo − fijo): ${difference >= 0 ? '+' : ''}${number(difference / 20, 2)} s por llegada. La muestra no sustituye validación con datos reales ni constituye un intervalo de confianza.`;
  button.disabled = false;
  button.textContent = 'Repetir 20 semillas';
}

function renderData() {
  $('#view-datos').innerHTML = `<div class="section-intro"><div><p class="eyebrow">04 / TRANSPARENCIA DEL MODELO</p><h2>Sabemos lo que estamos suponiendo.</h2><p>El prototipo sirve para explorar hipótesis y planear el proyecto. Cada cifra de tráfico y cada resultado mostrado proviene de simulación, no de observaciones de CDMX.</p></div></div>
  <div class="data-banner"><span aria-hidden="true">◎</span><div><h3>Sin acceso a Waze. Sin conexión a semáforos reales.</h3><p>Los nombres de avenidas solo contextualizan un cruce académico. No se afirma que sean las rutas más congestionadas, que este sea su diseño vial ni que los parámetros correspondan a su operación real.</p></div></div>
  <div class="data-grid">
  <article class="panel content-panel"><h3><span class="data-number">01 /</span> Qué se está simulando</h3><ul><li>Un cruce aislado con dos fases incompatibles: norte–sur y oriente–poniente.</li><li>Un carril equivalente de servicio por eje, capacidad de saturación de 1,800 veh/h mientras tiene verde.</li><li>Llegadas Poisson independientes, constantes por eje durante el horizonte y discretizadas a un segundo.</li><li>La semilla determina las llegadas exactas; ambas estrategias reciben la misma muestra.</li><li>Colas vacías al comenzar. Llegadas primero, servicio después; se mide cola al final de cada segundo.</li><li>Los selectores de avenidas cambian solo la referencia ilustrativa, no aportan datos de esas calles.</li></ul></article>
  <article class="panel content-panel"><h3><span class="data-number">02 /</span> Cómo decide el adaptativo</h3><ul><li>Primer ciclo igual al plan fijo. Desde el segundo, revisa las llegadas del ciclo anterior y las colas actuales.</li><li>Demanda estimada con suavizado exponencial EWMA, α = 0.5; al inicio usa la demanda configurada.</li><li>Peso por eje = cola actual + demanda estimada por segundo × duración del ciclo.</li><li>Distribuye proporcionalmente el presupuesto verde; redondea a segundos enteros.</li><li>Los verdes quedan entre 15 y 75 s por eje y conservan la suma del plan fijo.</li><li>Dos despejes de 5 s, sin servicio y con ambos ejes en rojo. El ámbar no se modela de forma separada.</li><li>Es una heurística basada en datos simulados; no es un modelo de ML o deep learning entrenado.</li></ul></article>
  <article class="panel content-panel"><h3><span class="data-number">03 /</span> Qué significan las métricas</h3><ul><li><b>Espera observada por llegada:</b> suma de vehículos en cola cada segundo ÷ total de llegadas, en segundos. Incluye pendientes; su espera posterior no se conoce.</li><li><b>Cola media:</b> suma de colas por segundo ÷ segundos simulados.</li><li><b>Flujo de salida equivalente:</b> vehículos que cruzan × 3,600 ÷ segundos simulados; no es una medición de una hora real.</li><li><b>Pendientes:</b> llegadas menos salidas. No se descartan vehículos al cambiar el semáforo.</li><li>Un porcentaje verde representa un cambio favorable de esa métrica en esta simulación. También pueden aparecer cambios desfavorables.</li><li>No calculamos velocidad, tiempo de viaje de ruta, ahorro económico ni emisiones: no hay datos para sostenerlos.</li></ul></article>
  <article class="panel content-panel"><h3><span class="data-number">04 /</span> Límites y validación futura</h3><ul><li>Sin peatones, giros, transporte público, vehículos de emergencia, derrames de cola ni coordinación con otros cruces.</li><li>No se simulan geometría real, tiempos de arranque, fallas de sensores ni períodos de ámbar de campo.</li><li>La capacidad y las demandas son hipótesis editables de un ejercicio, no calibración de una avenida.</li><li>Se requieren aforos autorizados, geometría y planes reales para calibrar y validar fuera de muestra.</li><li>Para usar Waze debe verificarse la elegibilidad, el acceso y la licencia del programa de datos correspondiente. No se asume una API abierta ni permisos disponibles.</li><li>Cualquier operación física requiere ingeniería vial, fases peatonales, seguridad funcional y autorización de la autoridad competente.</li></ul></article>
  </div>
  <section class="panel content-panel"><h3>Una ruta razonable hacia machine learning</h3><p>Primero: recolectar y auditar datos autorizados, definir el objetivo y mantener un plan fijo como referencia. Después: comparar persistencia, regresión y árboles con división temporal de entrenamiento, validación y prueba; reportar MAE de demanda y métricas de circulación en simulación. Considerar deep learning solo si hay suficiente historia y demuestra una mejora fuera de muestra que justifique su costo. Predecir demanda y decidir un semáforo son problemas distintos: el controlador necesita límites de seguridad explícitos.</p><div class="result-note">CRISP-DM organiza esa investigación: comprensión del negocio → datos → preparación → modelado → evaluación → despliegue autorizado. El sitio implementa hoy una simulación y una regla adaptativa, no completa las fases de entrenamiento y validación con datos reales.</div></section>
  <section class="panel data-table"><div class="table-scroll"><table><caption>Trazabilidad del dato</caption><thead><tr><th>Elemento</th><th>Origen actual</th><th>Estado</th></tr></thead><tbody><tr><td>Demandas y llegadas</td><td>Parámetros y generador Poisson con semilla</td><td>Sintético</td></tr><tr><td>Verdes y despejes</td><td>Configuración académica del escenario</td><td>Sin calibración de campo</td></tr><tr><td>Colas, espera y salidas</td><td>Motor determinista de este prototipo</td><td>Resultado simulado</td></tr><tr><td>Avenidas de CDMX</td><td>Referencia nominal para contextualizar</td><td>Sin mapa ni ranking de tráfico</td></tr><tr><td>Requisitos y planificación</td><td>Solicitud del proyecto y notas de Ingeniería de Software</td><td>Propuesta para revisión del equipo</td></tr></tbody></table></div></section><p class="source-note">El CSV exporta la serie temporal completa; el JSON conserva semilla, configuración, resultados y supuestos. Las gráficas resumen visualmente la serie. El movimiento de los iconos es ilustrativo; los contadores y métricas proceden del motor.</p>`;
}


function refreshCharts() {
  for (const [selector, height] of [['#queue-chart', innerWidth <= 620 ? 174 : 156], ['#result-queue-chart', 250]]) {
    const container = $(selector);
    if (container?.clientWidth && state.result) container.innerHTML = queueChart(state.result, height, container.clientWidth);
  }
}
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(refreshCharts, 100); });

function setView(view) {
  if (!['simulador', 'resultados', 'proyecto', 'datos'].includes(view)) view = 'simulador';
  if (view === 'proyecto' && !state.projectReady) {
    renderProject($('#view-proyecto'));
    state.projectReady = true;
  }
  state.view = view;
  $$('.view').forEach(section => { section.hidden = section.id !== `view-${view}`; });
  $$('.tab').forEach(button => {
    const selected = button.dataset.view === view;
    button.classList.toggle('active', selected);
    if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  refreshCharts();
  history.replaceState(null, '', `#${view}`);
}

$$('.tab').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
$$('[data-go]').forEach(button => button.addEventListener('click', () => { setView(button.dataset.go); $('.navigation-row').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); }));
window.addEventListener('hashchange', () => setView(location.hash.slice(1)));
$$('[data-preset]').forEach(button => button.addEventListener('click', () => {
  const demands = presets[button.dataset.preset];
  $('#demandNS').value = demands[0];
  $('#demandEW').value = demands[1];
  refreshControls();
  simulate();
}));
for (const id of ['demandNS', 'demandEW', 'greenNS', 'greenEW']) $(`#${id}`).addEventListener('input', refreshControls);
$('#corridor').addEventListener('change', () => { $('#map-title').textContent = corridors[$('#corridor').value]; });
$('#simulate').addEventListener('click', () => simulate());
$('#reset').addEventListener('click', () => {
  for (const key of ['demandNS', 'demandEW', 'greenNS', 'greenEW', 'seed']) $(`#${key}`).value = DEFAULT_CONFIG[key];
  $('#duration').value = DEFAULT_CONFIG.duration / 60;
  $('#corridor').value = 'reforma';
  refreshControls();
  simulate(false);
  toast('Escenario restablecido.');
});
$('#playback').addEventListener('click', () => {
  if (state.time >= state.result.config.duration) state.time = 0;
  state.playing = !state.playing;
  renderPlayback();
});
$('#timeline').addEventListener('input', () => { state.time = Number($('#timeline').value); state.playing = false; renderPlayback(); });
document.addEventListener('visibilitychange', () => { lastFrame = 0; });
function animate(timestamp) {
  const elapsed = lastFrame ? Math.min((timestamp - lastFrame) / 1000, .1) : 0;
  lastFrame = timestamp;
  if (state.playing && state.view === 'simulador' && !document.hidden) {
    state.time = Math.min(state.result.config.duration, state.time + elapsed * Number($('#speed').value));
    if (state.time === state.result.config.duration) state.playing = false;
    renderPlayback();
  }
  requestAnimationFrame(animate);
}
refreshControls();
simulate(false);
renderData();
setView(location.hash.slice(1));
requestAnimationFrame(animate);
