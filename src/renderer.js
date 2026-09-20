import { TYPES, clamp, contains } from './chemistry.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = 1; this.height = 1; this.camera = { x: 750, y: 525, zoom: 1 };
    this.selected = null; this.follow = false; this.layer = 'natural'; this.grid = false; this.fields = true;
    this.snapshot = null; this.positions = new Map(); this.lastTime = 0; this.fitted = false;
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(canvas);
    this.glows = new Map(); this.createGlows(); this.resize();
  }
  createGlows() {
    for (const [type, spec] of Object.entries(TYPES)) {
      const c = document.createElement('canvas'); c.width = c.height = 48; const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(24, 24, 0, 24, 24, 24); g.addColorStop(0, `${spec.color}55`); g.addColorStop(.25, `${spec.color}22`); g.addColorStop(1, `${spec.color}00`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 48, 48); this.glows.set(type, c);
    }
  }
  resize() {
    const r = this.canvas.getBoundingClientRect(); this.width = Math.max(1, r.width); this.height = Math.max(1, r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2); this.canvas.width = Math.round(this.width * dpr); this.canvas.height = Math.round(this.height * dpr); this.dpr = dpr;
    if (!this.fitted && this.snapshot) this.fit();
  }
  fit() {
    if (!this.snapshot) return; const c = this.snapshot.config;
    this.camera.x = c.width / 2; this.camera.y = c.height / 2;
    this.camera.zoom = Math.min((this.width - 50) / c.width, (this.height - 85) / c.height); this.fitted = true;
  }
  setSnapshot(snapshot) {
    this.snapshot = snapshot;
    if (!this.fitted) {
      this.fit();
      // Begin inside the water on a phone so molecular detail is visible immediately.
      // The fit control still shows the entire chamber at any time.
      if (this.width <= 600 && this.height > this.width) {
        const focus = snapshot.cells.find(c => !c.parent) || snapshot.sources[0];
        this.camera.zoom = Math.max(this.camera.zoom, .7);
        if (focus) { this.camera.x = focus.x; this.camera.y = focus.y; }
      }
    }
  }
  worldAt(x, y) { return { x: (x - this.width / 2) / this.camera.zoom + this.camera.x, y: (y - this.height / 2) / this.camera.zoom + this.camera.y }; }
  zoomBy(factor, x = this.width / 2, y = this.height / 2) {
    const before = this.worldAt(x, y); this.camera.zoom = clamp(this.camera.zoom * factor, .12, 5);
    const after = this.worldAt(x, y); this.camera.x += before.x - after.x; this.camera.y += before.y - after.y;
  }
  pick(x, y) {
    if (!this.snapshot) return null; const at = this.worldAt(x, y);
    let closest, d = 20 / this.camera.zoom;
    for (const p of this.snapshot.particles) { const pd = Math.hypot(p.x - at.x, p.y - at.y); if (pd < d) { closest = p; d = pd; } }
    if (closest && this.camera.zoom >= 1.2 && d < 9 / this.camera.zoom) return { kind: 'particle', id: closest.id };
    const byId = new Map(this.snapshot.particles.map(p => [p.id, p]));
    const candidates = this.snapshot.cells.filter(c => Math.hypot(c.x - at.x, c.y - at.y) < c.radius + 10 && contains(c.ids.map(id => byId.get(id)).filter(Boolean), at.x, at.y)).sort((a, b) => a.area - b.area);
    if (candidates[0]) return { kind: 'cell', id: candidates[0].id };
    return closest ? { kind: 'particle', id: closest.id } : null;
  }
  draw(now = performance.now()) {
    const ctx = this.ctx, w = this.width, h = this.height, s = this.snapshot;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.fillStyle = '#07171e'; ctx.fillRect(0, 0, w, h);
    const background = ctx.createRadialGradient(w * .5, h * .42, 20, w * .5, h * .5, Math.max(w, h) * .7);
    background.addColorStop(0, '#123339'); background.addColorStop(.65, '#0a242c'); background.addColorStop(1, '#06171e'); ctx.fillStyle = background; ctx.fillRect(0, 0, w, h);
    if (!s) return;
    if (this.follow && this.selected) {
      const target = (this.selected.kind === 'cell' ? s.cells : s.particles).find(p => p.id === this.selected.id);
      if (target) { this.camera.x += (target.x - this.camera.x) * .08; this.camera.y += (target.y - this.camera.y) * .08; }
    }
    const z = this.camera.zoom;
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(z, z); ctx.translate(-this.camera.x, -this.camera.y);
    this.boundary(ctx, s.config);
    ctx.save(); this.boundaryPath(ctx, s.config); ctx.clip();
    if (this.fields) this.drawFields(ctx, s);
    if (this.grid) {
      ctx.strokeStyle = '#9acbc912'; ctx.lineWidth = 1 / z; ctx.beginPath();
      for (let x = 0; x < s.config.width; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, s.config.height); }
      for (let y = 0; y < s.config.height; y += 100) { ctx.moveTo(0, y); ctx.lineTo(s.config.width, y); } ctx.stroke();
    }
    this.drawMinerals(ctx, s.minerals);
    const current = new Map(), alpha = .5;
    for (const p of s.particles) { const prev = this.positions.get(p.id); const pos = { ...p, x: prev ? prev.x + (p.x - prev.x) * alpha : p.x, y: prev ? prev.y + (p.y - prev.y) * alpha : p.y }; current.set(p.id, pos); }
    this.positions = current;
    for (const cell of s.cells) {
      const pts = cell.ids.map(id => current.get(id)).filter(Boolean); if (pts.length < 3) continue;
      const color = this.layer === 'lineage' && cell.lineage ? s.stats.lineages.find(l => l.id === cell.lineage)?.color || '#86ead0' : '#86ead0';
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
      const g = ctx.createRadialGradient(cell.x - cell.radius * .25, cell.y - cell.radius * .2, 1, cell.x, cell.y, cell.radius * 1.2);
      g.addColorStop(0, cell.nested ? '#6ea7a824' : '#86ead019'); g.addColorStop(1, '#74bb9c06');
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 7; ctx.strokeStyle = '#86ead013'; ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = color; ctx.globalAlpha = .48; ctx.stroke(); ctx.globalAlpha = 1;
    }
    for (const b of s.bonds) {
      const a = current.get(b.a), p = current.get(b.b); if (!a || !p) continue;
      ctx.lineWidth = b.kind === 'lipid' ? 2.1 : b.kind === 'adhesive' ? 1 : 1.4;
      ctx.strokeStyle = this.layer === 'energy' ? `hsl(${35 + clamp((a.energy + p.energy) * 40, 0, 140)} 65% 65%)` : TYPES[b.kind]?.color || '#b5cad5';
      ctx.globalAlpha = b.kind === 'adhesive' ? .35 : .68; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const p of current.values()) this.drawParticle(ctx, p, z, s);
    if (this.selected) {
      const item = (this.selected.kind === 'cell' ? s.cells : s.particles).find(p => p.id === this.selected.id);
      if (item) {
        const rr = (item.radius || 5) + 12 / z;
        ctx.strokeStyle = '#defce7'; ctx.lineWidth = 1 / z; ctx.setLineDash([5 / z, 5 / z]); ctx.beginPath(); ctx.arc(item.x, item.y, rr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#e0f5ec'; ctx.font = `${12 / z}px system-ui`; ctx.fillText(this.selected.kind === 'cell' ? `ENCLOSURE ${item.id}` : TYPES[item.type].name.toUpperCase(), item.x + rr + 8 / z, item.y - 5 / z);
      }
    }
    ctx.restore(); ctx.restore();
    // Subtle edge falloff suggests an optical field without hiding the actual particles.
    const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .25, w / 2, h / 2, Math.max(w, h) * .7);
    vignette.addColorStop(0, '#00000000'); vignette.addColorStop(1, '#020c1460'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
    this.lastTime = now;
  }
  boundaryPath(ctx, c) { ctx.beginPath(); if (c.shape === 'ellipse') ctx.ellipse(c.width / 2, c.height / 2, c.width / 2, c.height / 2, 0, 0, Math.PI * 2); else ctx.roundRect(0, 0, c.width, c.height, 22); }
  boundary(ctx, c) { this.boundaryPath(ctx, c); ctx.fillStyle = '#173a3c24'; ctx.fill(); ctx.strokeStyle = '#87c6bc30'; ctx.lineWidth = 1.3 / this.camera.zoom; ctx.stroke(); }
  drawFields(ctx, s) {
    for (const source of s.sources) {
      const r = source.r * 2.1, g = ctx.createRadialGradient(source.x, source.y, 0, source.x, source.y, r);
      g.addColorStop(0, `rgba(124,173,92,${.035 + s.config.food * .025})`); g.addColorStop(1, '#72b77600'); ctx.fillStyle = g; ctx.fillRect(source.x - r, source.y - r, r * 2, r * 2);
      for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.ellipse(source.x, source.y, source.r * (.55 + k * .34), source.r * (.48 + k * .3), .25, 0, Math.PI * 2); ctx.strokeStyle = '#9cc9a108'; ctx.lineWidth = 1; ctx.stroke(); }
    }
  }
  drawMinerals(ctx, minerals) {
    for (const m of minerals) {
      const facets = Array.isArray(m.facets) ? m.facets : [.9, 1, .82, 1.1, .88, 1, .9];
      ctx.beginPath(); facets.forEach((r, i) => { const a = i / facets.length * Math.PI * 2 + (m.angle || 0); const x = m.x + Math.cos(a) * m.r * r, y = m.y + Math.sin(a) * m.r * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
      const g = ctx.createLinearGradient(m.x - m.r, m.y - m.r, m.x + m.r, m.y + m.r); g.addColorStop(0, '#4d656257'); g.addColorStop(1, '#263e453c'); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#acc4b630'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(m.x - m.r * .6, m.y - m.r * .1); ctx.lineTo(m.x + m.r * .3, m.y + m.r * .65); ctx.moveTo(m.x + m.r * .5, m.y - m.r * .5); ctx.lineTo(m.x - m.r * .2, m.y + m.r * .8); ctx.strokeStyle = '#b8d7c017'; ctx.stroke();
    }
  }
  drawParticle(ctx, p, z, snapshot) {
    const spec = TYPES[p.type]; if (!spec) return;
    let color = spec.color;
    if (this.layer === 'energy') color = `hsl(${30 + Math.min(p.energy, 2) * 70} 70% ${40 + Math.min(p.energy, 2) * 16}%)`;
    if (this.layer === 'lineage' && p.lineage) color = snapshot.stats.lineages.find(l => l.id === p.lineage)?.color || spec.color;
    const r = spec.radius * (this.layer === 'structure' ? 1.15 : 1);
    if (p.type !== 'waste' && p.type !== 'food' && this.layer !== 'structure') { const sz = (r * 5 + p.flash * 8); ctx.drawImage(this.glows.get(p.type), p.x - sz / 2, p.y - sz / 2, sz, sz); }
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 1.1;
    ctx.globalAlpha = p.type === 'waste' ? .45 : p.type === 'food' ? .63 : .92;
    ctx.beginPath();
    if (p.type === 'lipid') {
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      const dx = Math.cos(p.angle), dy = Math.sin(p.angle);
      ctx.beginPath(); ctx.moveTo(p.x + dx * r - dy, p.y + dy * r + dx); ctx.lineTo(p.x + dx * 7 - dy, p.y + dy * 7 + dx); ctx.moveTo(p.x + dx * r + dy, p.y + dy * r - dx); ctx.lineTo(p.x + dx * 6 + dy, p.y + dy * 6 - dx); ctx.globalAlpha = .4; ctx.stroke();
    } else if (p.type === 'nucleotide') {
      ctx.moveTo(p.x, p.y - r * 1.3); ctx.lineTo(p.x + r, p.y + r); ctx.lineTo(p.x - r, p.y + r); ctx.closePath(); ctx.fill();
      if (z > 1.8) { ctx.font = '7px ui-monospace, monospace'; ctx.fillStyle = '#ffdda7'; ctx.fillText(p.base, p.x + 5, p.y + 2); }
    } else if (p.type === 'catalyst') {
      ctx.ellipse(p.x, p.y, r * 1.25, r * .78, p.angle, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(p.x + 1, p.y - 1, 1.2, 0, Math.PI * 2); ctx.fill();
    } else if (p.type === 'photo') {
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); ctx.stroke();
    } else if (p.type === 'fiber') { ctx.moveTo(p.x - r, p.y - r); ctx.lineTo(p.x + r, p.y + r); ctx.moveTo(p.x - r, p.y + r); ctx.lineTo(p.x + r, p.y - r); ctx.stroke(); }
    else if (p.type === 'adhesive') { ctx.arc(p.x, p.y, r, .3, 5.5); ctx.stroke(); }
    else { ctx.arc(p.x, p.y, Math.max(r, .85 / z), 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
}

export function drawHistory(canvas, history) {
  const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  if (!rect.width) return;
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); const w = rect.width, h = rect.height;
  ctx.strokeStyle = '#a1bcc115'; ctx.lineWidth = 1;
  for (let y = 12; y < h; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  if (history.length < 2) return;
  const data = history.slice(-100), max = Math.max(3, ...data.map(p => Math.max(p.compartments, p.polymers)));
  for (const [key, color] of [['polymers', '#c3a2ee'], ['compartments', '#86ead0']]) {
    ctx.beginPath(); data.forEach((p, i) => { const x = i / (data.length - 1) * w, y = h - 9 - p[key] / max * (h - 20); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
    const last = data.at(-1); ctx.beginPath(); ctx.arc(w - 2, h - 9 - last[key] / max * (h - 20), 3, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  }
}
