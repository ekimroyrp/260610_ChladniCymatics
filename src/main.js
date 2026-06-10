import "./styles.css";
import { createAudioController } from "./audio.js";
import { createInterface } from "./ui.js";
import { MIN_FREQUENCY } from "./patterns.js";
import { WebGPUChladniRenderer } from "./renderers/webgpuParticles.js";
import { WebGLFallbackRenderer } from "./renderers/webglFallback.js";

const DEFAULT_PARTICLE_COUNT = 150000;
const FALLBACK_PARTICLE_CAP = 50000;
const WEBGPU_RENDERER = "webgpu";
const WEBGL_RENDERER = "webgl";

const appState = {
  frequencyHz: MIN_FREQUENCY,
  particleCount: DEFAULT_PARTICLE_COUNT,
  muted: true,
  rendererMode: "WebGPU",
  isFallback: false
};

const root = document.querySelector("#app");
const audio = createAudioController(appState.frequencyHz);

let activeRenderer = null;
let ui = null;
let requestedParticleCount = DEFAULT_PARTICLE_COUNT;

startApp().catch((error) => {
  console.error(error);
  root.innerHTML = `
    <section class="app-error">
      <div>
        <h1>Unable to start Chladni Cymatics</h1>
        <p>${error instanceof Error ? error.message : "The renderer failed to initialize."}</p>
      </div>
    </section>
  `;
});

async function startApp() {
  ui = createInterface(root, appState, {
    onFrequencyChange: (frequencyHz) => {
      appState.frequencyHz = frequencyHz;
      audio.setFrequency(frequencyHz);
      activeRenderer?.updateFrequency(frequencyHz);
    },
    onParticleCountChange: async (particleCount) => {
      const requestedCount = Number(particleCount);
      requestedParticleCount = requestedCount;
      const actualCount = await activeRenderer.setParticleCount(requestedCount);
      appState.particleCount = actualCount ?? requestedCount;
      ui.updateParticleCount(appState.particleCount);
      return appState.particleCount;
    },
    onMutedChange: async (muted) => {
      appState.muted = muted;
      await audio.setMuted(muted);
    },
    onResetParticles: async () => {
      const actualCount = await activeRenderer.resetParticles();
      appState.particleCount = actualCount ?? appState.particleCount;
      return appState.particleCount;
    },
    onRendererToggle: async () => {
      const nextRenderer = appState.isFallback ? WEBGPU_RENDERER : WEBGL_RENDERER;
      await switchRenderer(nextRenderer);
    }
  });

  activeRenderer = await createAndInitRenderer(ui.sceneRoot, appState, WEBGPU_RENDERER);
  activeRenderer.updateFrequency(appState.frequencyHz);
  ui.updateStatus(appState.rendererMode, appState.isFallback);

  window.chladniApp = {
    state: appState,
    setFrequency(frequencyHz) {
      appState.frequencyHz = frequencyHz;
      ui.updateFrequency(frequencyHz);
      audio.setFrequency(frequencyHz);
      activeRenderer.updateFrequency(frequencyHz);
    },
    async setParticleCount(particleCount) {
      requestedParticleCount = Number(particleCount);
      const actualCount = await activeRenderer.setParticleCount(particleCount);
      appState.particleCount = actualCount ?? particleCount;
      ui.updateParticleCount(appState.particleCount);
    },
    async setRendererMode(rendererMode) {
      await switchRenderer(rendererMode === WEBGL_RENDERER ? WEBGL_RENDERER : WEBGPU_RENDERER);
    }
  };
}

async function switchRenderer(rendererMode) {
  activeRenderer?.dispose();
  ui.sceneRoot.innerHTML = "";

  activeRenderer = await createAndInitRenderer(ui.sceneRoot, appState, rendererMode);
  activeRenderer.updateFrequency(appState.frequencyHz);
  ui.updateParticleCount(appState.particleCount);
  ui.updateStatus(appState.rendererMode, appState.isFallback);
}

async function createAndInitRenderer(container, state, preferredRenderer) {
  if (preferredRenderer === WEBGPU_RENDERER && navigator.gpu) {
    try {
      state.rendererMode = "WebGPU";
      state.isFallback = false;
      state.particleCount = requestedParticleCount;
      const renderer = new WebGPUChladniRenderer(container, state);
      await renderer.init();
      return renderer;
    } catch (error) {
      console.warn("WebGPU renderer failed, using WebGL fallback.", error);
      container.innerHTML = "";
    }
  }

  state.rendererMode = "WebGL2";
  state.isFallback = true;
  state.particleCount = Math.min(requestedParticleCount, FALLBACK_PARTICLE_CAP);
  ui.updateParticleCount(state.particleCount);
  const fallbackRenderer = new WebGLFallbackRenderer(container, state);
  await fallbackRenderer.init();
  return fallbackRenderer;
}
