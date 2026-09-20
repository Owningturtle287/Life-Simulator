import { TYPES, BASES } from './chemistry.js';
import { World } from './engine.js';

export class CellBuilder {
  constructor(canvas, onChange) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.onChange = onChange;
    this.particles = []; this.bonds = []; this.nextId = 1; this.part = 'lipid'; this.tool = 'paint';
    this.undoStack = []; this.pointer = null; this.linkStart = null; this.zoom = 1;
    this.observer = new ResizeObserver(() => this.draw()); this.observer.observe(canvas);
    canvas.addEventListener('pointerdown', e => this.down(e)); canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerup', e => this.up(e)); canvas.addEventListener('pointercancel', e => this.up(e));
  }
  coords(e) { const r = this.canvas.getBoundingClientRect(); const z = Math.min(r.width / 350, r.height / 270); return { x: (e.clientX - r.left - r.width / 2) / z, y: (e.clientY - r.top - r.height / 2) / z }; }
  closest(at, radius = 10) { return this.particles.filter(p => Math.hypot(p.x - at.x, p.y - at.y) < radius).sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y))[0]; }
  checkpoint() { this.undoStack.push(this.export()); if (this.undoStack.length > 35) this.undoStack.shift(); }
  undo() { const prev = this.undoStack.pop(); if (prev) this.restore(prev); }
  connect(a, b) {
    if (!a || !b || a === b || a.type !== b.type || !['lipid', 'fiber', 'nucleotide'].includes(a.type)) return;
    if (this.bonds.some(e => e.a === a.id && e.b === b.id || e.a === b.id && e.b === a.id)) return;
    if (this.bonds.filter(e => e.a === a.id || e.b === a.id).length >= 2 || this.bonds.filter(e => e.a === b.id || e.b === b.id).length >= 2) return;
    if (Math.hypot(a.x - b.x, a.y - b.y) > 24) return;
    this.bonds.push({ a: a.id, b: b.id, kind: a.type });
  }
  place(at) {
    if (this.particles.length >= 400 || this.closest(at, 5)) return;
    const p = { id: this.nextId++, type: this.part, x: at.x, y: at.y, base: BASES[(this.nextId * 7) % 4] };
    this.particles.push(p);
    for (const q of this.particles.filter(q => q !== p && q.type === p.type && Math.hypot(q.x - p.x, q.y - p.y) < 15).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))) this.connect(p, q);
    this.pointer.last = at; this.changed();
  }
  erase(at) { const p = this.closest(at, 14); if (p) { this.particles = this.particles.filter(q => q !== p); this.bonds = this.bonds.filter(b => b.a !== p.id && b.b !== p.id); this.changed(); } }
  down(e) {
    e.preventDefault(); this.canvas.setPointerCapture(e.pointerId); const at = this.coords(e); this.checkpoint(); this.pointer = { last: at, id: e.pointerId, moving: this.closest(at) };
    if (this.tool === 'paint') this.place(at);
    if (this.tool === 'erase') this.erase(at);
    if (this.tool === 'bond') { const p = this.closest(at, 14); if (this.linkStart && p) { this.connect(this.linkStart, p); this.linkStart = null; this.changed(); } else { this.linkStart = p; this.draw(); } }
  }
  move(e) {
    if (!this.pointer || this.pointer.id !== e.pointerId) return; const at = this.coords(e);
    if (this.tool === 'paint' && Math.hypot(at.x - this.pointer.last.x, at.y - this.pointer.last.y) >= 8) this.place(at);
    if (this.tool === 'erase') this.erase(at);
    if (this.tool === 'move' && this.pointer.moving) { this.pointer.moving.x = at.x; this.pointer.moving.y = at.y; this.changed(); }
  }
  up(e) { if (this.pointer?.id === e.pointerId) this.pointer = null; }
  changed() { this.draw(); this.onChange(this.analyze()); }
  analyze() {
    const w = new World({ width: 600, height: 500, particleLimit: 600, initialParticles: 0 }, true);
    for (const p of this.particles) w.add(p.type, p.x + 300, p.y + 250, { id: p.id, base: p.base });
    w.byId = new Map(w.particles.map(p => [p.id, p]));
    for (const b of this.bonds) w.link(w.byId.get(b.a), w.byId.get(b.b), b.kind);
    w.detectStructures();
    const largest = [...w.cells].sort((a, b) => b.area - a.area)[0];
    const inner = largest ? w.particles.filter(p => largest.inside.includes(p.id)) : [];
    return { count: this.particles.length, enclosure: w.cells.length > 0, genome: largest?.genomes > 0, catalyst: inner.some(p => p.type === 'catalyst'), energy: inner.some(p => p.type === 'photo' || p.type === 'food'), cells: w.cells.length, ready: !!largest?.alive, longBonds: this.bonds.some(b => { const a = w.byId.get(b.a), p = w.byId.get(b.b); return a && p && Math.hypot(a.x - p.x, a.y - p.y) > 25; }) };
  }
  guided() {
    this.checkpoint(); this.particles = []; this.bonds = []; this.nextId = 1;
    const add = (type, x, y, base = 'A') => { const p = { id: this.nextId++, type, x, y, base }; this.particles.push(p); return p; };
    const ring = [];
    for (let i = 0; i < 34; i++) { const a = i / 34 * Math.PI * 2; ring.push(add('lipid', Math.cos(a) * 59, Math.sin(a) * 59)); }
    for (let i = 0; i < ring.length; i++) this.connect(ring[i], ring[(i + 1) % ring.length]);
    let prev; const seq = 'AUGCGGCAUU';
    for (let i = 0; i < seq.length; i++) { const p = add('nucleotide', i * 7 - 32, Math.sin(i * .65) * 9, seq[i]); this.connect(prev, p); prev = p; }
    add('catalyst', -13, -21); add('catalyst', 23, 21); add('photo', -32, 25); add('photo', 25, -29);
    for (let i = 0; i < 15; i++) { const a = i * 2.4, r = 20 + (i % 4) * 8; add(i % 3 === 0 ? 'food' : 'nucleotide', Math.cos(a) * r, Math.sin(a) * r, BASES[i % 4]); }
    this.changed();
  }
  clear() { this.checkpoint(); this.particles = []; this.bonds = []; this.nextId = 1; this.linkStart = null; this.changed(); }
  export() { return { format: 'life-simulator-blueprint', version: 1, particles: this.particles.map(p => ({ ...p })), bonds: this.bonds.map(b => ({ ...b })) }; }
  restore(data) {
    if (!data || data.format !== 'life-simulator-blueprint' || data.version !== 1 || !Array.isArray(data.particles) || data.particles.length > 400 || !Array.isArray(data.bonds) || data.bonds.length > 800) throw new Error('This is not a supported molecular design.');
    const ids = new Set();
    for (const p of data.particles) { if (!TYPES[p.type] || !Number.isInteger(p.id) || ids.has(p.id) || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 300 || Math.abs(p.y) > 300) throw new Error('The design contains invalid component positions.'); ids.add(p.id); }
    if (data.bonds.some(b => !ids.has(b.a) || !ids.has(b.b) || !['lipid', 'nucleotide', 'fiber'].includes(b.kind))) throw new Error('The design contains invalid bonds.');
    this.particles = data.particles.map(p => ({ id: p.id, type: p.type, x: p.x, y: p.y, base: BASES.includes(p.base) ? p.base : 'A' }));
    this.bonds = []; for (const b of data.bonds) this.connect(this.particles.find(p => p.id === b.a), this.particles.find(p => p.id === b.b));
    this.nextId = Math.max(0, ...ids) + 1; this.linkStart = null; this.changed();
  }
  draw() {
    const r = this.canvas.getBoundingClientRect(); if (!r.width || !r.height) return;
    const dpr = Math.min(devicePixelRatio || 1, 2); this.canvas.width = r.width * dpr; this.canvas.height = r.height * dpr;
    const ctx = this.ctx; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#0a2029'; ctx.fillRect(0, 0, r.width, r.height);
    const z = Math.min(r.width / 350, r.height / 270); ctx.translate(r.width / 2, r.height / 2); ctx.scale(z, z);
    ctx.fillStyle = '#709e9830';
    for (let x = -240; x <= 240; x += 15) for (let y = -180; y <= 180; y += 15) { ctx.beginPath(); ctx.arc(x, y, .55, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = '#91b6ac20'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 105, 0, Math.PI * 2); ctx.stroke();
    for (const b of this.bonds) { const a = this.particles.find(p => p.id === b.a), p = this.particles.find(p => p.id === b.b); if (!a || !p) continue; ctx.strokeStyle = `${TYPES[b.kind].color}b0`; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    for (const p of this.particles) { const t = TYPES[p.type]; ctx.fillStyle = t.color; ctx.strokeStyle = t.color; ctx.lineWidth = 1.2; ctx.beginPath(); if (p.type === 'nucleotide') { ctx.moveTo(p.x, p.y - 3); ctx.lineTo(p.x + 3, p.y + 3); ctx.lineTo(p.x - 3, p.y + 3); ctx.closePath(); ctx.fill(); } else { ctx.arc(p.x, p.y, t.radius, 0, Math.PI * 2); if (p.type === 'catalyst' || p.type === 'photo') ctx.stroke(); else ctx.fill(); } if (this.linkStart === p) { ctx.strokeStyle = '#f5ead5'; ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.stroke(); } }
    if (!this.particles.length) { ctx.fillStyle = '#9bbab6'; ctx.font = '13px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('What could a cell become?', 0, -6); ctx.font = '10px -apple-system, sans-serif'; ctx.fillStyle = '#6b8d91'; ctx.fillText('Choose a molecule. Make the first connection.', 0, 15); }
  }
}
