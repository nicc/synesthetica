/**
 * Inference worker entry — loaded via
 * `new Worker(new URL('./inference-worker-entry.ts', import.meta.url), { type: 'module' })`
 * from the main thread. Vite bundles this file as a module worker
 * and rewrites the URL to the emitted asset.
 *
 * Runs in DedicatedWorkerGlobalScope. All we do here is call the
 * install function that lives in the adapters package, which wires
 * up self.onmessage to receive init / stop messages and drives the
 * Basic Pitch inference loop.
 */
import { installInferenceWorker } from "@synesthetica/adapters";
installInferenceWorker();
