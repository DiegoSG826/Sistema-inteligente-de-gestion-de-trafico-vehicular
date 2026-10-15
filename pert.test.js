import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePert } from '../public/project-view.js';

const activity = (id, optimistic, likely, pessimistic, dependencies = []) => ({
  id, title: id, optimistic, likely, pessimistic, dependencies,
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('PERT forward and backward passes handle merging branches and independent terminal activities', () => {
  const tasks = [
    activity('A', 1, 2, 3),
    activity('B', 2, 3, 4, ['A']),
    activity('C', 1, 1, 1, ['A']),
    activity('D', 2, 2, 2, ['B', 'C']),
    activity('E', 0, 1, 2),
  ];
  const before = structuredClone(tasks);
  const result = calculatePert(tasks);
  const byId = new Map(result.tasks.map((task) => [task.id, task]));
  assert.equal(result.duration, 7);
  assert.deepEqual(result.criticalPaths.map((path) => path.ids), [['A', 'B', 'D']]);
  assert.deepEqual(result.criticalEdges, [['A', 'B'], ['B', 'D']]);
  for (const [id, times] of Object.entries({
    A: [0, 2, 0, 2, 0],
    B: [2, 5, 2, 5, 0],
    C: [2, 3, 4, 5, 2],
    D: [5, 7, 5, 7, 0],
    E: [0, 1, 6, 7, 6],
  })) {
    const task = byId.get(id);
    assert.deepEqual([task.es, task.ef, task.ls, task.lf, task.slack], times);
  }
  close(result.variance, 2 / 9);
  close(result.standardDeviation, Math.sqrt(2 / 9));
  assert.deepEqual(tasks, before);
});

test('tied critical paths are both reported; variance uses the most variable path, not their sum', () => {
  const result = calculatePert([
    activity('A', 1, 1, 1),
    activity('B', 0, 3, 6, ['A']),
    activity('C', 2, 3, 4, ['A']),
    activity('D', 1, 1, 1, ['B', 'C']),
  ]);
  assert.equal(result.duration, 5);
  assert.deepEqual(result.criticalPaths.map((path) => path.ids), [['A', 'B', 'D'], ['A', 'C', 'D']]);
  assert.ok(result.tasks.every((task) => task.critical && task.slack === 0));
  close(result.criticalPaths[0].variance, 1);
  close(result.criticalPaths[1].variance, 1 / 9);
  close(result.variance, 1);
  close(result.standardDeviation, 1);
});

test('fractional expected durations retain precision and dependencies work in any input order', () => {
  const result = calculatePert([
    activity('C', 0, 0.5, 2, ['B', 'B']),
    activity('B', 0, 1, 3, ['A']),
    activity('A', 0, 0, 1),
  ]);
  assert.deepEqual(result.tasks.map((task) => task.id), ['A', 'B', 'C']);
  assert.deepEqual(result.tasks.at(-1).dependencies, ['B']);
  close(result.tasks[0].duration, 1 / 6);
  close(result.tasks[1].duration, 7 / 6);
  close(result.tasks[2].duration, 2 / 3);
  close(result.duration, 2);
  close(result.variance, 14 / 36);
  assert.deepEqual(result.criticalPaths[0].ids, ['A', 'B', 'C']);
});

test('zero-duration milestones do not inflate project duration or uncertainty', () => {
  const result = calculatePert([
    activity('Inicio', 0, 0, 0),
    activity('Trabajo', 2, 2, 2, ['Inicio']),
    activity('Cierre', 0, 0, 0, ['Trabajo']),
  ]);
  assert.equal(result.duration, 2);
  assert.equal(result.variance, 0);
  assert.equal(result.standardDeviation, 0);
  assert.deepEqual(result.criticalPaths[0].ids, ['Inicio', 'Trabajo', 'Cierre']);
});

test('PERT rejects missing dependencies, cycles, repeated IDs and invalid time estimates', () => {
  const invalid = [
    [],
    [activity('A', 1, 1, 1, ['missing'])],
    [activity('A', 1, 1, 1, ['A'])],
    [activity('A', 1, 1, 1, ['B']), activity('B', 1, 1, 1, ['A'])],
    [activity('A', 1, 1, 1), activity('A', 2, 2, 2)],
    [activity('', 1, 1, 1)],
    [activity('A', -1, 1, 2)],
    [activity('A', 2, 1, 3)],
    [activity('A', 1, 3, 2)],
    [activity('A', 1, Infinity, 3)],
    [activity('A', 1, NaN, 3)],
  ];
  for (const tasks of invalid) assert.throws(() => calculatePert(tasks));
});
