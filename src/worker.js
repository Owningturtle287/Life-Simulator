import { World } from './engine.js';

let world, running = true, speed = 1, debt = 0, last = performance.now(), posted = 0, measured = 0, start = last, actualSpeed = 1;
const respond = (type, payload = {}) => postMessage({ type, ...payload });
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'init') { world = new World(data.config); debt = 0; last = performance.now(); respond('snapshot', { snapshot: world.snapshot(), running, speed, actualSpeed }); }
    if (data.type === 'run') { running = !!data.running; debt = 0; last = performance.now(); }
    if (data.type === 'speed') { speed = [1, 4, 16, 64].includes(data.speed) ? data.speed : 1; debt = 0; }
    if (data.type === 'configure') world.configure(data.config);
    if (data.type === 'inject') { const id = world.inject(data.blueprint, data.x, data.y); respond('injected', { id }); }
    if (data.type === 'brush') world.brush(data.kind, data.x, data.y);
    if (data.type === 'step') world.step(1);
    if (data.type === 'save') respond('saved', { request: data.request, data: world.save() });
    if (data.type === 'load') { world = World.load(data.data); debt = 0; last = performance.now(); respond('loaded', { config: world.config }); }
    if (world && !['save', 'speed'].includes(data.type)) respond('snapshot', { snapshot: world.snapshot(), running, speed, actualSpeed });
  } catch (error) { respond('error', { message: error.message, request: data.request }); }
};
function loop() {
  const now = performance.now(), elapsed = Math.min((now - last) / 1000, .1); last = now;
  if (world && running) {
    debt = Math.min(debt + elapsed * 60 * speed, 240);
    const deadline = performance.now() + 11; let done = 0;
    while (debt >= 1 && performance.now() < deadline) { world.step(); debt--; done++; }
    measured += done;
  }
  if (now - start >= 1000) { actualSpeed = measured / 60 / ((now - start) / 1000); measured = 0; start = now; }
  if (world && now - posted > 42) { respond('snapshot', { snapshot: world.snapshot(), running, speed, actualSpeed }); posted = now; }
  setTimeout(loop, 4);
}
loop();
