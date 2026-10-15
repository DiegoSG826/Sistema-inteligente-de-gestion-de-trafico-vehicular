import { projectData } from './project-data.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const describe = (value) => typeof value === 'string' ? value : value && typeof value === 'object' ? String(value.description ?? value.summary ?? value.text ?? value.title ?? value.name ?? '') : '';
const number = (value) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(value);
const lines = (value) => asArray(value).map((item) => `<li>${escapeHtml(describe(item))}</li>`).join('');

/** PERT / CPM uses unrounded durations. Estimates are work days, not effort days. */
export function calculatePert(tasks) {
  if (!Array.isArray(tasks) || !tasks.length) throw new Error('Se necesita al menos una actividad.');
  const map = new Map();
  for (const task of tasks) {
    if (!task.id || map.has(task.id)) throw new Error('Cada actividad debe tener un identificador único.');
    const optimistic = Number(task.optimistic);
    const likely = Number(task.likely);
    const pessimistic = Number(task.pessimistic);
    if (![optimistic, likely, pessimistic].every(Number.isFinite) || optimistic < 0 || optimistic > likely || likely > pessimistic) {
      throw new Error(`${task.id}: usa tiempos no negativos con To ≤ Tm ≤ Tp.`);
    }
    map.set(task.id, { ...task, optimistic, likely, pessimistic, dependencies: [...new Set(asArray(task.dependencies))], duration: (optimistic + 4 * likely + pessimistic) / 6, variance: ((pessimistic - optimistic) / 6) ** 2, successors: [], es: 0, ef: 0, ls: 0, lf: 0, level: 0 });
  }
  const degree = new Map();
  for (const task of map.values()) {
    degree.set(task.id, task.dependencies.length);
    for (const dependency of task.dependencies) {
      if (!map.has(dependency)) throw new Error(`La dependencia ${dependency} de ${task.id} no existe.`);
      map.get(dependency).successors.push(task.id);
    }
  }
  const queue = [...map.values()].filter((task) => !task.dependencies.length);
  const ordered = [];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const task = queue[cursor];
    task.es = Math.max(0, ...task.dependencies.map((id) => map.get(id).ef));
    task.ef = task.es + task.duration;
    task.level = task.dependencies.length ? Math.max(...task.dependencies.map((id) => map.get(id).level)) + 1 : 0;
    ordered.push(task);
    for (const successorId of task.successors) {
      degree.set(successorId, degree.get(successorId) - 1);
      if (degree.get(successorId) === 0) queue.push(map.get(successorId));
    }
  }
  if (ordered.length !== tasks.length) throw new Error('Las dependencias forman un ciclo. Revisa el plan.');
  const duration = Math.max(...ordered.map((task) => task.ef));
  for (const task of [...ordered].reverse()) {
    task.lf = task.successors.length ? Math.min(...task.successors.map((id) => map.get(id).ls)) : duration;
    task.ls = task.lf - task.duration;
    task.slack = Math.max(0, task.ls - task.es);
    task.critical = Math.abs(task.ls - task.es) < 1e-8;
  }
  const criticalEdges = [];
  for (const task of ordered) for (const dependency of task.dependencies) {
    const previous = map.get(dependency);
    if (task.critical && previous.critical && Math.abs(previous.ef - task.es) < 1e-8) criticalEdges.push([dependency, task.id]);
  }
  // There may be multiple critical paths. Enumerate them and keep the greatest
  // path variance as an explicit, approximate planning indicator.
  const criticalSuccessors = new Map(ordered.map((task) => [task.id, criticalEdges.filter(([id]) => id === task.id).map(([, id]) => id)]));
  const criticalPaths = [];
  const walk = (task, path, variance) => {
    const next = criticalSuccessors.get(task.id);
    const current = [...path, task.id];
    const accumulated = variance + task.variance;
    if (!next.length) {
      if (Math.abs(task.ef - duration) < 1e-8) criticalPaths.push({ ids: current, variance: accumulated });
      return;
    }
    for (const id of next) walk(map.get(id), current, accumulated);
  };
  for (const task of ordered) if (task.critical && !criticalEdges.some(([, id]) => id === task.id)) walk(task, [], 0);
  const variance = Math.max(0, ...criticalPaths.map((path) => path.variance));
  const resourceConflicts = [];
  for (let first = 0; first < ordered.length; first += 1) for (let second = first + 1; second < ordered.length; second += 1) {
    const a = ordered[first];
    const b = ordered[second];
    if (describe(a.owner) && describe(a.owner) === describe(b.owner) && Math.max(a.es, b.es) < Math.min(a.ef, b.ef) - 1e-8) resourceConflicts.push({ owner: describe(a.owner), activities: [a.id, b.id] });
  }
  return { tasks: ordered, duration, variance, standardDeviation: Math.sqrt(variance), criticalPaths, criticalEdges, resourceConflicts };
}

