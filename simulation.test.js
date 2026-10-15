import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, phaseAt, simulateComparison } from '../public/simulation.js';

test('paired simulations are reproducible, seed-sensitive, and do not mutate configuration', () => {
  const config = { seed: 0, duration: 180 };
  const original = { ...config };
  const first = simulateComparison(config);
  assert.deepEqual(first, simulateComparison(config));
  assert.notDeepEqual(first.arrivals, simulateComparison({ ...config, seed: 1 }).arrivals);
  assert.deepEqual(config, original);
  assert.equal(DEFAULT_CONFIG.seed, 42);
});

test('both strategies receive precisely the same vehicles and conserve each axis at every second', () => {
  const result = simulateComparison({ seed: 81, duration: 900 });
  const arrivedNS = result.arrivals.reduce((sum, item) => sum + item.ns, 0);
  const arrivedEW = result.arrivals.reduce((sum, item) => sum + item.ew, 0);
  for (const strategy of [result.fixed, result.adaptive]) {
    const metrics = strategy.metrics;
    assert.equal(metrics.arrivedNS, arrivedNS);
    assert.equal(metrics.arrivedEW, arrivedEW);
    assert.equal(metrics.arrived, metrics.passed + metrics.remaining);
    assert.equal(arrivedNS, metrics.passedNS + metrics.remainingNS);
    assert.equal(arrivedEW, metrics.passedEW + metrics.remainingEW);
    let ns = 0;
    let ew = 0;
    let passed = 0;
    let area = 0;
    strategy.departures.forEach((departure, index) => {
      ns += result.arrivals[index].ns - departure.ns;
      ew += result.arrivals[index].ew - departure.ew;
      passed += departure.ns + departure.ew;
      const snapshot = strategy.history[index + 1];
      assert.equal(snapshot.queueNS, ns);
      assert.equal(snapshot.queueEW, ew);
      assert.equal(snapshot.passed, passed);
      assert.ok(ns >= 0 && ew >= 0);
      area += ns + ew;
    });
    assert.equal(metrics.queueVehicleSeconds, area);
    assert.equal(metrics.meanWait, area / metrics.arrived);
    assert.equal(metrics.meanQueue, area / result.config.duration);
    assert.equal(metrics.throughput, metrics.passed * 3600 / result.config.duration);
  }
});

test('all adaptive cycles preserve green budget, limits and both clearance intervals', () => {
  const result = simulateComparison({ demandNS: 4200, demandEW: 25, duration: 900 });
  const { config, cycleLength } = result;
  for (const strategy of [result.fixed, result.adaptive]) {
    for (const plan of strategy.timings) {
      assert.equal(plan.greenNS + plan.greenEW + 2 * config.clearance, cycleLength);
      assert.ok(plan.greenNS >= config.minGreen && plan.greenNS <= config.maxGreen);
      assert.ok(plan.greenEW >= config.minGreen && plan.greenEW <= config.maxGreen);
      const phases = Array.from({ length: cycleLength }, (_, time) => phaseAt(time, plan, config.clearance));
      assert.equal(phases.filter((phase) => phase === 'NS').length, plan.greenNS);
      assert.equal(phases.filter((phase) => phase === 'EW').length, plan.greenEW);
      assert.equal(phases.filter((phase) => phase === 'clearance').length, 2 * config.clearance);
      assert.equal(phaseAt(plan.greenNS, plan, config.clearance), 'clearance');
      assert.equal(phaseAt(plan.greenNS + config.clearance, plan, config.clearance), 'EW');
      assert.equal(phaseAt(cycleLength - 1, plan, config.clearance), 'clearance');
      assert.equal(phaseAt(cycleLength, plan, config.clearance), 'NS');
    }
    strategy.departures.forEach((departure) => {
      assert.ok(!(departure.ns > 0 && departure.ew > 0));
      if (departure.phase === 'clearance') assert.equal(departure.ns + departure.ew, 0);
      if (departure.phase === 'NS') assert.equal(departure.ew, 0);
      if (departure.phase === 'EW') assert.equal(departure.ns, 0);
      const plan = strategy.timings[Math.floor(departure.time / cycleLength)];
      assert.equal(departure.phase, phaseAt(departure.time, plan, config.clearance));
    });
  }
  assert.equal(result.adaptive.timings[0].greenNS, config.greenNS);
  assert.ok(result.adaptive.timings.some((plan) => plan.greenNS > config.greenNS));
});

