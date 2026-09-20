import { TYPES, STAGES, DEFAULTS, clamp } from './chemistry.js';
import { Renderer, drawHistory } from './renderer.js';
import { CellBuilder } from './builder.js';

const $ = selector => document.querySelector(selector), $$ = selector => [...document.querySelectorAll(selector)];
const text = (selector, value) => { const el = $(selector); if (el && el.textContent !== String(value)) el.textContent = value; };
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const clock = time => { const t = Math.floor(time); return `${Math.floor(t / 60).toString().padStart(2, '0')}:${(t % 60).toString().padStart(2, '0')}`; };
const fmt = n => n.toLocaleString('en-US');
let snapshot = null, running = true, speed = 1, brush = null, dialogResume = false, activePanel = null, lastUi = 0, lastEvents = '', lastInspector = '', createNew = true, toastTimer, pendingInstall;
const pending = new Map(); let requestId = 0;
let worker;
try { worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); }
catch (e) { $('#scope-caption').textContent = 'The simulation could not start. Open this app from its HTTPS website.'; throw e; }
const send = (type, data = {}) => worker.postMessage({ type, ...data });
const renderer = new Renderer($('#world-canvas'));
const builder = new CellBuilder($('#builder-canvas'), updateBuilder);
const localKey = 'life-simulator-world-v1';
const params = new URLSearchParams(location.search);
const initial = { ...DEFAULTS, seed: params.get('seed') || DEFAULTS.seed };
send('init', { config: initial });
worker.addEventListener('error', error => { running = false; updatePlayback(); toast('The simulation stopped unexpectedly. Your saved checkpoints are still available.'); console.error(error); });
worker.onmessage = ({ data }) => {
  if (data.type === 'snapshot') {
    snapshot = data.snapshot; renderer.setSnapshot(snapshot);
    if (performance.now() - lastUi > 230) { updateStats(data.actualSpeed); lastUi = performance.now(); }
  }
  if (data.type === 'saved') { pending.get(data.request)?.resolve(data.data); pending.delete(data.request); }
  if (data.type === 'loaded') { syncConfig(data.config); renderer.fitted = false; renderer.selected = null; lastEvents = ''; lastInspector = ''; }
  if (data.type === 'injected') { toast('Your molecular structure is in the water. Tap it to follow what happens.'); renderer.selected = { kind: 'particle', id: data.id }; }
  if (data.type === 'error') { toast(data.message); if (data.request) { pending.get(data.request)?.reject(new Error(data.message)); pending.delete(data.request); } }
};
function checkpoint() { return new Promise((resolve, reject) => { const request = ++requestId; pending.set(request, { resolve, reject }); send('save', { request }); setTimeout(() => { if (pending.has(request)) { pending.delete(request); reject(new Error('The world could not be saved. Please try again.')); } }, 12000); }); }
function toast(message) { const el = $('#toast'); el.textContent = message; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 4200); }
function updatePlayback() {
  $('#play-button').innerHTML = icon(running ? 'pause' : 'play'); $('#play-button').setAttribute('aria-label', running ? 'Pause simulation' : 'Resume simulation');
  text('#running-label', running ? 'LIVE OBSERVATION' : 'OBSERVATION PAUSED'); $('#running-dot').classList.toggle('paused', !running);
  $$('.speed').forEach(b => { const active = Number(b.dataset.speed) === speed; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
}
function setRunning(value) { running = value; send('run', { running }); updatePlayback(); }
$('#play-button').addEventListener('click', () => setRunning(!running));
$$('.speed').forEach(b => b.addEventListener('click', () => { speed = Number(b.dataset.speed); send('speed', { speed }); updatePlayback(); }));
$('#step-button').addEventListener('click', () => { setRunning(false); send('step'); });
document.addEventListener('keydown', e => { if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || document.querySelector('dialog[open]')) return; if (e.code === 'Space') { e.preventDefault(); setRunning(!running); } if (e.key === 'Escape') { setBrush(null); closePanels(); renderer.selected = null; } if (e.key === '+' || e.key === '=') renderer.zoomBy(1.3); if (e.key === '-') renderer.zoomBy(1 / 1.3); });

function setFill(input) { input.style.setProperty('--fill', `${(Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100}%`); }
function conditionLabels(c) {
  text('#temperature-value', `${Math.round(c.temperature)} °C`); text('#food-value', `${Math.round(c.food * 100)}%`); text('#light-value', `${Math.round(c.light * 100)}%`);
  text('#mixing-value', c.mixing < .15 ? 'Still' : c.mixing < .5 ? 'Gentle' : c.mixing < 1 ? 'Flowing' : 'Turbulent');
}
function syncConfig(c) {
  text('#world-title', STAGES[c.stage].title); text('#stage-label', STAGES[c.stage].label);
  $('#seed-button').innerHTML = `${escape(c.seed)}${icon('chevron')}`;
  for (const input of $$('[data-config]')) { input.value = c[input.dataset.config] * Number(input.dataset.divisor || 1); setFill(input); }
  conditionLabels(c);
}
$$('[data-config]').forEach(input => {
  setFill(input); input.addEventListener('input', () => { setFill(input); const value = Number(input.value) / Number(input.dataset.divisor || 1); const config = { [input.dataset.config]: value }; send('configure', { config }); conditionLabels({ ...(snapshot?.config || DEFAULTS), ...config }); });
});
function updateStats(actualSpeed) {
  if (!snapshot) return; const s = snapshot.stats;
  text('#stat-particles', fmt(s.particles)); text('#stat-cells', fmt(s.cells)); text('#stat-polymers', fmt(s.polymers)); text('#stat-generation', s.maxGeneration);
  text('#time-value', clock(snapshot.time)); text('#speed-actual', running && speed > 1 ? `${Math.max(.1, actualSpeed).toFixed(1)}× actual` : '');
  text('#phase-label', s.nested > 0 ? 'NESTED COMPARTMENTS' : s.cells > 0 ? 'ENCLOSED CHEMISTRY' : s.compartments > 0 ? 'MEMBRANES TAKING SHAPE' : 'PREBIOTIC CHEMISTRY');
  text('#scope-caption', s.cells > 0 ? 'A boundary. A sequence. A possibility.' : s.polymers > 0 ? 'Small connections, new possibilities.' : 'The beginning is in the details.');
  $('#capacity-banner').hidden = !s.capacity;
  drawHistory($('#history-chart'), snapshot.history); updateInspector();
  const signature = snapshot.events.map(e => e.id).join(',');
  if (signature !== lastEvents) {
    lastEvents = signature; text('#event-count', String(snapshot.events.length).padStart(2, '0'));
    $('#event-list').innerHTML = snapshot.events.slice(0, 5).map(e => `<article class="event-item" style="--event-color:${e.kind === 'heredity' ? '#c0a0e4' : e.kind === 'intervention' ? '#edb38e' : '#81b99f'}"><time>${clock(e.time)}</time><strong>${escape(e.title)}</strong><p>${escape(e.detail)}</p></article>`).join('');
  }
}
function updateInspector() {
  const selection = renderer.selected;
  if (!selection) {
    if (lastInspector !== 'empty') { $('#inspector').innerHTML = `<div class="inspector-empty">${icon('focus')}<strong>Look a little closer</strong><p>Tap any molecule or membrane to see what it is doing.</p></div>`; lastInspector = 'empty'; }
    $('#selection-toast').hidden = true; return;
  }
  const item = (selection.kind === 'cell' ? snapshot.cells : snapshot.particles).find(p => p.id === selection.id);
  if (!item) { renderer.selected = null; lastInspector = ''; return; }
  const isCell = selection.kind === 'cell';
  const name = isCell ? item.nested ? 'Nested compartment' : item.alive ? 'Model protocell' : 'Membrane vesicle' : TYPES[item.type].name;
  const particles = isCell ? snapshot.particles.filter(p => item.inside.includes(p.id)) : [item];
  const seq = particles.filter(p => p.type === 'nucleotide' && p.lineage).map(p => p.base).join('');
  const rows = isCell ? [['Boundary', `${item.ids.length} amphiphiles`], ['Enclosed packets', item.inside.length], ['Templates', item.genomes], ['Metabolic packets', item.metabolism], ['Generation', item.generation], ['Nested inside', item.parent ? `#${item.parent}` : 'Free enclosure']] : [['Packet', `#${item.id}`], ['Bonds', snapshot.bonds.filter(b => b.a === item.id || b.b === item.id).length], ['Energy', item.energy.toFixed(2)], ['Generation', item.generation], ...(item.type === 'nucleotide' ? [['Base', item.base]] : [])];
  const desc = isCell ? item.alive ? 'Its components drive its chemistry. Survival and copying depend on local resources.' : 'A closed molecular boundary. Add an internal template and energy chemistry to explore cellular behavior.' : TYPES[item.type].description;
  const html = `<div class="inspector-content"><div class="inspector-kicker">${isCell ? 'ENCLOSURE' : 'MOLECULAR PACKET'} #${item.id}<button id="clear-selection" aria-label="Clear selection">${icon('close')}</button></div><h3>${escape(name)}</h3><p>${escape(desc)}</p><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${escape(v)}</dd>`).join('')}</dl><div class="energy-meter" title="Mean available energy"><i style="width:${clamp(item.energy / 2 * 100, 0, 100)}%"></i></div>${seq ? `<p class="sequence" title="Enclosed bases; spatial order, not a sequenced genome">${escape(seq.slice(0, 40))}</p>` : ''}<button class="text-button" id="follow-selection">${icon('focus')}${renderer.follow ? 'Stop following' : 'Follow this structure'}</button></div>`;
  if (html !== lastInspector) {
    $('#inspector').innerHTML = html; lastInspector = html;
    $('#clear-selection').onclick = () => { renderer.selected = null; renderer.follow = false; updateInspector(); };
    $('#follow-selection').onclick = () => { renderer.follow = !renderer.follow; lastInspector = ''; updateInspector(); };
  }
  text('#selection-name', `${name} · #${item.id}`); $('#selection-toast').hidden = window.innerWidth > 900 || activePanel === 'observation-panel';
}

