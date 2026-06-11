import "./styles.css";
import { createAudioController } from "./audio.js";
import { createInterface } from "./ui.js";
import { WebGPUChladniRenderer } from "./renderers/webgpuParticles.js";
import { WebGLFallbackRenderer } from "./renderers/webglFallback.js";

const DEFAULT_FREQUENCY = 1820;
const DEFAULT_PARTICLE_COUNT = 300000;
const DEFAULT_PARTICLE_SPEED = 0.2;
const DEFAULT_PARTICLE_SIZE = 0.02;
const DEFAULT_PARTICLE_OFFSET = 0.03;
const DEFAULT_PARTICLE_BLUR = 0.05;
const FALLBACK_PARTICLE_CAP = 50000;
const WEBGPU_RENDERER = "webgpu";
const WEBGL_RENDERER = "webgl";

const appState = {
  frequencyHz: DEFAULT_FREQUENCY,
  particleCount: DEFAULT_PARTICLE_COUNT,
  particleSpeed: DEFAULT_PARTICLE_SPEED,
  particleSize: DEFAULT_PARTICLE_SIZE,
  particleOffset: DEFAULT_PARTICLE_OFFSET,
  particleBlur: DEFAULT_PARTICLE_BLUR,
  muted: true,
  rendererMode: "WebGPU",
  isFallback: false
};

const root = document.querySelector("#app");
root.addEventListener("contextmenu", (event) => event.preventDefault());

const audio = createAudioController(appState.frequencyHz);

let activeRenderer = null;
let ui = null;
const rendererParticleCounts = {
  [WEBGPU_RENDERER]: DEFAULT_PARTICLE_COUNT,
  [WEBGL_RENDERER]: FALLBACK_PARTICLE_CAP
};

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
      const rendererKey = getActiveRendererKey();
      rendererParticleCounts[rendererKey] = clampParticleCountForRenderer(rendererKey, requestedCount);
      const actualCount = await activeRenderer.setParticleCount(rendererParticleCounts[rendererKey]);
      appState.particleCount = actualCount ?? rendererParticleCounts[rendererKey];
      rendererParticleCounts[rendererKey] = appState.particleCount;
      ui.updateParticleCount(appState.particleCount);
      return appState.particleCount;
    },
    onParticleSpeedChange: (particleSpeed) => {
      appState.particleSpeed = particleSpeed;
      activeRenderer?.setParticleSpeed(particleSpeed);
    },
    onParticleSizeChange: (particleSize) => {
      appState.particleSize = particleSize;
      activeRenderer?.setParticleSize(particleSize);
    },
    onParticleOffsetChange: (particleOffset) => {
      appState.particleOffset = particleOffset;
      activeRenderer?.setParticleOffset(particleOffset);
    },
    onParticleBlurChange: (particleBlur) => {
      appState.particleBlur = particleBlur;
      activeRenderer?.setParticleBlur(particleBlur);
    },
    onMutedChange: async (muted) => {
      appState.muted = muted;
      await audio.setMuted(muted);
    },
    onToneRestart: async () => {
      await audio.restartTone();
    },
    onResetParticles: async () => {
      const actualCount = await activeRenderer.resetParticles();
      appState.particleCount = actualCount ?? appState.particleCount;
      rendererParticleCounts[getActiveRendererKey()] = appState.particleCount;
      return appState.particleCount;
    },
    onRendererToggle: async () => {
      const nextRenderer = appState.isFallback ? WEBGPU_RENDERER : WEBGL_RENDERER;
      await switchRenderer(nextRenderer);
    }
  });

  activeRenderer = await createAndInitRenderer(ui.sceneRoot, appState, WEBGPU_RENDERER);
  activeRenderer.updateFrequency(appState.frequencyHz);
  activeRenderer.setParticleSpeed(appState.particleSpeed);
  activeRenderer.setParticleSize(appState.particleSize);
  activeRenderer.setParticleOffset(appState.particleOffset);
  activeRenderer.setParticleBlur(appState.particleBlur);
  ui.updateStatus(appState.rendererMode, appState.isFallback);
  ui.updateParticleCount(appState.particleCount);
  ui.updateParticleSpeed(appState.particleSpeed);
  ui.updateParticleSize(appState.particleSize);
  ui.updateParticleOffset(appState.particleOffset);
  ui.updateParticleBlur(appState.particleBlur);

  window.chladniApp = {
    state: appState,
    setFrequency(frequencyHz) {
      appState.frequencyHz = frequencyHz;
      ui.updateFrequency(frequencyHz);
      audio.setFrequency(frequencyHz);
      activeRenderer.updateFrequency(frequencyHz);
    },
    async setParticleCount(particleCount) {
      const rendererKey = getActiveRendererKey();
      rendererParticleCounts[rendererKey] = clampParticleCountForRenderer(rendererKey, Number(particleCount));
      const actualCount = await activeRenderer.setParticleCount(rendererParticleCounts[rendererKey]);
      appState.particleCount = actualCount ?? rendererParticleCounts[rendererKey];
      rendererParticleCounts[rendererKey] = appState.particleCount;
      ui.updateParticleCount(appState.particleCount);
    },
    setParticleSpeed(particleSpeed) {
      appState.particleSpeed = Number(particleSpeed);
      ui.updateParticleSpeed(appState.particleSpeed);
      activeRenderer.setParticleSpeed(appState.particleSpeed);
    },
    setParticleSize(particleSize) {
      appState.particleSize = Number(particleSize);
      ui.updateParticleSize(appState.particleSize);
      activeRenderer.setParticleSize(appState.particleSize);
    },
    setParticleOffset(particleOffset) {
      appState.particleOffset = Number(particleOffset);
      ui.updateParticleOffset(appState.particleOffset);
      activeRenderer.setParticleOffset(appState.particleOffset);
    },
    setParticleBlur(particleBlur) {
      appState.particleBlur = Number(particleBlur);
      ui.updateParticleBlur(appState.particleBlur);
      activeRenderer.setParticleBlur(appState.particleBlur);
    },
    async setRendererMode(rendererMode) {
      await switchRenderer(rendererMode === WEBGL_RENDERER ? WEBGL_RENDERER : WEBGPU_RENDERER);
    }
  };
}

