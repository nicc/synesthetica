/**
 * Inference worker entry point (`@synesthetica/adapters/worker`).
 *
 * Kept off the package's main entry because it pulls in TensorFlow.js
 * and Basic Pitch (~2 MB). Only the worker bundle should load them; a
 * keyboard or MIDI session never does.
 */
export { installInferenceWorker } from "./audio/InferenceWorker";