// All navigation uses pointer events; no hover-dependent controls.
const pointers = new Map(); let downAt, lastAt, pinchDistance = 0, moved = false, lastBrush = 0;
const canvas = $('#world-canvas');
const localPoint = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); const p = localPoint(e); pointers.set(e.pointerId, p); downAt = p; lastAt = p; moved = false; if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDistance = Math.hypot(a.x - b.x, a.y - b.y); } if (brush && pointers.size === 1) paint(p); });
canvas.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return; const p = localPoint(e); pointers.set(e.pointerId, p);
  if (pointers.size === 2) { const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y); renderer.zoomBy(d / (pinchDistance || d), (a.x + b.x) / 2, (a.y + b.y) / 2); pinchDistance = d; moved = true; }
  else if (brush) { if (performance.now() - lastBrush > 120) paint(p); moved = true; }
  else { if (Math.hypot(p.x - downAt.x, p.y - downAt.y) > 5) moved = true; if (moved) { renderer.camera.x -= (p.x - lastAt.x) / renderer.camera.zoom; renderer.camera.y -= (p.y - lastAt.y) / renderer.camera.zoom; renderer.follow = false; } }
  lastAt = p;
});
const pointerEnd = e => { if (!pointers.has(e.pointerId)) return; if (e.type === 'pointerup' && !moved && !brush && pointers.size === 1) { renderer.selected = renderer.pick(localPoint(e).x, localPoint(e).y); renderer.follow = false; lastInspector = ''; updateInspector(); } pointers.delete(e.pointerId); if (pointers.size) { lastAt = [...pointers.values()][0]; downAt = lastAt; moved = true; } };
canvas.addEventListener('pointerup', pointerEnd); canvas.addEventListener('pointercancel', pointerEnd);
canvas.addEventListener('wheel', e => { e.preventDefault(); const p = localPoint(e); renderer.zoomBy(Math.exp(-e.deltaY * .0015), p.x, p.y); }, { passive: false });
canvas.addEventListener('dblclick', e => { const p = localPoint(e); renderer.zoomBy(1.6, p.x, p.y); });
function paint(p) { const at = renderer.worldAt(p.x, p.y); if (!snapshot || at.x < 0 || at.y < 0 || at.x > snapshot.config.width || at.y > snapshot.config.height) return; send('brush', { kind: brush, ...at }); lastBrush = performance.now(); }
function setBrush(kind) { brush = kind; $$('.tool-chip[data-brush]').forEach(b => b.classList.toggle('active', b.dataset.brush === kind)); $('.microscope').classList.toggle('painting', !!kind); text('#brush-hint', kind ? `Tap or paint in the water to add ${kind === 'mineral' ? 'mineral surfaces' : TYPES[kind].name.toLowerCase()}. Tap this tool again to stop.` : 'Choose a material, then tap the water.'); }
$$('[data-brush]').forEach(b => b.addEventListener('click', () => { setBrush(brush === b.dataset.brush ? null : b.dataset.brush); if (window.innerWidth <= 900) closePanels(); }));
$('#matter-help').onclick = () => toast('These are deliberate interventions: added matter is tracked separately from naturally formed structures.');
$('#zoom-in').onclick = () => renderer.zoomBy(1.3); $('#zoom-out').onclick = () => renderer.zoomBy(1 / 1.3); $('#fit-button').onclick = () => { renderer.fit(); renderer.follow = false; };
$('#grid-button').onclick = () => { renderer.grid = !renderer.grid; $('#grid-button').setAttribute('aria-pressed', String(renderer.grid)); };
$('#layer').onchange = e => { renderer.layer = e.target.value; };