function sectionHeading(index, title, description = '') {
  return `<div class="project-section-heading"><span class="project-section-index">${index}</span><div><h2>${title}</h2>${description ? `<p>${description}</p>` : ''}</div></div>`;
}

function wrapTitle(text, maximum = 23) {
  const words = String(text ?? '').split(/\s+/);
  const rows = [''];
  for (const word of words) {
    const index = rows.length - 1;
    if (rows[index].length + word.length + 1 <= maximum) rows[index] += `${rows[index] ? ' ' : ''}${word}`;
    else rows.push(word);
  }
  return rows.slice(0, 2).map((row, index) => index === 1 && rows.length > 2 ? `${row.slice(0, maximum - 1)}…` : row);
}

function pertDiagram(schedule) {
  const levels = [];
  for (const task of schedule.tasks) (levels[task.level] ??= []).push(task);
  const nodeWidth = 168;
  const nodeHeight = 94;
  const columnGap = 52;
  const rowGap = 30;
  const levelById = new Map(schedule.tasks.map((task) => [task.id, task.level]));
  const skipEdges = schedule.tasks.flatMap((task) => task.dependencies.filter((id) => task.level - levelById.get(id) > 1).map((id) => JSON.stringify([id, task.id])));
  const padding = Math.max(28, 24 + skipEdges.length * 7);
  const maxRows = Math.max(...levels.map((level) => level.length));
  const height = Math.max(215, maxRows * (nodeHeight + rowGap) - rowGap + padding * 2);
  const width = Math.max(720, levels.length * (nodeWidth + columnGap) - columnGap + padding * 2);
  const positions = new Map();
  levels.forEach((level, index) => {
    const levelHeight = level.length * (nodeHeight + rowGap) - rowGap;
    level.forEach((task, row) => positions.set(task.id, { x: padding + index * (nodeWidth + columnGap), y: (height - levelHeight) / 2 + row * (nodeHeight + rowGap) }));
  });
  const criticalEdgeSet = new Set(schedule.criticalEdges.map((edge) => JSON.stringify(edge)));
  const arrows = schedule.tasks.flatMap((task) => task.dependencies.map((id) => {
    const start = positions.get(id);
    const end = positions.get(task.id);
    const critical = criticalEdgeSet.has(JSON.stringify([id, task.id]));
    const x1 = start.x + nodeWidth;
    const y1 = start.y + nodeHeight / 2;
    const x2 = end.x - 5;
    const y2 = end.y + nodeHeight / 2;
    const midpoint = (x1 + x2) / 2;
    const laneIndex = skipEdges.indexOf(JSON.stringify([id, task.id]));
    const lane = 12 + laneIndex * 7;
    const path = laneIndex >= 0 ? `M${x1},${y1} H${x1 + 14} V${lane} H${x2 - 14} V${y2} H${x2}` : `M${x1},${y1} C${midpoint},${y1} ${midpoint},${y2} ${x2},${y2}`;
    return `<path class="project-pert-edge${critical ? ' is-critical' : ''}" d="${path}" marker-end="url(#project-arrow${critical ? '-critical' : ''})"><title>${escapeHtml(id)} → ${escapeHtml(task.id)}${critical ? ': ruta crítica' : ''}</title></path>`;
  })).join('');
  const nodes = schedule.tasks.map((task) => {
    const { x, y } = positions.get(task.id);
    const title = wrapTitle(task.title);
    return `<g class="project-pert-node${task.critical ? ' is-critical' : ''}" transform="translate(${x},${y})"><title>${escapeHtml(task.id)}: ${escapeHtml(task.title)}. Duración ${number(task.duration)} días. Holgura ${number(task.slack)} días.</title><rect width="${nodeWidth}" height="${nodeHeight}" rx="9"/><text x="13" y="21" class="project-pert-node-id">${escapeHtml(task.id)}${task.critical ? ' · CRÍTICA' : ''}</text><text x="13" y="42" class="project-pert-node-title">${title.map((row, index) => `<tspan x="13" dy="${index ? 15 : 0}">${escapeHtml(row)}</tspan>`).join('')}</text><text x="13" y="81" class="project-pert-node-time">${number(task.duration)} d<tspan x="${nodeWidth - 13}" text-anchor="end">H: ${number(task.slack)} d</tspan></text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="project-pert-title project-pert-desc"><title id="project-pert-title">Red de actividades PERT con ruta crítica</title><desc id="project-pert-desc">Las flechas indican dependencias. Las actividades y conexiones naranjas forman la ruta crítica. Los mismos datos están en la tabla editable debajo.</desc><defs><marker id="project-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7" fill="#a3b0a9"/></marker><marker id="project-arrow-critical" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7" fill="#d46b31"/></marker></defs>${arrows}${nodes}</svg>`;
}

function ganttDiagram(schedule) {
  const maximum = Math.max(1, schedule.duration);
  const chartStart = 300;
  const chartWidth = 650;
  const rowHeight = 31;
  const headerHeight = 37;
  const height = headerHeight + schedule.tasks.length * rowHeight + 12;
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => {
    const x = chartStart + index * chartWidth / tickCount;
    return `<text x="${x}" y="18" text-anchor="middle" class="project-gantt-tick">${number(maximum * index / tickCount)}</text><path d="M${x},27V${height - 8}" class="project-gantt-grid"/>`;
  }).join('');
  const bars = schedule.tasks.map((task, index) => {
    const y = headerHeight + index * rowHeight;
    const x = chartStart + task.es / maximum * chartWidth;
    const width = Math.max(2, task.duration / maximum * chartWidth);
    const title = String(task.title).length > 38 ? `${String(task.title).slice(0, 37)}…` : task.title;
    return `<g><title>${escapeHtml(task.id)}: ${escapeHtml(task.title)}. ${escapeHtml(describe(task.owner))}, día ${number(task.es)} a ${number(task.ef)}.</title><text x="17" y="${y + 15}" class="project-gantt-task-id">${escapeHtml(task.id)}</text><text x="35" y="${y + 15}" class="project-gantt-task-title">${escapeHtml(title)}</text><text x="${chartStart - 17}" y="${y + 15}" text-anchor="end" class="project-gantt-owner">${escapeHtml(describe(task.owner))}</text><rect x="${x}" y="${y + 3}" width="${width}" height="18" rx="3" class="project-gantt-bar${task.critical ? ' is-critical' : ''}"/>${width > 29 ? `<text x="${x + 6}" y="${y + 15}" class="project-gantt-duration">${number(task.duration)} d</text>` : ''}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="project-gantt" viewBox="0 0 980 ${height}" width="980" height="${height}" role="img" aria-labelledby="project-gantt-title project-gantt-desc"><title id="project-gantt-title">Cronograma Gantt estimado en días hábiles</title><desc id="project-gantt-desc">Las barras naranjas corresponden a actividades críticas. Los inicios y fines exactos se encuentran en la tabla PERT. No representa el avance real.</desc><text x="17" y="18" class="project-gantt-axis-label">ACTIVIDAD / RESPONSABLE</text>${ticks}${bars}</svg>`;
}

function methodologyMarkup() {
  const methodology = projectData.methodology;
  const description = typeof methodology === 'object' && methodology ? methodology.rationale ?? methodology.description ?? methodology.summary : '';
  const title = typeof methodology === 'string' ? methodology : methodology?.title ?? methodology?.name ?? 'Scrum ligero + CRISP-DM';
  const explanation = describe(description) || 'Scrum organiza las entregas de un equipo de cuatro. CRISP-DM guía la comprensión del problema, los datos, la evaluación y el despliegue de la parte inteligente. El modelo se incorpora solo si demuestra una mejora frente a la referencia fija.';
  return `<div class="project-method-card"><div class="project-eyebrow">METODOLOGÍA PROPUESTA</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(explanation)}</p><div class="project-method-tags"><span>Entregas de 2 semanas</span><span>Revisión con evidencia</span><span>Trabajo visible</span></div></div><div class="project-rhythm-card"><div class="project-eyebrow">CÓMO TRABAJAMOS</div><ul><li><strong>Planificación · 45 min</strong><span>Un objetivo por sprint y tareas con responsable.</span></li><li><strong>Daily · 10 min</strong><span>Avance, siguiente tarea y bloqueos; tablero con WIP limitado.</span></li><li><strong>Revisión + retrospectiva</strong><span>Demostración, métricas, retroalimentación y mejora del proceso.</span></li><li><strong>Definición de terminado</strong><span>Criterios cumplidos, pruebas, revisión por otra persona y documentación.</span></li></ul></div>`;
}

function requirementsMarkup() {
  return asArray(projectData.requirements).map((requirement) => `<details class="project-requirement"><summary><span class="project-requirement-id">${escapeHtml(requirement.id)}</span><span class="project-requirement-title">${escapeHtml(requirement.title)}</span><span class="project-small-tag">${escapeHtml(describe(requirement.priority) || 'MVP')}</span><span class="project-disclosure" aria-hidden="true">+</span></summary><div class="project-requirement-content"><p>${escapeHtml(describe(requirement.story))}</p><h4>Criterios de aceptación</h4><ul>${lines(requirement.acceptance)}</ul>${requirement.type ? `<span class="project-caption">Tipo: ${escapeHtml(describe(requirement.type))}</span>` : ''}</div></details>`).join('');
}

function riskScore(value) {
  const raw = describe(value).toLowerCase();
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric >= 3 ? 'high' : numeric >= 2 ? 'medium' : 'low';
  return /alta|alto|crític|high/.test(raw) ? 'high' : /media|medio|moderad|medium/.test(raw) ? 'medium' : 'low';
}

export function renderProject(container) {
  const tasks = asArray(projectData.pertTasks).map((task) => ({ ...task, dependencies: [...asArray(task.dependencies)] }));
  const roles = asArray(projectData.roles);
  const sprints = asArray(projectData.sprints);
  const defaultContingency = projectData.scheduleSummary?.contingencyRate === 0.2 ? 0.2 : 0.15;
  let initialSchedule;
  let initialError = '';
  try { initialSchedule = calculatePert(tasks); } catch (error) { initialError = error.message; }
  const initialRows = new Map(initialSchedule?.tasks.map((task) => [task.id, task]) ?? []);
  container.innerHTML = `<div class="project-view">
    <header class="project-header"><div><div class="project-eyebrow"><span class="project-accent-dot"></span> DEL PROBLEMA A UN PROTOTIPO VALIDABLE</div><h1>Un plan para <em>mover la ciudad.</em></h1><p>Alcance, equipo y decisiones de ingeniería para convertir una idea en evidencia. Basado en tus notas de Ingeniería de Software.</p></div><div class="project-team-stamp"><strong>04</strong><span>PERSONAS<br>UN MISMO OBJETIVO</span></div></header>
    <nav class="project-section-nav" aria-label="Secciones del proyecto"><a href="#project-method">Metodología</a><a href="#project-sprints">Entregas</a><a href="#project-pert">PERT interactivo</a><a href="#project-team">Equipo</a><a href="#project-scope">Alcance y riesgos</a></nav>
    <section id="project-method" class="project-section">${sectionHeading('01', 'Un proceso ligero, con rigor', 'La gestión del equipo y el ciclo de datos se complementan.') }<div class="project-method-grid">${methodologyMarkup()}</div><p class="project-inline-note"><span aria-hidden="true">↗</span> Propuesta adaptable al curso: las notas comparan metodologías; esta elección busca entregas verificables para cuatro personas. La simulación actual usa reglas adaptativas; no presenta un modelo de aprendizaje como entrenado.</p></section>
    <section id="project-sprints" class="project-section">${sectionHeading('02', 'Entregas que se pueden demostrar', 'Plan de referencia. Los sprints se ajustan al validar requisitos, recursos y disponibilidad.') }<div class="project-sprint-grid">${sprints.map((sprint, index) => `<article class="project-sprint"><div class="project-sprint-top"><span>SPRINT ${String(index + 1).padStart(2, '0')}</span><span>${escapeHtml(typeof sprint.weeks === 'object' ? describe(sprint.weeks) : sprint.weeks ?? '2 semanas')}</span></div><h3>${escapeHtml(sprint.title)}</h3><p>${escapeHtml(describe(sprint.goal))}</p><ul>${lines(sprint.deliverables)}</ul></article>`).join('')}</div></section>
    <section id="project-pert" class="project-section">${sectionHeading('03', 'El tiempo también se modela', 'Modifica las estimaciones y observa qué actividades condicionan la entrega.') }
      <div class="project-pert-card"><div class="project-pert-toolbar"><div><h3>Red PERT / ruta crítica</h3><p>Tiempos en días hábiles · inicio relativo en el día 0</p></div><button type="button" class="project-reset">↺ Restablecer estimaciones</button></div>
      <div class="project-pert-metrics"><div><span>Duración esperada</span><strong data-pert-duration>—</strong><small>días hábiles</small></div><div><span>Con reserva del <select aria-label="Porcentaje de contingencia" class="project-contingency"><option value="0.15"${defaultContingency === 0.15 ? ' selected' : ''}>15 %</option><option value="0.2"${defaultContingency === 0.2 ? ' selected' : ''}>20 %</option></select></span><strong data-pert-buffer>—</strong><small>días · reserva añadida al total</small></div><div><span>Desviación de la ruta</span><strong data-pert-deviation>—</strong><small>días · aproximación PERT</small></div></div>
      <div class="project-pert-legend"><span><i class="project-legend-line is-critical"></i>Ruta crítica · holgura 0</span><span><i class="project-legend-line"></i>Actividad con margen</span><span class="project-scroll-hint">Desliza para explorar la red →</span></div>
      <div class="project-pert-graph" tabindex="0" aria-label="Diagrama PERT con desplazamiento horizontal">${initialSchedule ? pertDiagram(initialSchedule) : ''}</div>
      <div class="project-critical-summary" aria-live="polite"><span>RUTA CRÍTICA</span><strong data-pert-path>—</strong></div>
      <p class="project-resource-note" data-pert-resources role="status" hidden></p>
      <div class="project-pert-instructions"><h4>Ajusta tus tres escenarios</h4><p><strong>To</strong> optimista · <strong>Tm</strong> más probable · <strong>Tp</strong> pesimista. Mantén To ≤ Tm ≤ Tp. TE = (To + 4 × Tm + Tp) / 6; varianza = ((Tp − To) / 6)².</p></div>
      <p class="project-pert-error" role="alert" ${initialError ? '' : 'hidden'}>${escapeHtml(initialError)}</p>
      <div class="project-table-scroll" tabindex="0" aria-label="Tabla de actividades y estimaciones"><table class="project-pert-table"><caption class="project-sr-only">Tiempos editables y cálculo PERT. ES y EF son inicio y fin tempranos; LS y LF son inicio y fin tardíos. H es holgura.</caption><thead><tr><th scope="col">Actividad / responsable</th><th scope="col">Depende de</th><th scope="col"><abbr title="Tiempo optimista">To</abbr></th><th scope="col"><abbr title="Tiempo más probable">Tm</abbr></th><th scope="col"><abbr title="Tiempo pesimista">Tp</abbr></th><th scope="col"><abbr title="Tiempo esperado">TE</abbr></th><th scope="col">Varianza</th><th scope="col"><abbr title="Inicio temprano">ES</abbr></th><th scope="col"><abbr title="Fin temprano">EF</abbr></th><th scope="col"><abbr title="Inicio tardío">LS</abbr></th><th scope="col"><abbr title="Fin tardío">LF</abbr></th><th scope="col"><abbr title="Holgura">H</abbr></th></tr></thead><tbody>${tasks.map((task, index) => { const computed = initialRows.get(task.id); return `<tr data-task-index="${index}"${computed?.critical ? ' class="is-critical"' : ''}><th scope="row"><span class="project-task-title"><b>${escapeHtml(task.id)}</b> ${escapeHtml(task.title)}</span><small>${escapeHtml(describe(task.owner))}</small></th><td class="project-dependencies">${escapeHtml(task.dependencies.join(', ') || '—')}</td>${['optimistic', 'likely', 'pessimistic'].map((key) => `<td><input type="number" min="0" max="3650" step="0.5" inputmode="decimal" value="${escapeHtml(task[key])}" data-estimate="${key}" aria-label="${escapeHtml(task.id)} ${key === 'optimistic' ? 'tiempo optimista' : key === 'likely' ? 'tiempo más probable' : 'tiempo pesimista'}" aria-describedby="project-estimate-help"></td>`).join('')}${['duration', 'variance', 'es', 'ef', 'ls', 'lf', 'slack'].map((key) => `<td data-pert-value="${key}">${computed ? number(computed[key]) : '—'}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>
      <div class="project-pert-footnote" id="project-estimate-help"><p><strong>Cómo leerlo.</strong> ES/EF: inicio/fin tempranos. LS/LF: inicio/fin tardíos. Holgura = LS − ES = LF − EF. La ruta crítica es la secuencia más larga; puede haber más de una.</p><p><strong>Supuestos.</strong> Dependencias fin–inicio, sin feriados ni nivelación de carga. La duración es de calendario laboral, no persona-días. La desviación suma varianzas de la ruta crítica y supone independencia; no es una garantía ni un intervalo de confianza. La reserva es una decisión de planificación.</p></div></div>
      <details class="project-gantt-details"><summary>Ver cronograma de actividades (Gantt)<span aria-hidden="true">↗</span></summary><p>El mismo plan, sobre una línea de tiempo relativa. Las barras muestran ES–EF; no representan avance real. La reserva no se asigna a una actividad.</p><div class="project-table-scroll" tabindex="0" aria-label="Cronograma Gantt con desplazamiento horizontal"><div data-pert-gantt>${initialSchedule ? ganttDiagram(initialSchedule) : ''}</div></div></details>
    </section>
    <section id="project-team" class="project-section">${sectionHeading('04', 'Cuatro personas, responsabilidades claras', 'Roles propuestos; no implican dedicación exclusiva. Las decisiones y revisiones se comparten.') }<div class="project-role-grid">${roles.map((role, index) => `<article class="project-role"><div class="project-role-number">${String(index + 1).padStart(2, '0')}<span>↗</span></div><h3>${escapeHtml(role.name)}</h3><p>${escapeHtml(describe(role.focus))}</p><ul>${lines(role.responsibilities)}</ul></article>`).join('')}</div></section>
    <section id="project-scope" class="project-section">${sectionHeading('05', 'Lo que prometemos, lo que verificamos', 'Requisitos trazables y riesgos con una respuesta concreta.') }<div class="project-scope-note"><span class="project-scope-icon" aria-hidden="true">◎</span><div><strong>Un prototipo de apoyo a decisiones</strong><p>Modela un cruce y compara estrategias en condiciones controladas. Una conexión con semáforos reales requiere autorización, ingeniería de seguridad, validación de campo y supervisión humana. No se opera infraestructura vial.</p></div></div><div class="project-requirements">${requirementsMarkup()}</div>
      <h3 class="project-subheading">Matriz de riesgos</h3><div class="project-table-scroll"><table class="project-risk-table"><caption class="project-sr-only">Riesgos del proyecto: probabilidad, impacto y mitigación.</caption><thead><tr><th scope="col">Riesgo</th><th scope="col">Probabilidad</th><th scope="col">Impacto</th><th scope="col">Respuesta / mitigación</th></tr></thead><tbody>${asArray(projectData.risks).map((risk) => `<tr><th scope="row"><small>${escapeHtml(risk.id)}</small>${escapeHtml(risk.title)}</th><td><span class="project-risk-badge is-${riskScore(risk.probability)}">${escapeHtml(describe(risk.probability) || String(risk.probability ?? 'Por evaluar'))}</span></td><td><span class="project-risk-badge is-${riskScore(risk.impact)}">${escapeHtml(describe(risk.impact) || String(risk.impact ?? 'Por evaluar'))}</span></td><td>${escapeHtml(describe(risk.mitigation))}</td></tr>`).join('')}</tbody></table></div>
    </section>
    <section class="project-section project-references">${sectionHeading('06', 'De tus notas a este proyecto', 'Trazabilidad del documento “Ingeniería de Software para Sistemas Inteligentes”.') }<div class="project-reference-grid">${asArray(projectData.notesReferences).map((reference) => `<article><span class="project-reference-page">PÁG. ${escapeHtml(Array.isArray(reference.pages) ? reference.pages.join(', ') : reference.pages)}</span><h3>${escapeHtml(reference.topic)}</h3><p>${escapeHtml(describe(reference.application))}</p>${reference.caveat ? `<p class="project-reference-caveat">${escapeHtml(describe(reference.caveat))}</p>` : ''}</article>`).join('')}</div><div class="project-closing-note"><strong>Una estimación es una hipótesis.</strong><p>Este plan sirve para conversar, medir y ajustar. Las fechas finales y los responsables se acuerdan con el equipo; el cronograma no constituye un compromiso contractual.</p></div></section>
  </div>`;

  const update = () => {
    const errorElement = container.querySelector('.project-pert-error');
    const nextTasks = tasks.map((task, index) => {
      const row = container.querySelector(`[data-task-index="${index}"]`);
      const copy = { ...task };
      const inputs = [...row.querySelectorAll('input')];
      for (const input of inputs) copy[input.dataset.estimate] = input.value === '' ? NaN : Number(input.value);
      const invalid = inputs.some((input) => input.value === '' || !Number.isFinite(Number(input.value)) || Number(input.value) < 0 || Number(input.value) > 3650) || copy.optimistic > copy.likely || copy.likely > copy.pessimistic;
      for (const input of inputs) input.setAttribute('aria-invalid', String(invalid));
      return copy;
    });
    try {
      if (nextTasks.some((task) => [task.optimistic, task.likely, task.pessimistic].some((time) => time > 3650))) throw new Error('El límite por estimación es de 3650 días. Usa valores entre 0 y 3650.');
      const schedule = calculatePert(nextTasks);
      errorElement.hidden = true;
      errorElement.textContent = '';
      container.querySelector('[data-pert-duration]').textContent = number(schedule.duration);
      const contingency = Number(container.querySelector('.project-contingency').value);
      container.querySelector('[data-pert-buffer]').textContent = number(schedule.duration * (1 + contingency));
      container.querySelector('[data-pert-deviation]').textContent = number(schedule.standardDeviation);
      const paths = schedule.criticalPaths.map((path) => path.ids.join(' → '));
      container.querySelector('[data-pert-path]').textContent = paths.length ? paths.join('  /  ') : 'Sin actividades críticas';
      container.querySelector('.project-pert-graph').innerHTML = pertDiagram(schedule);
      container.querySelector('[data-pert-gantt]').innerHTML = ganttDiagram(schedule);
      const resources = container.querySelector('[data-pert-resources]');
      resources.hidden = !schedule.resourceConflicts.length;
      resources.textContent = schedule.resourceConflicts.length ? `Revisar capacidad del equipo: ${schedule.resourceConflicts.map((conflict) => `${conflict.owner} tiene solape entre ${conflict.activities.join(' y ')}`).join('; ')}. El cálculo CPM no nivela recursos; acuerden disponibilidad antes de fijar fechas.` : '';
      const computed = new Map(schedule.tasks.map((task) => [task.id, task]));
      tasks.forEach((task, index) => {
        const row = container.querySelector(`[data-task-index="${index}"]`);
        const result = computed.get(task.id);
        row.classList.toggle('is-critical', result.critical);
        row.querySelectorAll('[data-pert-value]').forEach((cell) => { cell.textContent = number(result[cell.dataset.pertValue]); });
      });
    } catch (error) {
      errorElement.hidden = false;
      errorElement.textContent = `${error.message} Los resultados conservan el último cálculo válido.`;
    }
  };
  container.querySelector('.project-pert-table').addEventListener('input', update);
  container.querySelectorAll('.project-section-nav a').forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault();
    const section = container.querySelector(link.getAttribute('href'));
    const heading = section?.querySelector('h2');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
    section?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }));
  container.querySelector('.project-contingency').addEventListener('change', update);
  container.querySelector('.project-reset').addEventListener('click', () => {
    tasks.forEach((task, index) => {
      const row = container.querySelector(`[data-task-index="${index}"]`);
      for (const input of row.querySelectorAll('input')) input.value = task[input.dataset.estimate];
    });
    container.querySelector('.project-contingency').value = String(defaultContingency);
    update();
  });
  if (initialSchedule) update();
  return { calculatePert, refresh: update };
}
