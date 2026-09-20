import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine.js';
import { contains, COMPLEMENT } from '../src/chemistry.js';

const empty = (overrides = {}) => new World({ seed: 'LAB', initialParticles: 0, mineralCount: 0, food: 0, ...overrides }, true);
const clone = data => JSON.parse(JSON.stringify(data));
function balance(w) {
  const t = w.totals;
  assert.equal(w.particles.length, t.initial + t.influx + t.injected - t.outflux);
  assert.equal(new Set(w.particles.map(p => p.id)).size, w.particles.length);
  assert.ok(w.particles.every(p => [p.x, p.y, p.vx, p.vy, p.energy].every(Number.isFinite) && p.energy >= 0));
  assert.ok(w.bonds.every(b => w.byId.has(b.a) && w.byId.has(b.b)));
}
function ring(w, x = 300, y = 250, radius = 35, count = 20) {
  const ps = Array.from({ length: count }, (_, i) => w.add('lipid', x + Math.cos(i / count * Math.PI * 2) * radius, y + Math.sin(i / count * Math.PI * 2) * radius));
  ps.forEach((p, i) => w.link(p, ps[(i + 1) % count])); return ps;
}
function chain(w, sequence = 'AUGC', x = 290, y = 250) {
  const ps = [...sequence].map((base, i) => w.add('nucleotide', x + i * 8, y, { base, energy: 1 }));
  ps.slice(1).forEach((p, i) => w.link(ps[i], p)); return ps;
}

test('a primordial start contains only free building blocks, with a reproducible seed', () => {
  const a = new World({ initialParticles: 240, seed: 'IDENTICAL' });
  const b = new World({ initialParticles: 240, seed: 'IDENTICAL' });
  assert.equal(a.bonds.length, 0); assert.equal(a.cells.length, 0);
  assert.equal(a.particles.length, 240);
  a.step(180); b.step(180);
  assert.deepEqual(a.save(), b.save()); balance(a);
});

test('all three starting stages conserve packets and stay finite while running', () => {
  for (const stage of ['molecules', 'prokaryotic', 'eukaryotic']) {
    const w = new World({ stage, initialParticles: 180, particleLimit: 1200, seed: `STAGE-${stage}` });
    assert.ok(w.particles.some(p => w.degree(p.id) === 0));
    if (stage === 'molecules') assert.equal(w.cells.length, 0);
    else assert.ok(w.cells.some(c => c.alive));
    if (stage === 'eukaryotic') assert.ok(w.cells.some(c => c.nested));
    w.step(600); balance(w);
  }
});

test('a closed actual bond cycle defines a compartment, and rupturing it removes that boundary', () => {
  const w = empty(); const ps = ring(w); chain(w); w.add('catalyst', 300, 259);
  w.detectStructures(); assert.equal(w.cells.length, 1); assert.equal(w.cells[0].alive, true);
  w.bonds = w.bonds.filter(b => b.a !== ps[0].id && b.b !== ps[0].id); w.indexBonds(); w.detectStructures();
  assert.equal(w.cells.length, 0); assert.equal(w.totals.ruptures, 1);
});

test('copying requires substrate and catalyst, conserves material, and credits only completed descendants', () => {
  const w = empty({ mutation: 0, temperature: 28 }); const original = chain(w);
  w.rebuildGrid(); w.polymerChemistry(1); assert.equal(w.totals.copies, 0);
  const cat = w.add('catalyst', 300, 241, { energy: 3 });
  w.rebuildGrid(); w.polymerChemistry(1); assert.equal(w.totals.copies, 0);
  const units = original.map((p, i) => w.add('nucleotide', 290 + i * 8, 261, { base: COMPLEMENT[p.base], energy: 1 }));
  w.totals.initial = w.particles.length;
  for (let i = 0; i < 80 && w.totals.copies === 0; i++) {
    cat.energy = 3; w.rebuildGrid(); w.polymerChemistry(1);
    if (!w.totals.copies) assert.equal(w.stats().maxGeneration, 0);
  }
  assert.equal(w.totals.copies, 1); assert.equal(w.stats().maxGeneration, 1);
  assert.deepEqual(units.map(p => p.base), original.map(p => COMPLEMENT[p.base]));
  assert.ok(units.every(p => p.generation === 1 && !p.copying));
  assert.ok(w.polymers().some(g => g.length === 4 && g.every(p => units.includes(p)))); balance(w);
});

test('template chemistry cannot recruit through a sealed membrane', () => {
  const w = empty(); ring(w, 300, 250, 26, 16); chain(w, 'AUGC', 288, 250);
  w.add('catalyst', 300, 246, { energy: 3 });
  for (const base of 'UACG') w.add('nucleotide', 337, 250, { base, energy: 1 });
  w.rebuildGrid(); w.detectStructures();
  for (let i = 0; i < 40; i++) w.polymerChemistry(1);
  assert.equal(w.totals.copies, 0); assert.ok(w.particles.every(p => !p.copying));
});

