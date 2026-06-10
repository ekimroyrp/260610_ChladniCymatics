import "./styles.css";
import { createAudioController } from "./audio.js";
import { createInterface } from "./ui.js";
import { MIN_FREQUENCY } from "./patterns.js";
import { WebGPUChladniRenderer } from "./renderers/webgpuParticles.js";
import { WebGLFallbackRenderer } from "./renderers/webglFallback.js";

const DEFAULT_PARTICLE_COUNT = 150000;
const FALLBACK_PARTICLE_CAP = 50000;

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
    onRendererToggle: () => {
      const url = new URL(window.location.href);

      if (appState.isFallback) {
        url.searchParams.delete("renderer");
      } else {
        url.searchParams.set("renderer", "webgl");
      }

      window.location.href = url.toString();
    }
  });

  activeRenderer = await createAndInitRenderer(ui.sceneRoot, appState);
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
      const actualCount = await activeRenderer.setParticleCount(particleCount);
      appState.particleCount = actualCount ?? particleCount;
      ui.updateParticleCount(appState.particleCount);
    }
  };
}

async function createAndInitRenderer(container, state) {
  const forcedWebGL = new URLSearchParams(window.location.search).get("renderer") === "webgl";

  if (!forcedWebGL && navigator.gpu) {
    try {
      state.rendererMode = "WebGPU";
      state.isFallback = false;
      const renderer = new WebGPUChladniRenderer(container, state);
      await renderer.init();
      return renderer;
    } catch (error) {
      console.warn("WebGPU renderer failed, using WebGL fallback.", error);
      container.innerHTML = "";
    }
  }

  state.rendererMode = "WebGL";
  state.isFallback = true;
  state.particleCount = Math.min(state.particleCount, FALLBACK_PARTICLE_CAP);
  ui.updateParticleCount(state.particleCount);
  const fallbackRenderer = new WebGLFallbackRenderer(container, state);
  await fallbackRenderer.init();
  return fallbackRenderer;
}
