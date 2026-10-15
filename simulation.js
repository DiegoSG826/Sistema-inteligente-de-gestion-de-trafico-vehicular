/**
 * Educational, isolated-intersection simulator. No external traffic data, trained
 * model, field calibration, pedestrian movements, or real signal control.
 *
 * Each second receives integer Poisson arrivals; both controllers receive the
 * very same sample. Service is accumulated only during a compatible green.
 * Queue area includes vehicles still waiting when the horizon ends.
 */
export const DEFAULT_CONFIG = Object.freeze({
  demandNS: 1100,
  demandEW: 650,
  greenNS: 45,
  greenEW: 35,
  clearance: 5,
  minGreen: 15,
  maxGreen: 75,
  duration: 900,
  seed: 42,
  saturation: 1800,
});

const BOUNDS = Object.freeze({
  demandNS: [0, 10000],
  demandEW: [0, 10000],
  greenNS: [1, 300],
  greenEW: [1, 300],
  clearance: [1, 30],
  minGreen: [1, 300],
  maxGreen: [1, 300],
  duration: [60, 7200],
  seed: [0, 4294967295],
  saturation: [1, 7200],
});

const INTEGER_FIELDS = new Set([
  'greenNS', 'greenEW', 'clearance', 'minGreen', 'maxGreen', 'duration', 'seed',
]);

/** Validate partial configuration without coercion or mutating the caller. */
export function normalizeConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('La configuración debe ser un objeto.');
  }
  const config = {};
  for (const [field, [min, max]] of Object.entries(BOUNDS)) {
    const value = input[field] === undefined ? DEFAULT_CONFIG[field] : input[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`${field} debe ser un número finito.`);
    }
    if (value < min || value > max || (INTEGER_FIELDS.has(field) && !Number.isInteger(value))) {
      throw new RangeError(`${field} debe estar entre ${min} y ${max}${INTEGER_FIELDS.has(field) ? ' y ser entero' : ''}.`);
    }
    config[field] = value;
  }
  if (config.minGreen > config.maxGreen) {
    throw new RangeError('El verde mínimo no puede superar el máximo.');
  }
  for (const field of ['greenNS', 'greenEW']) {
    if (config[field] < config.minGreen || config[field] > config.maxGreen) {
      throw new RangeError(`${field} debe respetar los límites mínimo y máximo de verde.`);
    }
  }
  return config;
}

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda, random) {
  if (lambda === 0) return 0;
  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  do {
    count += 1;
    product *= random();
  } while (product > limit);
  return count - 1;
}

/**
 * Phase at elapsed seconds within (or beyond) a cycle:
 * NS green → all-red clearance → EW green → all-red clearance.
 * Clearance represents the entire transition interval; yellow is not modeled.
 */
export function phaseAt(elapsed, plan, clearance) {
  if (!Number.isFinite(elapsed) || elapsed < 0
    || !plan || !Number.isFinite(plan.greenNS) || plan.greenNS <= 0
    || !Number.isFinite(plan.greenEW) || plan.greenEW <= 0
    || !Number.isFinite(clearance) || clearance <= 0) {
    throw new RangeError('La fase requiere tiempos positivos y un instante finito no negativo.');
  }
  const cycleLength = plan.greenNS + plan.greenEW + 2 * clearance;
  const offset = elapsed % cycleLength;
  if (offset < plan.greenNS) return 'NS';
  if (offset < plan.greenNS + clearance) return 'clearance';
  if (offset < plan.greenNS + clearance + plan.greenEW) return 'EW';
  return 'clearance';
}

function chooseAdaptivePlan(config, queues, estimates, cycleLength) {
  const greenBudget = config.greenNS + config.greenEW;
  // Next-cycle forecast plus the vehicles already waiting. Estimates are
  // observed Poisson arrivals, smoothed once per cycle; no future data is read.
  const scoreNS = queues.ns + estimates.ns * cycleLength;
  const scoreEW = queues.ew + estimates.ew * cycleLength;
  if (scoreNS + scoreEW === 0) {
    return { greenNS: config.greenNS, greenEW: config.greenEW };
  }
  const lower = Math.max(config.minGreen, greenBudget - config.maxGreen);
  const upper = Math.min(config.maxGreen, greenBudget - config.minGreen);
  const proportional = Math.round(greenBudget * scoreNS / (scoreNS + scoreEW));
  const greenNS = Math.min(upper, Math.max(lower, proportional));
  return { greenNS, greenEW: greenBudget - greenNS };
}

