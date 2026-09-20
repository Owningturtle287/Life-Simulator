// Each bead is a coarse molecular packet, not an individual atom.
export const TYPES = Object.freeze({
  __proto__: null,
  lipid: { name: 'Amphiphile', short: 'Membrane', color: '#86ead0', radius: 3.2, valence: 2, description: 'Water-loving heads and water-avoiding tails. Neighboring packets link into flexible membranes.' },
  nucleotide: { name: 'Nucleotide', short: 'Heredity', color: '#f5b486', radius: 2.7, valence: 2, description: 'A, U, G, and C units join into RNA-like templates. Copying needs activated units, catalysts, and energy.' },
  catalyst: { name: 'Catalytic peptide', short: 'Catalysis', color: '#bca5fb', radius: 4, valence: 0, description: 'Lowers a modeled reaction barrier. Helps turn local nutrient into usable energy; does not create energy.' },
  photo: { name: 'Photoactive molecule', short: 'Light capture', color: '#cbdc7b', radius: 3.3, valence: 0, description: 'Captures incident light and shares excitation energy over short distances.' },
  fiber: { name: 'Contractile peptide', short: 'Structure', color: '#91c5ff', radius: 2.6, valence: 2, description: 'Links into flexible chains. Fueled links change length; asymmetric arrangements can produce motion.' },
  adhesive: { name: 'Binding peptide', short: 'Adhesion', color: '#f29cbc', radius: 3.4, valence: 3, description: 'Makes reversible attachments to nearby membranes, including those of other compartments.' },
  food: { name: 'Nutrient', short: 'Food', color: '#d7e8d4', radius: 1.9, valence: 0, description: 'Chemical feedstock. Metabolism consumes it; synthesis converts it into structural material.' },
  waste: { name: 'Spent material', short: 'Waste', color: '#647c8b', radius: 1.6, valence: 0, description: 'Low-energy reaction product. Light and mineral surfaces can slowly recycle it.' }
});
export const BASES = ['A', 'U', 'G', 'C'];
export const COMPLEMENT = { A: 'U', U: 'A', G: 'C', C: 'G' };
export const DEFAULTS = Object.freeze({
  seed: 'TIDAL-042', stage: 'molecules', width: 1500, height: 1050,
  shape: 'rectangle', temperature: 28, ph: 7.2, salinity: 18,
  food: 0.65, light: 0.72, mixing: 0.32, mutation: 0.018,
  mineralCount: 5, particleLimit: 1800, initialParticles: 1000
});
export const STAGES = {
  __proto__: null,
  molecules: { title: 'Primordial water', label: 'Building blocks', description: 'Only free molecular packets. Assembly is driven by local interactions; life is not guaranteed.' },
  prokaryotic: { title: 'First inhabitants', label: 'Prokaryotic start', description: 'Seeded membrane compartments with exposed templates and metabolism. Free building blocks remain.' },
  eukaryotic: { title: 'Worlds within', label: 'Eukaryotic start', description: 'Seeded nested compartments model internal membranes and endosymbionts. These are eukaryote-like analogues.' }
};
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export function hash(text) {
  let n = 2166136261;
  for (const c of String(text)) { n ^= c.charCodeAt(0); n = Math.imul(n, 16777619); }
  return n >>> 0;
}
export class Random {
  constructor(seed) { this.state = typeof seed === 'number' ? seed >>> 0 : hash(seed); }
  next() { let t = this.state += 0x6D2B79F5; this.state >>>= 0; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  range(a, b) { return a + this.next() * (b - a); }
  pick(a) { return a[Math.floor(this.next() * a.length)]; }
}
export function polygonArea(points) {
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) a += points[j].x * points[i].y - points[i].x * points[j].y;
  return Math.abs(a) / 2;
}
export function contains(points, x, y) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function sanitizeConfig(input = {}) {
  const out = { ...DEFAULTS };
  const ranges = { width: [600, 3000], height: [500, 2400], temperature: [4, 80], ph: [4, 10], salinity: [0, 70], food: [0, 1.5], light: [0, 1], mixing: [0, 1.5], mutation: [0, 0.12], mineralCount: [0, 12], particleLimit: [400, 3000], initialParticles: [0, 2400] };
  for (const [key, [lo, hi]] of Object.entries(ranges)) if (Number.isFinite(Number(input[key]))) out[key] = clamp(Number(input[key]), lo, hi);
  out.particleLimit = Math.round(out.particleLimit); out.initialParticles = Math.min(Math.round(out.initialParticles), out.particleLimit);
  out.mineralCount = Math.round(out.mineralCount);
  out.seed = String(input.seed ?? out.seed).slice(0, 60);
  if (STAGES[input.stage]) out.stage = input.stage;
  if (['rectangle', 'ellipse'].includes(input.shape)) out.shape = input.shape;
  return out;
}
