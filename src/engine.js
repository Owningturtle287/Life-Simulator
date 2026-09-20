import { TYPES, BASES, COMPLEMENT, DEFAULTS, Random, clamp, hash, contains, polygonArea, sanitizeConfig } from './chemistry.js';

const DT = 1 / 60;
const GRID = 38;
const keyFor = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;

export class World {
  constructor(config = {}, empty = false) {
    this.config = sanitizeConfig(config); this.rng = new Random(this.config.seed);
    this.particles = []; this.bonds = []; this.cells = []; this.minerals = []; this.sources = [];
    this.events = []; this.history = []; this.id = 1; this.tick = 0; this.time = 0;
    this.byId = new Map(); this.grid = new Map(); this.edges = new Map(); this.bondKeys = new Set();
    this.milestones = new Set(); this.lineages = new Map(); this.templates = new Map();
    this.totals = { born: 0, ruptures: 0, copies: 0, mutations: 0, reactions: 0, influx: 0, outflux: 0, injected: 0, initial: 0 };
    if (!empty) this.populate();
  }

  add(type, x, y, extra = {}) {
    if (!TYPES[type] || this.particles.length >= this.config.particleLimit) return null;
    const p = { id: this.id++, type, x, y, vx: 0, vy: 0, angle: this.rng.range(0, Math.PI * 2), energy: type === 'food' ? 1 : 0.24, base: this.rng.pick(BASES), generation: 0, lineage: '', fx: 0, fy: 0, flash: 0, ...extra };
    this.particles.push(p); this.byId.set(p.id, p); return p;
  }