function closePanels() { $$('.side-panel').forEach(p => p.classList.remove('is-open')); $$('.mobile-nav button').forEach(b => b.classList.remove('active')); $('#panel-scrim').hidden = true; activePanel = null; }
function togglePanel(id, button) { const open = activePanel !== id; closePanels(); if (open) { $(`#${id}`).classList.add('is-open'); $('#panel-scrim').hidden = false; activePanel = id; button?.classList.add('active'); if (snapshot) updateStats(speed); } }
$('#mobile-habitat').onclick = e => togglePanel('habitat-panel', e.currentTarget); $('#mobile-observations').onclick = e => togglePanel('observation-panel', e.currentTarget);
$('#inspect-mobile').onclick = () => togglePanel('observation-panel', $('#mobile-observations')); $('#panel-scrim').onclick = closePanels; $$('[data-close-panel]').forEach(b => b.onclick = closePanels);
$('#observe-button').onclick = () => { closePanels(); $$('dialog[open]').forEach(d => d.close()); };

function showDialog(id) {
  closePanels(); setBrush(null); const d = $(id);
  dialogResume = running; if (running) setRunning(false); d.showModal();
  if (id === '#studio-dialog') requestAnimationFrame(() => builder.changed());
}
$$('[data-close-dialog]').forEach(b => b.onclick = () => b.closest('dialog').close());
$$('dialog').forEach(d => { d.addEventListener('close', () => { if (dialogResume) setRunning(true); dialogResume = false; }); d.addEventListener('click', e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); } }); });
function openWorld(isNew) {
  createNew = isNew; const c = snapshot?.config || DEFAULTS, form = $('#world-form');
  for (const key of ['seed', 'width', 'height', 'shape', 'particleLimit', 'ph', 'salinity', 'mineralCount']) if (form.elements[key]) form.elements[key].value = c[key];
  form.elements.stage.value = c.stage; form.elements.mutation.value = c.mutation * 100;
  $('.starting-fieldset').hidden = !isNew; $('.form-row').hidden = !isNew;
  form.elements.mineralCount.closest('label').hidden = !isNew;
  text('#world-dialog-eyebrow', isNew ? 'A FRESH POSSIBILITY' : 'CHANGE THE CONDITIONS'); text('#world-dialog-title', isNew ? 'Make a small world.' : 'Shape the habitat.');
  $('#world-submit').innerHTML = `${icon(isNew ? 'plus' : 'check')}${isNew ? 'Create world' : 'Apply conditions'}`;
  text('#world-error', ''); worldFormLabels(); showDialog('#world-dialog');
}
$('#new-world-button').onclick = () => openWorld(true); $('#stage-settings').onclick = () => openWorld(true); $('#environment-button').onclick = () => openWorld(false);
$('#random-seed').onclick = () => { $('#world-seed').value = `TIDAL-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0, 6).toUpperCase()}`; };
function worldFormLabels() { text('#width-out', `${$('#world-width').value} u`); text('#height-out', `${$('#world-height').value} u`); text('#ph-out', $('#world-ph').value); text('#salinity-out', `${$('#world-salinity').value} ppt`); text('#mutation-out', `${$('#world-mutation').value}%`); $$('#world-form input[type=range]').forEach(setFill); }
$$('#world-form input[type=range]').forEach(el => el.addEventListener('input', worldFormLabels));
$('#world-form').onsubmit = async e => {
  e.preventDefault(); const data = new FormData(e.currentTarget), c = { ...(snapshot?.config || DEFAULTS) };
  for (const [key, value] of data) c[key] = ['seed', 'stage', 'shape'].includes(key) ? value : Number(value);
  c.mutation /= 100;
  if (!createNew && c.particleLimit < (snapshot?.particles.length || 0)) { text('#world-error', 'The budget must fit the particles already in this world. Raise it, or create a fresh world.'); return; }
  if (createNew) {
    // Preserve a local recovery point before replacing a running experiment.
    try { const previous = await checkpoint(); localStorage.setItem(localKey, JSON.stringify({ savedAt: Date.now(), world: previous })); } catch { /* A browser quota must not block a deliberately requested fresh run. */ }
    c.initialParticles = Math.min(1000, c.particleLimit - (c.stage === 'molecules' ? 180 : c.stage === 'eukaryotic' ? 550 : 600));
    send('init', { config: c }); renderer.fitted = false; renderer.positions.clear(); renderer.selected = null; renderer.follow = false; lastEvents = ''; lastInspector = '';
    dialogResume = true; toast(`A new ${STAGES[c.stage].label.toLowerCase()} experiment is beginning.`);
  } else { send('configure', { config: c }); renderer.fitted = false; toast('The environment has changed. The existing matter remains.'); }
  syncConfig(c); $('#world-dialog').close();
};
$('#seed-button').onclick = async () => { try { await navigator.clipboard.writeText(snapshot?.config.seed || DEFAULTS.seed); toast('World seed copied.'); } catch { toast(`World seed: ${snapshot?.config.seed || DEFAULTS.seed}`); } };

