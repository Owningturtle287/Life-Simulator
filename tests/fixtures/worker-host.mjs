// Browser-worker protocol adapter for Node's test runner; no simulation logic here.
import { parentPort } from 'node:worker_threads';
globalThis.self = globalThis;
globalThis.postMessage = data => parentPort.postMessage(data);
await import('../../src/worker.js');
parentPort.on('message', data => self.onmessage({ data }));
parentPort.postMessage({ type: 'ready' });