  link(a, b, kind = a?.type, rest) {
    if (!a || !b || a.id === b.id || this.bondKeys.has(keyFor(a.id, b.id))) return false;
    if (kind === 'adhesive' ? !([a.type, b.type].includes('adhesive') && [a.type, b.type].includes('lipid')) : !(['lipid', 'nucleotide', 'fiber'].includes(kind) && a.type === kind && b.type === kind)) return false;
    if (this.degree(a.id, kind) >= (kind === 'adhesive' ? 3 : 2) || this.degree(b.id, kind) >= (kind === 'adhesive' ? 3 : 2)) return false;
    const bond = { a: a.id, b: b.id, kind, rest: rest ?? (kind === 'lipid' ? 11 : kind === 'nucleotide' ? 8 : 9), age: 0 };
    this.bonds.push(bond); this.bondKeys.add(keyFor(a.id, b.id));
    if (!this.edges.has(a.id)) this.edges.set(a.id, []); if (!this.edges.has(b.id)) this.edges.set(b.id, []);
    this.edges.get(a.id).push(bond); this.edges.get(b.id).push(bond); return true;
  }
  degree(id, kind) { return (this.edges.get(id) || []).filter(b => !kind || b.kind === kind).length; }
  indexBonds() {
    this.edges.clear(); this.bondKeys.clear();
    this.bonds = this.bonds.filter(b => this.byId.has(b.a) && this.byId.has(b.b));
    for (const b of this.bonds) {
      this.bondKeys.add(keyFor(b.a, b.b));
      for (const id of [b.a, b.b]) { if (!this.edges.has(id)) this.edges.set(id, []); this.edges.get(id).push(b); }
    }
  }
  populate() {
    const c = this.config;
    this.sources = Array.from({ length: 4 }, () => ({ x: this.rng.range(c.width * .14, c.width * .86), y: this.rng.range(c.height * .15, c.height * .85), r: this.rng.range(95, 180) }));
    this.minerals = Array.from({ length: c.mineralCount }, () => ({ x: this.rng.range(c.width * .15, c.width * .85), y: this.rng.range(c.height * .17, c.height * .84), r: this.rng.range(18, 38), angle: this.rng.range(0, 6.28), facets: Array.from({ length: 7 }, () => this.rng.range(.78, 1.2)) }));
    const weights = ['lipid', 'lipid', 'lipid', 'lipid', 'lipid', 'nucleotide', 'nucleotide', 'food', 'food', 'food', 'catalyst', 'photo', 'fiber', 'adhesive'];
    for (let i = 0; i < c.initialParticles; i++) {
      const s = this.rng.pick(this.sources), clustered = this.rng.next() < .72;
      const a = this.rng.range(0, Math.PI * 2), r = Math.sqrt(this.rng.next()) * s.r;
      const x = clustered ? s.x + Math.cos(a) * r : this.rng.range(30, c.width - 30);
      const y = clustered ? s.y + Math.sin(a) * r : this.rng.range(30, c.height - 30);
      const p = this.add(this.rng.pick(weights), x, y); this.constrain(p);
    }
    if (c.stage !== 'molecules') {
      for (let i = 0; i < (c.stage === 'eukaryotic' ? 4 : 7); i++) {
        const x = c.width * (.2 + (i % 3) * .29), y = c.height * (.27 + Math.floor(i / 3) * .25);
        this.seedCompartment(x, y, c.stage === 'eukaryotic' ? 70 : this.rng.range(32, 46), c.stage === 'eukaryotic');
      }
    }
    this.totals.initial = this.particles.length;
    this.indexBonds(); this.rebuildGrid(); this.detectStructures();
    this.event('origin', c.stage === 'molecules' ? 'A world of possibilities' : 'The experiment begins', c.stage === 'molecules' ? 'Free molecules enter a mineral-rich water biome. Nothing is preassembled.' : 'Seeded structures and free molecules share the same chemistry.');
  }
  seedCompartment(x, y, r, nested = false, lineage) {
    const ring = [], n = Math.round(2 * Math.PI * r / 11);
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; ring.push(this.add('lipid', x + Math.cos(a) * r, y + Math.sin(a) * r, { angle: a })); }
    for (let i = 0; i < n; i++) this.link(ring[i], ring[(i + 1) % n], 'lipid');
    const seq = this.rng.pick(['AUGCGGCU', 'GGCAUUCG', 'AUCGGCUU']);
    const lin = lineage || `L-${hash(seq).toString(16).slice(0, 5)}`;
    let prev;
    for (let i = 0; i < seq.length; i++) { const p = this.add('nucleotide', x - 21 + i * 4, y + Math.sin(i * .9) * 9, { base: seq[i], lineage: lin, energy: .8 }); this.link(prev, p, 'nucleotide'); prev = p; }
    for (let i = 0; i < 20; i++) {
      const a = this.rng.range(0, Math.PI * 2), rr = this.rng.range(12, r - 10);
      this.add(this.rng.pick(['food', 'food', 'catalyst', 'photo', 'nucleotide', 'fiber', 'adhesive']), x + Math.cos(a) * rr, y + Math.sin(a) * rr, { energy: .7 });
    }
    if (nested) { // An initial condition, never an evolutionary stage transition.
      const inner = [], ir = 28;
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; inner.push(this.add('lipid', x + Math.cos(a) * ir, y + Math.sin(a) * ir)); }
      for (let i = 0; i < 16; i++) this.link(inner[i], inner[(i + 1) % 16], 'lipid');
      this.seedCompartment(x + r * .56, y + r * .2, 15, false, lin);
    }
    return ring;
  }

  rebuildGrid() {
    this.grid.clear();
    for (const p of this.particles) { const key = `${Math.floor(p.x / GRID)},${Math.floor(p.y / GRID)}`; if (!this.grid.has(key)) this.grid.set(key, []); this.grid.get(key).push(p); }
  }
  nearby(x, y, radius = GRID) {
    const out = [], n = Math.ceil(radius / GRID), gx = Math.floor(x / GRID), gy = Math.floor(y / GRID);
    for (let i = gx - n; i <= gx + n; i++) for (let j = gy - n; j <= gy + n; j++) {
      const list = this.grid.get(`${i},${j}`); if (list) for (const p of list) if ((p.x - x) ** 2 + (p.y - y) ** 2 < radius ** 2) out.push(p);
    }
    return out;
  }
  event(kind, title, detail, target) {
    this.events.unshift({ id: `${this.tick}-${this.events.length}-${this.totals.reactions}`, time: this.time, kind, title, detail, target: target ?? null });
    this.events = this.events.slice(0, 65);
  }
  once(key, kind, title, detail, target) { if (!this.milestones.has(key)) { this.milestones.add(key); this.event(kind, title, detail, target); } }

  step(count = 1) { for (let i = 0; i < count; i++) this.substep(); }
  substep() {
    const c = this.config; this.tick++; this.time = this.tick * DT;
    this.rebuildGrid();
    const thermal = Math.sqrt((c.temperature + 273) / 301), active = Math.exp(-(((c.temperature - 33) / 28) ** 2)) * Math.exp(-(((c.ph - 7.2) / 2.4) ** 2));
    for (const p of this.particles) {
      p.fx = (this.rng.next() - .5) * 6 * thermal;
      p.fy = (this.rng.next() - .5) * 6 * thermal;
      p.fx += Math.sin(p.y * .008 + this.time * .08) * c.mixing * 1.9;
      p.fy += Math.cos(p.x * .006 - this.time * .06) * c.mixing * 1.5;
      p.energy = Math.max(0, p.energy - DT * .003); p.flash *= .92;
      if (p.type === 'photo') p.energy = Math.min(2, p.energy + c.light * (.3 + .7 * (1 - p.y / c.height)) * DT * .38);
      if (p.type === 'nucleotide') p.energy = Math.min(1.5, p.energy + c.light * DT * .025);
    }
    this.forces(active);
    this.bondForces(active);
    this.membraneForces();
    for (const p of this.particles) {
      const ox = p.x, oy = p.y;
      p.vx = (p.vx + clamp(p.fx, -40, 40) * DT * 16) * .86;
      p.vy = (p.vy + clamp(p.fy, -40, 40) * DT * 16) * .86;
      p.x += p.vx * DT * 10; p.y += p.vy * DT * 10;
      this.barrier(p, ox, oy); this.constrain(p);
    }
    if (this.tick % 8 === 0) this.chemistry(active);
    if (this.tick % 30 === 0) { this.indexBonds(); this.detectStructures(); this.polymerChemistry(active); this.growMembranes(active); }
    if (this.tick % 60 === 0) this.feed();
    if (this.tick % 120 === 0) {
      this.history.push({ time: this.time, cells: this.cells.filter(x => x.alive).length, compartments: this.cells.length, polymers: this.polymers().length, energy: this.particles.reduce((s, p) => s + p.energy, 0) });
      if (this.history.length > 240) this.history.shift();
    }
  }

  forces(active) {
    const c = this.config;
    for (const p of this.particles) for (const q of this.nearby(p.x, p.y, 32)) {
      if (q.id <= p.id) continue;
      let dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy); if (d < .01) { dx = .05; d = .05; }
      const nx = dx / d, ny = dy / d, contact = TYPES[p.type].radius + TYPES[q.type].radius + 1.4;
      let f = d < contact ? -(contact - d) * 1.9 : 0;
      if (p.type === 'lipid' && q.type === 'lipid' && d > contact && d < 29 && !this.bondKeys.has(keyFor(p.id, q.id))) {
        if (this.degree(p.id, 'lipid') < 2 && this.degree(q.id, 'lipid') < 2) {
          f += .46 * Math.exp(-(((d - 13) / 12) ** 2));
          if (d < 14 && this.tick % 3 === 0 && this.rng.next() < .18 * active * (1 - c.salinity / 130)) this.link(p, q, 'lipid');
        }
      }
      if (p.type === q.type && ['nucleotide', 'fiber'].includes(p.type) && d < 12 && this.degree(p.id, p.type) < 2 && this.degree(q.id, q.type) < 2) {
        f += .1;
        if (this.tick % 8 === 0 && this.rng.next() < .026 * active && !p.copying && !q.copying) this.link(p, q, p.type);
      }
      if ((p.type === 'adhesive' && q.type === 'lipid' || q.type === 'adhesive' && p.type === 'lipid') && d < 15 && this.tick % 8 === 0 && this.rng.next() < .04 * active) this.link(p, q, 'adhesive', 9);
      p.fx += nx * f; p.fy += ny * f; q.fx -= nx * f; q.fy -= ny * f;
    }
  }
  bondForces(active) {
    const c = this.config, broken = new Set();
    for (const b of this.bonds) {
      const a = this.byId.get(b.a), q = this.byId.get(b.b); if (!a || !q) { broken.add(b); continue; }
      b.age += DT;
      const dx = q.x - a.x, dy = q.y - a.y, d = Math.hypot(dx, dy) || .1;
      if (d > b.rest * 3.5 || this.rng.next() < DT * (b.kind === 'adhesive' ? .008 : .00012 + (1 - active) * .006 + Math.max(0, c.salinity - 45) * .0001)) { broken.add(b); continue; }
      let rest = b.rest;
      if (b.kind === 'fiber' && a.energy > .12 && q.energy > .12) {
        rest *= 1 + .2 * Math.sin(this.time * 5 + a.id * .85);
        a.energy -= DT * .03; q.energy -= DT * .03;
        // Local anisotropic drag approximation; forces depend on orientation and phase, never on a cell goal.
        const phase = Math.cos(this.time * 5 + a.id * .85), thrust = phase * .23;
        a.fx += -dy / d * thrust; a.fy += dx / d * thrust;
      }
      const f = (d - rest) * (b.kind === 'lipid' ? 1.25 : .8);
      a.fx += dx / d * f; a.fy += dy / d * f; q.fx -= dx / d * f; q.fy -= dy / d * f;
    }
    if (broken.size) { this.bonds = this.bonds.filter(b => !broken.has(b)); this.indexBonds(); }
    // Preferred local amphiphile curvature is a coarse-grained bending-energy rule.
    for (const p of this.particles) {
      if (p.type !== 'lipid') continue;
      const edges = (this.edges.get(p.id) || []).filter(b => b.kind === 'lipid');
      if (edges.length !== 2) continue;
      const a = this.byId.get(edges[0].a === p.id ? edges[0].b : edges[0].a), b = this.byId.get(edges[1].a === p.id ? edges[1].b : edges[1].a);
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .1;
      const target = (edges[0].rest + edges[1].rest) * .975;
      const f = (d - target) * .14;
      a.fx += dx / d * f; a.fy += dy / d * f; b.fx -= dx / d * f; b.fy -= dy / d * f;
    }
  }
  membraneForces() {
    for (const cell of this.cells) {
      const pts = cell.ids.map(id => this.byId.get(id)).filter(Boolean); if (pts.length < 7) continue;
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      cell.x = cx; cell.y = cy;
      const area = polygonArea(pts), target = (pts.length * 11) ** 2 / (Math.PI * 4) * .77;
      const pressure = clamp((target - area) / target, -.7, .9) * 1.2;
      for (const p of pts) { const d = Math.hypot(p.x - cx, p.y - cy) || 1; p.fx += (p.x - cx) / d * pressure; p.fy += (p.y - cy) / d * pressure; }
      // Reconnection is permitted only at an actual narrow neck. No division timer,
      // genome-count trigger, daughter sprite, or cell-level reproductive goal.
      if (pts.length >= 16) this.fissionTopology(cell, pts);
    }
  }
  fissionTopology(cell, pts) {
    if (this.tick % 20 !== 0) return;
    for (let i = 0; i < pts.length; i++) for (let j = i + 8; j < pts.length - 7; j++) {
      if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) > 11) continue;
      const a = pts[i], an = pts[(i + 1) % pts.length], b = pts[j], bn = pts[(j + 1) % pts.length];
      this.bonds = this.bonds.filter(e => ![keyFor(a.id, an.id), keyFor(b.id, bn.id)].includes(keyFor(e.a, e.b)));
      this.indexBonds(); this.link(a, bn, 'lipid'); this.link(b, an, 'lipid');
      this.event('division', 'One enclosure becomes two', 'Opposing membrane segments met at a narrow neck and reconnected. No new matter was created.', cell.id); return;
    }
  }
  barrier(p, ox, oy) {
    if (p.type === 'lipid' || p.type === 'food' || p.type === 'waste') return;
    for (const cell of this.cells) {
      if (Math.abs(p.x - cell.x) > cell.radius + 12 || Math.abs(p.y - cell.y) > cell.radius + 12) continue;
      const pts = cell.ids.map(id => this.byId.get(id)).filter(Boolean);
      if (contains(pts, ox, oy) !== contains(pts, p.x, p.y)) {
        if (p.type === 'nucleotide' && this.degree(p.id, 'nucleotide') === 0 && this.rng.next() < .1) continue;
        // Momentum exchange with nearest membrane packet, rather than a hidden cell actor.
        let near = pts[0]; for (const v of pts) if ((v.x - p.x) ** 2 + (v.y - p.y) ** 2 < (near.x - p.x) ** 2 + (near.y - p.y) ** 2) near = v;
        near.vx += p.vx * .15; near.vy += p.vy * .15;
        p.x = ox; p.y = oy; p.vx *= -.3; p.vy *= -.3;
      }
    }
  }
  constrain(p) {
    if (!p) return;
    const c = this.config, margin = 9;
    // Resolve the chamber wall last, including after a resize or a mineral intervention.
    for (const m of this.minerals) { const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy); if (d < m.r + 4) { const a = d > .01 ? Math.atan2(dy, dx) : p.angle; p.x = m.x + Math.cos(a) * (m.r + 4); p.y = m.y + Math.sin(a) * (m.r + 4); p.vx *= .3; p.vy *= .3; } }
    if (c.shape === 'ellipse') {
      const rx = c.width / 2 - margin, ry = c.height / 2 - margin;
      const dx = p.x - c.width / 2, dy = p.y - c.height / 2, d = Math.hypot(dx / rx, dy / ry);
      if (d > 1) { p.x = c.width / 2 + dx / d; p.y = c.height / 2 + dy / d; p.vx *= -.4; p.vy *= -.4; }
    }
    if (p.x < margin || p.x > c.width - margin) { p.x = clamp(p.x, margin, c.width - margin); p.vx *= -.5; }
    if (p.y < margin || p.y > c.height - margin) { p.y = clamp(p.y, margin, c.height - margin); p.vy *= -.5; }
  }

  chemistry(active) {
    const c = this.config;
    for (const p of this.particles) {
      if (p.type === 'catalyst') {
        const ns = this.nearby(p.x, p.y, 24), food = ns.find(q => q.type === 'food');
        if (food && this.rng.next() < .15 * active) { food.type = 'waste'; food.energy = 0; p.energy = Math.min(3, p.energy + .7); p.flash = 1; this.totals.reactions++; }
        const acceptor = ns.find(q => ['nucleotide', 'fiber', 'lipid'].includes(q.type) && q.energy < .8);
        if (acceptor && p.energy > .2) { const e = Math.min(.12, p.energy - .1); p.energy -= e; acceptor.energy += e * .85; }
      }
      if (p.type === 'photo' && p.energy > .3) {
        const q = this.nearby(p.x, p.y, 23).find(v => v.id !== p.id && v.energy < .55 && v.type !== 'waste');
        if (q) { p.energy -= .07; q.energy += .06; }
      }
      if (p.type === 'waste' && c.light > .1 && this.rng.next() < .002 * c.light) {
        if (this.minerals.some(m => Math.hypot(m.x - p.x, m.y - p.y) < m.r + 28)) { p.type = 'food'; p.energy = 1; p.flash = .8; }
      }
    }
    if (this.totals.reactions > 0) this.once('metabolism', 'reaction', 'Chemistry is at work', 'Catalytic peptides are consuming nearby nutrient and transferring energy.');
  }
  components(type) {
    const visited = new Set(), groups = [];
    for (const p of this.particles) {
      if (p.type !== type || visited.has(p.id)) continue;
      const queue = [p], group = []; visited.add(p.id);
      for (let k = 0; k < queue.length; k++) { const v = queue[k]; group.push(v); for (const b of this.edges.get(v.id) || []) if (b.kind === type) { const id = b.a === v.id ? b.b : b.a; const q = this.byId.get(id); if (q && q.type === type && !visited.has(id)) { visited.add(id); queue.push(q); } } }
      groups.push(group);
    }
    return groups;
  }
  polymers() { return this.components('nucleotide').filter(g => g.length >= 4); }
  ordered(group, type) {
    const first = group.find(p => this.degree(p.id, type) === 1) || group[0], out = [first];
    const visited = new Set([first.id]); let current = first;
    while (out.length < group.length) { const b = (this.edges.get(current.id) || []).find(e => e.kind === type && !visited.has(e.a === current.id ? e.b : e.a)); if (!b) break; current = this.byId.get(b.a === current.id ? b.b : b.a); visited.add(current.id); out.push(current); }
    return out;
  }
  polymerChemistry(active) {
    const polys = this.polymers(), inUse = new Set();
    for (const raw of polys) {
      const group = this.ordered(raw, 'nucleotide'); if (group.some(p => p.copying)) continue;
      const root = Math.min(...group.map(p => p.id)), seq = group.map(p => p.base).join('');
      const x = group.reduce((s, p) => s + p.x, 0) / group.length, y = group.reduce((s, p) => s + p.y, 0) / group.length;
      // Only molecules on the same side of every membrane may participate.
      const boundaries = this.cells.map(c => c.ids.map(id => this.byId.get(id)));
      const sameRegion = p => boundaries.every(pts => contains(pts, p.x, p.y) === contains(pts, x, y));
      const ns = this.nearby(x, y, 54).filter(sameRegion), cat = ns.find(p => p.type === 'catalyst' && p.energy > .16);
      if (!group[0].lineage) for (const p of group) p.lineage = `L-${hash(seq).toString(16).slice(0, 5)}`;
      const lin = group[0].lineage;
      this.lineages.set(lin, { id: lin, sequence: seq, generation: Math.max(...group.map(p => p.generation)), lastSeen: this.time, color: `hsl(${hash(lin) % 360} 65% 72%)` });
      inUse.add(root);
      let copy = this.templates.get(root);
      const intact = copy && copy.ids.every((id, i) => this.byId.has(id) && (!i || this.bondKeys.has(keyFor(id, copy.ids[i - 1]))));
      if (!copy || copy.sequence !== seq || !intact) {
        if (copy) for (const id of copy.ids) { const p = this.byId.get(id); if (p) delete p.copying; }
        copy = { sequence: seq, ids: [], progress: 0, lineage: lin, age: 0 }; this.templates.set(root, copy);
      }
      copy.age++;
      if (!cat) continue;
      const target = group[copy.progress], needed = COMPLEMENT[target?.base];
      const unit = ns.find(p => p.type === 'nucleotide' && this.degree(p.id, 'nucleotide') === 0 && !p.copying && p.base === needed && p.energy > .09 && !group.includes(p));
      if (unit && this.rng.next() < .7 * active) {
        // A template recruits an existing activated substrate; synthesis adds no particles.
        cat.energy -= .1; unit.energy -= .08;
        const mutation = this.rng.next() < this.config.mutation + Math.max(0, this.config.temperature - 40) * .001;
        if (mutation) { unit.base = this.rng.pick(BASES.filter(b => b !== needed)); this.totals.mutations++; }
        unit.copying = root; unit.lineage = lin;
        unit.x = target.x + 7; unit.y = target.y + 11;
        if (copy.ids.length) this.link(this.byId.get(copy.ids.at(-1)), unit, 'nucleotide');
        copy.ids.push(unit.id); copy.progress++; unit.flash = 1;
        if (copy.progress === group.length) {
          const newSeq = copy.ids.map(id => this.byId.get(id).base).join(''), faithful = group.map(p => COMPLEMENT[p.base]).join('') === newSeq;
          const generation = Math.max(...group.map(p => p.generation)) + 1;
          for (const id of copy.ids) { const p = this.byId.get(id); delete p.copying; p.generation = generation; p.lineage = faithful ? lin : `L-${hash(newSeq).toString(16).slice(0, 5)}`; }
          this.templates.delete(root); this.totals.copies++;
          this.event('heredity', faithful ? 'A template was copied' : 'An inherited variation', `Generation ${unit.generation}. ${faithful ? 'Complementary sequence preserved.' : 'A copying error founded a new lineage.'}`, unit.id);
        }
      }
      // Explicit artificial genetic code. RNA-like motifs bias local synthesis.
      // This models sequence-to-chemistry coupling, not a real ribosome or modern translation.
      const food = ns.find(p => p.type === 'food');
      if (food && cat.energy > .28 && this.rng.next() < .12 * active) {
        const motifs = ['nucleotide']; // Activated precursors are also made from existing feedstock.
        if (/AU|UA/.test(seq)) motifs.push('lipid'); if (/GC|CG/.test(seq)) motifs.push('catalyst');
        if (/GG|CC/.test(seq)) motifs.push('photo'); if (/UU|AA/.test(seq)) motifs.push('fiber');
        if (/AG|CU/.test(seq)) motifs.push('adhesive');
        if (motifs.length) { food.type = this.rng.pick(motifs); food.energy = .2; food.lineage = lin; cat.energy -= .2; food.flash = 1; this.totals.reactions++; }
      }
    }
    for (const [root, copy] of this.templates) if (!inUse.has(root) || copy.age > 180) {
      for (const id of copy.ids) { const p = this.byId.get(id); if (p) delete p.copying; } this.templates.delete(root);
    }
    for (const [id, lineage] of this.lineages) if (this.time - lineage.lastSeen > 120) this.lineages.delete(id);
    if (polys.length) this.once('polymer', 'heredity', 'The first information chains', 'Linked nucleotide packets have formed RNA-like polymers. Their sequence can bias local reactions.');
  }
  detectStructures() {
    const old = this.cells, cells = [], polys = this.polymers();
    for (const group of this.components('lipid')) {
      if (group.length < 7 || group.length > 160 || !group.every(p => this.degree(p.id, 'lipid') === 2)) continue;
      const pts = this.ordered(group, 'lipid'), area = polygonArea(pts);
      if (pts.length !== group.length || area < 110) continue;
      const ids = pts.map(p => p.id), id = Math.min(...ids);
      const x = pts.reduce((s, p) => s + p.x, 0) / pts.length, y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const radius = Math.max(...pts.map(p => Math.hypot(p.x - x, p.y - y)));
      const inner = this.particles.filter(p => p.type !== 'lipid' && Math.abs(p.x - x) < radius && Math.abs(p.y - y) < radius && contains(pts, p.x, p.y));
      const genomes = polys.filter(g => g.every(p => contains(pts, p.x, p.y)));
      const metabolism = inner.filter(p => p.type === 'catalyst' || p.type === 'photo').length;
      const previous = old.find(o => o.id === id) || old.find(o => o.ids.filter(v => ids.includes(v)).length > ids.length * .45);
      const energy = inner.length ? inner.reduce((s, p) => s + p.energy, 0) / inner.length : 0;
      const cell = { id, ids, x, y, radius, area, inside: inner.map(p => p.id), genomes: genomes.length, metabolism, energy, alive: genomes.length > 0 && metabolism > 0, nested: false, parent: null, age: previous ? previous.age + .5 : 0, lineage: genomes[0]?.[0]?.lineage || '', generation: inner.length ? Math.max(...inner.map(p => p.generation)) : 0, axis: genomes.length >= 2 ? Math.atan2(genomes[1][0].y - genomes[0][0].y, genomes[1][0].x - genomes[0][0].x) : 0 };
      cells.push(cell); if (!previous) this.totals.born++;
    }
    for (const inner of cells) {
      const parent = cells.filter(outer => outer.area > inner.area && inner.ids.every(id => { const p = this.byId.get(id); return contains(outer.ids.map(i => this.byId.get(i)), p.x, p.y); })).sort((a, b) => a.area - b.area)[0];
      if (parent) { inner.parent = parent.id; parent.nested = true; }
    }
    for (const o of old) if (!cells.some(n => n.ids.some(id => o.ids.includes(id)))) this.totals.ruptures++;
    this.cells = cells;
    if (cells.length) this.once('membrane', 'assembly', 'An inside and an outside', 'A closed amphiphile loop was detected. Its outline is the actual molecular boundary.', cells[0].id);
    const alive = cells.find(c => c.alive);
    if (alive) this.once('cell', 'assembly', 'Chemistry, enclosed', 'A membrane contains a template and metabolic molecules: a model protocell.', alive.id);
    const nested = cells.find(c => c.nested && c.alive);
    if (nested) this.once('nested', 'symbiosis', 'A compartment within a compartment', 'Nested boundaries now share a local chemical environment. Enclosure alone is not proof of symbiosis.', nested.id);
    const colonies = this.colonies();
    if (colonies.length) this.once('colony', 'adhesion', 'Neighbors become connected', 'Binding peptides link distinct compartments. This is an aggregate, not automatically a multicellular organism.', colonies[0][0]);
  }
  colonies() {
    const groups = [], owner = new Map(); for (const c of this.cells) for (const id of c.ids) owner.set(id, c.id);
    const links = new Map();
    for (const p of this.particles.filter(p => p.type === 'adhesive')) {
      const ids = [...new Set((this.edges.get(p.id) || []).map(b => owner.get(b.a === p.id ? b.b : b.a)).filter(Boolean))];
      if (ids.length > 1) for (const a of ids) { if (!links.has(a)) links.set(a, new Set()); for (const b of ids) if (a !== b) links.get(a).add(b); }
    }
    const seen = new Set(); for (const id of links.keys()) { if (seen.has(id)) continue; const group = [id]; seen.add(id); for (let i = 0; i < group.length; i++) for (const v of links.get(group[i]) || []) if (!seen.has(v)) { seen.add(v); group.push(v); } if (group.length > 1) groups.push(group); }
    return groups;
  }
  growMembranes(active) {
    for (const cell of this.cells) {
      if (cell.ids.length > 95) continue;
      for (let i = 0; i < cell.ids.length; i++) {
        const a = this.byId.get(cell.ids[i]), b = this.byId.get(cell.ids[(i + 1) % cell.ids.length]);
        const unit = this.nearby((a.x + b.x) / 2, (a.y + b.y) / 2, 15).find(p => p.type === 'lipid' && this.degree(p.id, 'lipid') === 0);
        if (unit && this.rng.next() < .14 * active) {
          this.bonds = this.bonds.filter(e => keyFor(e.a, e.b) !== keyFor(a.id, b.id)); this.indexBonds();
          this.link(a, unit, 'lipid'); this.link(unit, b, 'lipid'); break;
        }
      }
    }
  }
  feed() {
    const c = this.config;
    const amount = Math.floor(c.food * 4 + this.rng.next());
    for (let i = 0; i < amount; i++) {
      const s = this.rng.pick(this.sources); if (!s) break;
      const p = this.add('food', s.x + this.rng.range(-s.r, s.r), s.y + this.rng.range(-s.r, s.r));
      if (p) { this.constrain(p); this.totals.influx++; }
    }
    // Open-system outflow removes only spent packets at the boundary, never hidden population culling.
    const leaving = new Set(this.particles.filter(p => p.type === 'waste' && (p.x < 25 || p.y < 25 || p.x > c.width - 25 || p.y > c.height - 25)).map(p => p.id));
    if (leaving.size) { this.particles = this.particles.filter(p => !leaving.has(p.id)); for (const id of leaving) this.byId.delete(id); this.totals.outflux += leaving.size; this.indexBonds(); }
  }
  configure(changes) {
    const before = this.config; this.config = sanitizeConfig({ ...before, ...changes });
    const c = this.config;
    if (before.width !== c.width || before.height !== c.height) {
      const sx = c.width / before.width, sy = c.height / before.height, shifted = new Set();
      // Freeze membership before moving any vertices; otherwise containment changes mid-loop.
      const groups = this.cells.filter(c => !c.parent).map(cell => {
        const pts = cell.ids.map(id => this.byId.get(id));
        return { cell, members: this.particles.filter(p => cell.ids.includes(p.id) || contains(pts, p.x, p.y)) };
      });
      for (const { cell, members } of groups) {
        const dx = cell.x * (sx - 1), dy = cell.y * (sy - 1);
        for (const p of members) if (!shifted.has(p.id)) { p.x += dx; p.y += dy; shifted.add(p.id); }
      }
      for (const p of this.particles) if (!shifted.has(p.id)) { p.x *= sx; p.y *= sy; }
      for (const m of [...this.minerals, ...this.sources]) { m.x *= sx; m.y *= sy; }
    }
    c.particleLimit = Math.max(c.particleLimit, this.particles.length);
    for (const p of this.particles) this.constrain(p);
    this.detectStructures();
  }
  inject(blueprint, x = this.config.width / 2, y = this.config.height / 2) {
    if (!blueprint || !Array.isArray(blueprint.particles) || !Array.isArray(blueprint.bonds)) throw new Error('Invalid cell blueprint.');
    if (blueprint.particles.length > 400 || this.particles.length + blueprint.particles.length > this.config.particleLimit) throw new Error('Not enough particle capacity. Choose a larger budget or a fresh world.');
    if (![x, y].every(Number.isFinite) || blueprint.bonds.length > 800) throw new Error('Invalid blueprint location or connections.');
    const map = new Map();
    for (const p of blueprint.particles) {
      if (!p || !TYPES[p.type] || !Number.isSafeInteger(p.id) || map.has(p.id) || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 500 || Math.abs(p.y) > 500) throw new Error('Invalid component in blueprint.');
      map.set(p.id, p);
    }
    const keys = new Set(), degrees = new Map();
    for (const b of blueprint.bonds) {
      const a = map.get(b?.a), p = map.get(b?.b), key = keyFor(b?.a, b?.b);
      if (!a || !p || a === p || a.type !== p.type || b.kind !== a.type || !['lipid', 'nucleotide', 'fiber'].includes(b.kind) || keys.has(key) || (degrees.get(a.id) || 0) >= 2 || (degrees.get(p.id) || 0) >= 2) throw new Error('Invalid connection in blueprint.');
      keys.add(key); degrees.set(a.id, (degrees.get(a.id) || 0) + 1); degrees.set(p.id, (degrees.get(p.id) || 0) + 1);
    }
    map.clear();
    for (const p of blueprint.particles) { const n = this.add(p.type, p.x + x, p.y + y, { base: BASES.includes(p.base) ? p.base : 'A', energy: .55 }); map.set(p.id, n); this.constrain(n); this.totals.injected++; }
    for (const b of blueprint.bonds) { const a = map.get(b.a), p = map.get(b.b); if (a && p && a.type === p.type && ['lipid', 'nucleotide', 'fiber'].includes(a.type)) this.link(a, p, a.type); }
    this.rebuildGrid(); this.detectStructures(); this.event('intervention', 'Your structure enters the water', `${map.size} molecular packets introduced. Its survival depends on the surrounding chemistry.`, [...map.values()][0]?.id);
    return [...map.values()][0]?.id;
  }
  brush(type, x, y) {
    if (type === 'mineral') { if (this.minerals.length >= 30) return; this.minerals.push({ x, y, r: 25, angle: this.rng.next() * 6.28, facets: Array.from({ length: 7 }, () => this.rng.range(.8, 1.2)) }); return; }
    if (type === 'erase') { this.minerals = this.minerals.filter(m => Math.hypot(m.x - x, m.y - y) > m.r + 25); return; }
    for (let i = 0; i < 8; i++) { const p = this.add(type, x + this.rng.range(-18, 18), y + this.rng.range(-18, 18)); if (p) { this.totals.injected++; this.constrain(p); } }
  }
  stats() {
    const counts = {}; for (const k of Object.keys(TYPES)) counts[k] = 0; for (const p of this.particles) counts[p.type]++;
    return { time: this.time, particles: this.particles.length, bonds: this.bonds.length, compartments: this.cells.length, cells: this.cells.filter(c => c.alive && !c.parent).length, nested: this.cells.filter(c => c.nested).length, colonies: this.colonies().length, polymers: this.polymers().length, lineages: [...this.lineages.values()].filter(l => this.time - l.lastSeen < 3), maxGeneration: Math.max(0, ...this.particles.map(p => p.generation)), counts, totals: { ...this.totals }, capacity: this.particles.length >= this.config.particleLimit };
  }
  snapshot() {
    return { config: this.config, time: this.time, particles: this.particles.map(({ fx, fy, ...p }) => p), bonds: this.bonds.map(b => ({ ...b })), cells: this.cells, minerals: this.minerals, sources: this.sources, events: this.events, history: this.history, stats: this.stats() };
  }
  save() {
    return { format: 'life-simulator', version: 1, ...this.snapshot(), rngState: this.rng.state, nextId: this.id, tick: this.tick, totals: this.totals, milestones: [...this.milestones], templates: [...this.templates], lineages: [...this.lineages] };
  }
  static load(data) {
    const require = (ok, message) => { if (!ok) throw new Error(message); };
    const finite = (...values) => values.every(Number.isFinite);
    const integer = n => Number.isSafeInteger(n) && n >= 0;
    const string = (s, max = 300) => typeof s === 'string' && s.length <= max;
    require(data?.format === 'life-simulator' && data.version === 1 && Array.isArray(data.particles) && data.particles.length <= 3000 && Array.isArray(data.bonds) && data.bonds.length <= 9000, 'This is not a supported Life Simulator world.');
    const world = new World(data.config, true), ids = new Set();
    require(data.particles.length <= world.config.particleLimit, 'The particle budget is smaller than this saved world.');
    for (const p of data.particles) {
      require(p && TYPES[p.type] && integer(p.id) && p.id > 0 && p.id < 1e9 && !ids.has(p.id) && finite(p.x, p.y, p.vx, p.vy, p.energy, p.angle, p.flash) && Math.abs(p.x) < 10000 && Math.abs(p.y) < 10000 && Math.abs(p.vx) < 10000 && Math.abs(p.vy) < 10000 && p.energy >= 0 && p.energy <= 10 && integer(p.generation) && BASES.includes(p.base) && string(p.lineage, 80), 'The world contains invalid particle data.');
      require(p.copying === undefined || integer(p.copying), 'The world contains invalid copying data.');
      ids.add(p.id);
      const { id, type, x, y, vx, vy, energy, angle, flash, base, generation, lineage, copying } = p;
      world.add(type, x, y, { id, vx, vy, energy, angle, flash, base, generation, lineage, ...(copying === undefined ? {} : { copying }) });
    }
    for (const b of data.bonds) {
      require(b && ids.has(b.a) && ids.has(b.b) && finite(b.rest, b.age) && b.rest > 0 && b.rest <= 80 && b.age >= 0, 'The world contains invalid bond data.');
      require(world.link(world.byId.get(b.a), world.byId.get(b.b), b.kind, b.rest), 'The world contains duplicate or incompatible bonds.');
      world.bonds.at(-1).age = b.age;
    }
    require(integer(data.nextId) && data.nextId > Math.max(0, ...ids) && integer(data.tick) && integer(data.rngState) && data.rngState <= 0xffffffff, 'The world contains an invalid simulation clock or random state.');
    world.id = data.nextId; world.tick = data.tick; world.time = world.tick * DT; world.rng.state = data.rngState;
    const validZones = a => Array.isArray(a) && a.length <= 40 && a.every(m => m && finite(m.x, m.y, m.r) && Math.abs(m.x) < 10000 && Math.abs(m.y) < 10000 && m.r > 0 && m.r < 600);
    require(validZones(data.minerals) && validZones(data.sources) && data.minerals.every(m => Number.isFinite(m.angle) && Array.isArray(m.facets) && m.facets.length === 7 && m.facets.every(v => Number.isFinite(v) && v > 0 && v < 3)), 'The world contains invalid terrain.');
    world.minerals = structuredClone(data.minerals); world.sources = structuredClone(data.sources);
    require(Array.isArray(data.cells) && data.cells.length <= 430, 'The world contains invalid compartments.');
    for (const c of data.cells) {
      require(c && Array.isArray(c.ids) && c.ids.length >= 7 && c.ids.length <= 160 && new Set(c.ids).size === c.ids.length && c.ids.every(id => world.byId.get(id)?.type === 'lipid') && c.id === Math.min(...c.ids) && Array.isArray(c.inside) && c.inside.length <= 3000 && c.inside.every(integer) && finite(c.x, c.y, c.radius, c.area, c.energy, c.age, c.axis) && c.radius > 0 && c.radius < 10000 && c.area > 0 && c.age >= 0 && integer(c.genomes) && integer(c.metabolism) && integer(c.generation) && typeof c.alive === 'boolean' && typeof c.nested === 'boolean' && (c.parent === null || integer(c.parent)) && string(c.lineage, 80), 'The world contains invalid compartment geometry.');
    }
    // These are sampled geometry records used between half-second detection passes.
    // Re-detecting here would change forces, ages, and counters after a checkpoint.
    world.cells = structuredClone(data.cells);
    require(Array.isArray(data.events) && data.events.length <= 65 && data.events.every(e => e && string(e.id) && string(e.kind, 40) && string(e.title) && string(e.detail, 1000) && Number.isFinite(e.time) && (e.target === null || integer(e.target))), 'The world contains invalid field notes.');
    require(Array.isArray(data.history) && data.history.length <= 240 && data.history.every(h => h && finite(h.time, h.cells, h.compartments, h.polymers, h.energy)), 'The world contains invalid history.');
    world.events = structuredClone(data.events); world.history = structuredClone(data.history);
    for (const key of Object.keys(world.totals)) { require(integer(data.totals?.[key]), 'The world contains an invalid material ledger.'); world.totals[key] = data.totals[key]; }
    require(world.particles.length === world.totals.initial + world.totals.influx + world.totals.injected - world.totals.outflux, 'The material ledger does not match the world.');
    require(Array.isArray(data.milestones) && data.milestones.length <= 100 && data.milestones.every(s => string(s, 80)), 'The world contains invalid milestones.');
    world.milestones = new Set(data.milestones);
    require(Array.isArray(data.lineages) && data.lineages.length <= 3000 && data.lineages.every(e => Array.isArray(e) && e.length === 2 && string(e[0], 80) && e[1] && e[1].id === e[0] && string(e[1].sequence, 3000) && /^[AUGC]+$/.test(e[1].sequence) && integer(e[1].generation) && Number.isFinite(e[1].lastSeen)), 'The world contains invalid lineages.');
    world.lineages = new Map(data.lineages.map(([id, l]) => [id, { id, sequence: l.sequence, generation: l.generation, lastSeen: l.lastSeen, color: `hsl(${hash(id) % 360} 65% 72%)` }]));
    require(Array.isArray(data.templates) && data.templates.length <= 750, 'The world contains invalid templates.');
    for (const [root, c] of data.templates) {
      require(ids.has(root) && !world.templates.has(root) && c && string(c.sequence, 3000) && /^[AUGC]+$/.test(c.sequence) && Array.isArray(c.ids) && new Set(c.ids).size === c.ids.length && c.ids.every(id => world.byId.get(id)?.copying === root) && c.progress === c.ids.length && c.progress < c.sequence.length && integer(c.age) && string(c.lineage, 80), 'The world contains invalid template progress.');
      world.templates.set(root, structuredClone(c));
    }
    require(world.particles.every(p => p.copying === undefined || world.templates.get(p.copying)?.ids.includes(p.id)), 'The world contains an orphaned template fragment.');
    world.indexBonds(); world.rebuildGrid();
    return world;
  }
}