test('geometric neck reconnection creates two actual cycles without duplicating particles', () => {
  const w = empty(); const ps = ring(w, 300, 250, 40, 24); const count = w.particles.length;
  // Bring opposite membrane nodes together; other vertices keep both lobes open.
  ps[0].x = 301; ps[0].y = 250; ps[12].x = 299; ps[12].y = 250;
  w.detectStructures(); assert.equal(w.cells.length, 1);
  w.fissionTopology(w.cells[0], ps); w.detectStructures();
  assert.equal(w.cells.length, 2); assert.equal(w.particles.length, count);
  assert.equal(new Set(w.cells.flatMap(c => c.ids)).size, count);
});

test('resizing translates an enclosure and all its contents together', () => {
  const w = empty(); const ps = ring(w, 400, 350); const rna = chain(w, 'AUGC', 385, 350);
  w.add('catalyst', 400, 358); w.detectStructures();
  const before = new Map(w.particles.map(p => [p.id, { x: p.x, y: p.y }]));
  w.configure({ width: 1800, height: 1400 });
  const dx = ps[0].x - before.get(ps[0].id).x, dy = ps[0].y - before.get(ps[0].id).y;
  for (const p of w.particles) { assert.ok(Math.abs(p.x - before.get(p.id).x - dx) < 1e-8); assert.ok(Math.abs(p.y - before.get(p.id).y - dy) < 1e-8); }
  assert.ok(rna.every(p => contains(ps, p.x, p.y)));
});

test('JSON checkpoints resume the exact dynamics, including the next unused ID', () => {
  const w = new World({ stage: 'prokaryotic', initialParticles: 140, seed: 'CHECKPOINT' });
  w.step(157); const data = clone(w.save()); data.nextId += 10;
  const a = World.load(data), b = World.load(data);
  assert.deepEqual(a.save(), data);
  w.id = data.nextId; w.step(90); a.step(90); b.step(90);
  assert.deepEqual(a.save(), w.save()); assert.deepEqual(a.save(), b.save()); balance(a);
});

test('saved partial copies remain exact after restore', () => {
  const w = empty({ mutation: 0 }); chain(w); w.add('catalyst', 300, 240, { energy: 3 }); w.add('nucleotide', 300, 260, { base: 'U', energy: 1 });
  w.totals.initial = w.particles.length; w.rebuildGrid();
  for (let i = 0; i < 20 && !w.particles.some(p => p.copying); i++) w.polymerChemistry(1);
  assert.ok(w.particles.some(p => p.copying)); const saved = clone(w.save()); const restored = World.load(saved);
  assert.deepEqual(restored.save(), saved); w.step(90); restored.step(90); assert.deepEqual(restored.save(), w.save());
});

test('invalid world files are rejected without mutating the running world', () => {
  const w = new World({ stage: 'prokaryotic', initialParticles: 30 }); const before = clone(w.save());
  for (const corrupt of [d => d.particles[0].x = null, d => d.particles[1].id = d.particles[0].id, d => d.bonds.push(d.bonds[0]), d => d.nextId = 1, d => d.history = {}, d => d.totals.initial++, d => d.templates = [[999999, {}]]]) {
    const data = clone(before); corrupt(data); assert.throws(() => World.load(data));
  }
  assert.deepEqual(w.save(), before);
});

test('environment boundaries and the particle budget hold under extreme settings', () => {
  const w = new World({ width: 600, height: 500, shape: 'ellipse', temperature: 80, ph: 4, salinity: 70, mixing: 1.5, food: 1.5, particleLimit: 400, initialParticles: 390, mineralCount: 0 });
  w.step(480); balance(w); assert.ok(w.particles.length <= 400);
  assert.ok(w.particles.every(p => Math.hypot((p.x - 300) / 291, (p.y - 250) / 241) <= 1.000001));
  const n = w.particles.length; assert.throws(() => w.inject({ particles: Array.from({ length: 30 }, (_, id) => ({ id, type: 'food', x: id, y: 0 })), bonds: [] })); assert.equal(w.particles.length, n);
});

test('builder injections use submitted geometry and record introduced material', () => {
  const w = empty();
  const id = w.inject({ particles: [{ id: 1, type: 'lipid', x: 0, y: 0 }, { id: 2, type: 'lipid', x: 11, y: 0 }], bonds: [{ a: 1, b: 2, kind: 'lipid' }] }, 200, 200);
  assert.equal(w.byId.get(id).x, 200); assert.equal(w.particles[1].x, 211); assert.equal(w.bonds.length, 1); assert.equal(w.totals.injected, 2); balance(w);
});