function simulate(config, arrivals, adaptive, cycleLength) {
  const queues = { ns: 0, ew: 0 };
  const credits = { ns: 0, ew: 0 };
  const estimates = { ns: config.demandNS / 3600, ew: config.demandEW / 3600 };
  const observed = { ns: 0, ew: 0 };
  const totals = { arrivedNS: 0, arrivedEW: 0, passedNS: 0, passedEW: 0 };
  const timings = [];
  const departures = [];
  const history = [];
  let area = 0;
  let maxQueue = 0;
  let maxQueueNS = 0;
  let maxQueueEW = 0;
  let plan;

  for (let time = 0; time < config.duration; time += 1) {
    if (time % cycleLength === 0) {
      if (time > 0) {
        estimates.ns = 0.5 * estimates.ns + 0.5 * observed.ns / cycleLength;
        estimates.ew = 0.5 * estimates.ew + 0.5 * observed.ew / cycleLength;
        observed.ns = 0;
        observed.ew = 0;
      }
      // Both controllers start with the configured plan. The adaptive
      // controller must observe a completed cycle before its first revision.
      plan = adaptive && time > 0
        ? chooseAdaptivePlan(config, queues, estimates, cycleLength)
        : { greenNS: config.greenNS, greenEW: config.greenEW };
      timings.push({ cycle: time / cycleLength + 1, time, ...plan });
      if (time === 0) {
        history.push({ time: 0, queueNS: 0, queueEW: 0, passed: 0, ...plan, phase: 'NS', cycle: 1 });
      }
    }

    const sample = arrivals[time];
    queues.ns += sample.ns;
    queues.ew += sample.ew;
    observed.ns += sample.ns;
    observed.ew += sample.ew;
    totals.arrivedNS += sample.ns;
    totals.arrivedEW += sample.ew;

    const phase = phaseAt(time % cycleLength, plan, config.clearance);
    let passedNS = 0;
    let passedEW = 0;
    if (phase === 'NS' || phase === 'EW') {
      const axis = phase === 'NS' ? 'ns' : 'ew';
      credits[axis] += config.saturation / 3600;
      const served = Math.min(queues[axis], Math.floor(credits[axis] + 1e-10));
      queues[axis] -= served;
      credits[axis] -= served;
      // Unused green cannot accumulate a bank of future vehicle departures.
      if (queues[axis] === 0) credits[axis] = 0;
      if (axis === 'ns') passedNS = served;
      else passedEW = served;
    }
    totals.passedNS += passedNS;
    totals.passedEW += passedEW;
    departures.push({ time, ns: passedNS, ew: passedEW, phase });

    const queue = queues.ns + queues.ew;
    area += queue;
    maxQueue = Math.max(maxQueue, queue);
    maxQueueNS = Math.max(maxQueueNS, queues.ns);
    maxQueueEW = Math.max(maxQueueEW, queues.ew);
    history.push({
      time: time + 1,
      queueNS: queues.ns,
      queueEW: queues.ew,
      passed: totals.passedNS + totals.passedEW,
      ...plan,
      phase,
      cycle: Math.floor(time / cycleLength) + 1,
    });
  }

  const arrived = totals.arrivedNS + totals.arrivedEW;
  const passed = totals.passedNS + totals.passedEW;
  return {
    metrics: {
      ...totals,
      arrived,
      passed,
      remaining: queues.ns + queues.ew,
      remainingNS: queues.ns,
      remainingEW: queues.ew,
      queueVehicleSeconds: area,
      // Truncated waiting per arrival, including unfinished vehicles; not the
      // eventual full travel delay or an average over completed vehicles only.
      meanWait: arrived === 0 ? 0 : area / arrived,
      meanQueue: area / config.duration,
      maxQueue,
      maxQueueNS,
      maxQueueEW,
      throughput: passed * 3600 / config.duration,
    },
    history,
    timings,
    departures,
  };
}

/** Reproducible paired experiment with identical demand, duration, and seed. */
export function simulateComparison(input = {}) {
  const config = normalizeConfig(input);
  const cycleLength = config.greenNS + config.greenEW + 2 * config.clearance;
  const random = randomGenerator(config.seed);
  const arrivals = Array.from({ length: config.duration }, (_, time) => ({
    time,
    ns: poisson(config.demandNS / 3600, random),
    ew: poisson(config.demandEW / 3600, random),
  }));
  const warnings = [];
  const effectiveCapacity = config.saturation * (config.greenNS + config.greenEW) / cycleLength;
  if (config.demandNS + config.demandEW > effectiveCapacity) {
    warnings.push('La demanda configurada supera la capacidad teórica del cruce; pueden crecer las colas en ambas estrategias.');
  }
  if (config.duration < cycleLength * 3) {
    warnings.push('El horizonte cubre menos de tres ciclos: la fase inicial y el azar pueden dominar la comparación.');
  }
  if (config.duration % cycleLength !== 0) {
    warnings.push('El horizonte termina dentro de un ciclo; el corte puede favorecer una fase y deja vehículos pendientes.');
  }
  return {
    config,
    cycleLength,
    arrivals,
    warnings,
    fixed: simulate(config, arrivals, false, cycleLength),
    adaptive: simulate(config, arrivals, true, cycleLength),
  };
}