test('zero demand has no phantom vehicles, NaN metrics or banked departures', () => {
  const result = simulateComparison({ demandNS: 0, demandEW: 0 });
  for (const strategy of [result.fixed, result.adaptive]) {
    for (const value of Object.values(strategy.metrics)) {
      assert.equal(value, 0);
    }
    assert.ok(strategy.departures.every(({ ns, ew }) => ns === 0 && ew === 0));
  }
  assert.deepEqual(result.fixed, result.adaptive);
});

test('strong congestion leaves an explicit residual queue and warns about capacity', () => {
  const result = simulateComparison({ demandNS: 4500, demandEW: 4500, duration: 900 });
  assert.ok(result.warnings.some((warning) => warning.includes('capacidad')));
  for (const strategy of [result.fixed, result.adaptive]) {
    assert.ok(strategy.metrics.remaining > 1000);
    assert.ok(strategy.metrics.meanWait > 100);
    assert.ok(strategy.metrics.passed <= Math.ceil(result.config.saturation * result.config.duration / 3600));
    assert.equal(strategy.metrics.remaining, strategy.history.at(-1).queueNS + strategy.history.at(-1).queueEW);
  }
});

test('default adaptive allocation provides a plausible improvement, without promising universal superiority', () => {
  const result = simulateComparison();
  assert.ok(result.adaptive.metrics.meanWait < result.fixed.metrics.meanWait);
  assert.ok(result.adaptive.metrics.passed >= result.fixed.metrics.passed);
  // Balanced demand can favor a stable fixed plan over noise-sensitive adaptation.
  const balanced = simulateComparison({ demandNS: 700, demandEW: 700, greenNS: 40, greenEW: 40, duration: 900, seed: 42 });
  assert.ok(balanced.adaptive.metrics.meanWait > balanced.fixed.metrics.meanWait);
});

test('only observations from completed cycles affect the next adaptive allocation', () => {
  const first = simulateComparison({ seed: 15, duration: 180 });
  const longer = simulateComparison({ seed: 15, duration: 900 });
  assert.deepEqual(first.arrivals, longer.arrivals.slice(0, 180));
  assert.deepEqual(first.adaptive.timings, longer.adaptive.timings.slice(0, 2));
  assert.deepEqual(first.adaptive.history, longer.adaptive.history.slice(0, 181));
});

test('invalid, unsafe and non-finite configuration is rejected rather than coerced', () => {
  const bad = [
    null, [], 'config',
    { demandNS: -1 }, { demandEW: Infinity }, { demandNS: NaN },
    { demandNS: '1000' }, { demandNS: 10001 },
    { clearance: 0 }, { clearance: 1.5 },
    { seed: -1 }, { seed: 4294967296 }, { seed: 1.1 },
    { duration: 0 }, { duration: 7201 }, { duration: 100.5 },
    { minGreen: 80, maxGreen: 20 }, { greenNS: 5 }, { greenEW: 90 },
    { saturation: 0 },
  ];
  for (const config of bad) {
    assert.throws(() => simulateComparison(config));
  }
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.throws(() => phaseAt(-1, { greenNS: 45, greenEW: 35 }, 5));
  assert.throws(() => phaseAt(0, { greenNS: 45, greenEW: 35 }, 0));
});

test('changing the time horizon preserves pending vehicles and reports a partial cycle', () => {
  const result = simulateComparison({ duration: 101 });
  assert.equal(result.fixed.history.length, 102);
  assert.equal(result.arrivals.length, 101);
  assert.ok(result.warnings.some((warning) => warning.includes('dentro de un ciclo')));
  assert.ok(result.warnings.some((warning) => warning.includes('menos de tres ciclos')));
});
