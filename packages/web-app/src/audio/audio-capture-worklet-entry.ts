/**
 * Audio worklet entry — loaded via
 * `audioContext.audioWorklet.addModule(new URL('./audio-capture-worklet-entry.ts', import.meta.url))`
 * from the main thread. Vite bundles this file as an audio-worklet
 * module and rewrites the URL to the emitted asset.
 *
 * Runs in AudioWorkletGlobalScope. All we do here is call the
 * install function that lives in the adapters package, which defines
 * the AudioCaptureProcessor class and registers it under the name
 * "audio-capture".
 */
import { installAudioCaptureProcessor } from "@synesthetica/adapters";
installAudioCaptureProcessor();