// Cell studio: the saved blueprint is the geometry released into the same engine.
$('#studio-button').onclick = $('#mobile-studio').onclick = () => showDialog('#studio-dialog');
const studioTypes = ['lipid', 'nucleotide', 'catalyst', 'photo', 'fiber', 'adhesive', 'food'];
$('#component-palette').innerHTML = studioTypes.map(type => `<button class="part-button${type === 'lipid' ? ' active' : ''}" data-part="${type}" aria-label="Place ${escape(TYPES[type].name)}" title="${escape(TYPES[type].name)}"><i style="--dot:${TYPES[type].color}"></i>${escape(TYPES[type].short)}</button>`).join('');
text('#selected-part-note', TYPES.lipid.description);
$$('[data-part]').forEach(b => b.onclick = () => { builder.part = b.dataset.part; $$('[data-part]').forEach(v => v.classList.toggle('active', v === b)); text('#selected-part-note', TYPES[builder.part].description); });
$$('[data-studio-tool]').forEach(b => b.onclick = () => { builder.tool = b.dataset.studioTool; builder.linkStart = null; $$('[data-studio-tool]').forEach(v => v.classList.toggle('active', v === b)); text('#studio-feedback', { paint: 'Draw a membrane loop or a short molecular chain. Nearby matching components link.', move: 'Drag a component to change the geometry. Long bonds may break after release.', bond: 'Tap two nearby matching components to connect them.', erase: 'Tap or sweep over components to remove them.' }[builder.tool]); });
function updateBuilder(status) {
  text('#component-count', `${status.count} components`);
  const list = [[status.enclosure, 'A closed membrane'], [status.genome, 'An enclosed RNA-like chain'], [status.catalyst, 'An enclosed catalyst'], [status.energy, 'An energy source inside']];
  $('#builder-checklist').innerHTML = list.map(([ok, label]) => `<li class="${ok ? 'complete' : ''}">${label}</li>`).join('');
  $('#release-blueprint').disabled = status.count === 0;
  if (status.longBonds) text('#studio-feedback', 'Some bonds are stretched. They may break in the water.');
  else if (status.ready) text('#studio-feedback', 'Enclosure, heredity, and catalysis are present. Survival is still an experiment.');
  else text('#studio-feedback', 'Build any arrangement. Start with a closed membrane, then add a chain and catalysts.');
}
$('#studio-undo').onclick = () => builder.undo(); $('#starter-blueprint').onclick = () => { builder.guided(); toast('An editable molecular example. Change its shape, add components, or test it as it is.'); };
$('#clear-blueprint').onclick = () => builder.clear();
$('#release-blueprint').onclick = () => { if (!builder.particles.length) return; const blueprint = builder.export(); if (snapshot.particles.length + blueprint.particles.length > snapshot.config.particleLimit) { text('#studio-feedback', 'The world is at its particle budget. Raise the budget in Habitat settings first.'); return; } const x = clamp(renderer.camera.x, 170, snapshot.config.width - 170), y = clamp(renderer.camera.y, 170, snapshot.config.height - 170); send('inject', { blueprint, x, y }); dialogResume = true; $('#studio-dialog').close(); };
function downloadJSON(data, filename) { const blob = new Blob([JSON.stringify(data)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
$('#save-blueprint').onclick = () => downloadJSON(builder.export(), 'life-simulator-design.json'); $('#load-blueprint').onclick = () => $('#blueprint-file-input').click();
$('#blueprint-file-input').onchange = async e => { const file = e.target.files[0]; if (!file) return; try { if (file.size > 500000) throw new Error('This design file is too large.'); builder.checkpoint(); builder.restore(JSON.parse(await file.text())); toast('Your molecular design is ready.'); } catch (error) { toast(error.message); } e.target.value = ''; };

const guides = {
  explore: `<p>This is a small water biome, built from interacting molecular packets. Its shapes are the structures themselves: every visible chain and membrane is made of components you can inspect.</p><h3>Let the water tell its story.</h3><ol><li><strong>Observe the default beginning.</strong> Free amphiphiles attract and link. Nucleotides form chains. The first enclosure can appear when a membrane chain closes.</li><li><strong>Give chemistry time.</strong> Try 4× or 16×. The actual speed depends on your device; the physics always advances in fixed steps.</li><li><strong>Change one condition.</strong> Reduce food, increase light, or warm the water. Watch the measured graph and field notes.</li><li><strong>Look inside.</strong> Tap a particle or membrane. Pinch to zoom; drag to pan. The bond, energy, and lineage views reveal different parts of the same world.</li><li><strong>Make an intervention.</strong> In Cell studio, assemble your own geometry. Release it and see whether it persists.</li></ol><div class="guide-callout">An organic run has no scheduled milestones. Assembly can stall and structures can fail. Try another seed, denser conditions, or a seeded starting mode to explore further.</div><h3>Keep a discovery.</h3><p>Use the save icon for an exact local checkpoint or an exported world file. A fresh world first attempts to preserve the previous experiment on this device.</p>`,
  molecules: `<p>Colors and shapes distinguish the molecular packets. The packet represents a small collection or molecular domain, not an individual atom.</p>${Object.entries(TYPES).map(([key, t]) => `<div class="molecule-guide-row"><i style="--dot:${t.color}"></i><div><strong>${t.name}</strong><p>${t.description}</p></div></div>`).join('')}<h3>No ready-made appendages.</h3><p>There is no flagellum or propulsion organelle in the palette. Contractile peptides form chains; their local fueled motion and asymmetric placement can move structures. This is an active-matter approximation, not a molecular reconstruction of a biological flagellum.</p>`,
  science: `<p><strong>This is an artificial chemistry model inspired by biology.</strong> It is not an atomistic simulator, a proven origin-of-life pathway, or a prediction of how real organisms will evolve.</p><h3>What actually emerges?</h3><p>Bonds form from local encounters. Closed lipid-like bond cycles define compartments. RNA-like sequences form and can recruit complementary free nucleotides; copying errors are inherited. Sequence motifs bias local synthesis through a small, explicit artificial code. Geometry, resources, energy, and adhesion shape persistence and collective behavior.</p><p>Membrane growth inserts existing amphiphiles. Opposing membrane segments can reconnect at an actual narrow neck; no timer commands a cell to divide. Daughter compartments are counted only after their boundaries close. Binding peptides can join different enclosures; such an aggregate is not automatically a multicellular organism.</p><h3>Where the model is simplified</h3><ul><li><strong>Two-dimensional water:</strong> overdamped particle motion, noise, imposed currents, and an approximate membrane barrier. There is no full fluid solver.</li><li><strong>Coarse chemistry:</strong> packets have chosen bonding and reaction rules. Membranes are one chain of packets representing a bilayer. Mineral recycling, curvature, permeability, neck reconnection, and template recruitment are abstractions. Copying recruits existing nearby packets and places them beside the template; it is not an atomistic reaction trajectory.</li><li><strong>Heredity:</strong> an RNA-like template and motif system, not modern DNA translation. There are no ribosomes, complete genomes, meiosis, or sexual reproduction.</li><li><strong>Nested cells:</strong> internal enclosures and exchange model aspects of compartmentalization and endosymbiosis. They do not reconstruct the full origin of a nucleus, mitochondrion, or eukaryote.</li><li><strong>Open system:</strong> light adds energy; nutrient sources add matter; boundary outflow can remove waste. Reactions transform existing packets. Builder additions are recorded as interventions.</li><li><strong>Time and scale:</strong> units belong to this model and do not correspond to geological years or real molecular rates. Life, complexity, and multicellularity are never guaranteed.</li></ul><h3>Grounded in real questions</h3><p>How can a boundary retain useful chemistry? How do copying fidelity and resources affect lineages? When does cooperation help a collective persist? Use the model to explore these relationships, then compare with the experimental literature.</p><div class="guide-links"><a href="https://www.nature.com/articles/nature08013" target="_blank" rel="noopener noreferrer">Prebiotic nucleotide chemistry</a><a href="https://elifesciences.org/articles/35255" target="_blank" rel="noopener noreferrer">RNA-catalyzed copying</a><a href="https://www.nature.com/articles/s41586-026-10137-y" target="_blank" rel="noopener noreferrer">Clonal and aggregative multicellularity</a></div>`
};
function guide(section = 'explore') { $('#guide-content').innerHTML = guides[section]; $$('[data-guide]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.guide === section))); if (!$('#guide-dialog').open) showDialog('#guide-dialog'); }
$('#guide-button').onclick = $('#mobile-guide').onclick = () => guide(); $('#model-button').onclick = () => guide('science'); $$('[data-guide]').forEach(b => b.onclick = () => guide(b.dataset.guide));

function openFiles() { try { const local = JSON.parse(localStorage.getItem(localKey) || 'null'); text('#saved-time', local ? `Saved ${new Date(local.savedAt).toLocaleString()}` : 'No saved world yet'); $('#restore-local').disabled = !local; } catch { text('#saved-time', 'Device storage is unavailable'); $('#restore-local').disabled = true; } showDialog('#files-dialog'); }
$('#save-button').onclick = $('#session-button').onclick = openFiles;
$('#save-local').onclick = async () => { try { const world = await checkpoint(); localStorage.setItem(localKey, JSON.stringify({ savedAt: Date.now(), world })); text('#saved-time', `Saved ${new Date().toLocaleString()}`); $('#restore-local').disabled = false; toast('Exact world checkpoint saved on this device.'); } catch (error) { toast(`Could not save on this device. Export a world file instead. ${error.message}`); } };
$('#restore-local').onclick = () => { try { const data = JSON.parse(localStorage.getItem(localKey)); if (!data?.world) throw new Error('No checkpoint is saved on this device.'); send('load', { data: data.world }); $('#files-dialog').close(); toast('Restoring your saved experiment.'); } catch (e) { toast(e.message); } };
$('#export-world').onclick = async () => { try { const data = await checkpoint(); downloadJSON(data, `life-world-${data.config.seed.replace(/[^a-z0-9-]/gi, '_')}.json`); toast('World file exported. On iPhone, find it in Files → Downloads.'); } catch (e) { toast(e.message); } };
$('#import-world').onclick = () => $('#world-file-input').click();
$('#world-file-input').onchange = async e => { const file = e.target.files[0]; if (!file) return; try { if (file.size > 6000000) throw new Error('This world file is too large.'); const data = JSON.parse(await file.text()); send('load', { data }); $('#files-dialog').close(); } catch (error) { toast(`Could not open that world: ${error.message}`); } e.target.value = ''; };
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pendingInstall = e; $('#install-button').hidden = false; });
$('#install-button').onclick = async () => { if (pendingInstall) { await pendingInstall.prompt(); pendingInstall = null; $('#install-button').hidden = true; } };
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: new URL('../', import.meta.url).pathname }).then(() => navigator.serviceWorker.ready).then(() => { text('#offline-status', 'OFFLINE READY'); text('#install-status', 'Ready for offline exploration.'); }).catch(() => { text('#install-status', 'Offline installation is unavailable here. Use the hosted HTTPS app.'); });
} else text('#install-status', 'Serve over HTTPS to install and explore offline.');
// Suspend instead of attempting hidden-tab catch-up; this protects battery and avoids numerical leaps.
let hiddenResume = false;
document.addEventListener('visibilitychange', () => { if (document.hidden) { hiddenResume = running; if (running) setRunning(false); } else if (hiddenResume && !document.querySelector('dialog[open]')) { hiddenResume = false; setRunning(true); } });
window.addEventListener('resize', () => { if (window.innerWidth > 900) closePanels(); });
syncConfig(initial); updatePlayback();
let previousFrame = 0;
function frame(now) { if (!document.hidden && now - previousFrame > 15) { renderer.draw(now); previousFrame = now; const z = renderer.camera.zoom; text('#zoom-label', `${z.toFixed(1)}×`); const unit = z < .35 ? 200 : z < 1.6 ? 100 : 20; text('#scale-label', `${unit} model units`); $('.scale-bar i').style.width = `${unit * z}px`; } requestAnimationFrame(frame); }
requestAnimationFrame(frame);