async function switchRenderer(rendererMode) {
  rendererParticleCounts[getActiveRendererKey()] = appState.particleCount;
  activeRenderer?.dispose();
  ui.sceneRoot.innerHTML = "";

  activeRenderer = await createAndInitRenderer(ui.sceneRoot, appState, rendererMode);
  activeRenderer.updateFrequency(appState.frequencyHz);
  activeRenderer.setParticleSpeed(appState.particleSpeed);
  activeRenderer.setParticleSize(appState.particleSize);
  activeRenderer.setParticleOffset(appState.particleOffset);
  activeRenderer.setParticleBlur(appState.particleBlur);
  ui.updateStatus(appState.rendererMode, appState.isFallback);
  ui.updateParticleCount(appState.particleCount);
}

async function createAndInitRenderer(container, state, preferredRenderer) {
  if (preferredRenderer === WEBGPU_RENDERER && navigator.gpu) {
    try {
      state.rendererMode = "WebGPU";
      state.isFallback = false;
      state.particleCount = rendererParticleCounts[WEBGPU_RENDERER];
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
  state.particleCount = rendererParticleCounts[WEBGL_RENDERER];
  const fallbackRenderer = new WebGLFallbackRenderer(container, state);
  await fallbackRenderer.init();
  return fallbackRenderer;
}

function getActiveRendererKey() {
  return appState.isFallback ? WEBGL_RENDERER : WEBGPU_RENDERER;
}

function clampParticleCountForRenderer(rendererKey, particleCount) {
  const count = Number.isFinite(particleCount) ? particleCount : DEFAULT_PARTICLE_COUNT;
  return rendererKey === WEBGL_RENDERER ? Math.min(count, FALLBACK_PARTICLE_CAP) : count;
}
