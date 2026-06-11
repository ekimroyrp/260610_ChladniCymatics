import { MAX_FREQUENCY, MIN_FREQUENCY, PATTERN_MODES } from "./patterns.js";

const MIN_PARTICLES = 5000;
const WEBGPU_MAX_PARTICLES = 500000;
const WEBGL_MAX_PARTICLES = 50000;
const DIAL_START_DEGREES = 140;
const DIAL_SWEEP_DEGREES = 260;
const DIAL_END_DEGREES = DIAL_START_DEGREES + DIAL_SWEEP_DEGREES;
const DIAL_RADIUS = 142;

export function createInterface(root, initialState, handlers) {
  root.innerHTML = `
    <main class="app-shell">
      <section class="stage" aria-label="Chladni cymatics plate">
        <div id="scene-root" class="scene-root"></div>
        <div class="status-pill" id="renderer-status"></div>
      </section>
      <aside class="control-panel" aria-label="Cymatics controls">
        <div class="dial" id="frequency-dial" role="slider" aria-label="Frequency" tabindex="0"
          aria-valuemin="${MIN_FREQUENCY}" aria-valuemax="${MAX_FREQUENCY}" aria-valuenow="${Math.round(initialState.frequencyHz)}">
          <svg class="dial-svg" viewBox="0 0 320 320" aria-hidden="true">
            <circle class="dial-base" cx="160" cy="160" r="${DIAL_RADIUS}"></circle>
            <circle class="dial-arc" id="dial-arc" cx="160" cy="160" r="${DIAL_RADIUS}"></circle>
            <g id="dial-ticks"></g>
            <circle class="dial-knob" id="dial-knob" cx="160" cy="30" r="17"></circle>
          </svg>
          <div class="dial-center">
            <strong id="dial-center-frequency">${Math.round(initialState.frequencyHz)}</strong>
            <span>Hz</span>
          </div>
        </div>
        <div class="section-heading">Presets</div>
        <div class="preset-strip" id="preset-strip" aria-label="Frequency presets">
          ${PATTERN_MODES.map((mode) => `<button class="preset-button" type="button" data-frequency="${mode.frequency}">${mode.frequency}</button>`).join("")}
        </div>
        <div class="particle-control">
          <div class="control-row">
            <label for="particle-count">Particles</label>
            <output id="particle-count-output">${formatParticleCount(initialState.particleCount)}</output>
          </div>
          <input id="particle-count" class="particle-slider" type="range" min="${MIN_PARTICLES}" max="${WEBGPU_MAX_PARTICLES}" step="5000" value="${initialState.particleCount}" />
        </div>
        <div class="action-row">
          <button class="secondary-button" id="reset-sand" type="button">Reset Sand</button>
          <button class="secondary-button" id="renderer-toggle" type="button">Use WebGL2</button>
        </div>
        <button class="mute-button" id="mute-button" type="button" aria-pressed="${!initialState.muted}">
          <span class="mute-icon" aria-hidden="true"></span>
          <span id="mute-label">${initialState.muted ? "Unmute Tone" : "Mute Tone"}</span>
        </button>
      </aside>
    </main>
  `;

  const sceneRoot = root.querySelector("#scene-root");
  const dial = root.querySelector("#frequency-dial");
  const arc = root.querySelector("#dial-arc");
  const knob = root.querySelector("#dial-knob");
  const ticks = root.querySelector("#dial-ticks");
  const centerValue = root.querySelector("#dial-center-frequency");
  const particleSlider = root.querySelector("#particle-count");
  const particleOutput = root.querySelector("#particle-count-output");
  const presetStrip = root.querySelector("#preset-strip");
  const resetSandButton = root.querySelector("#reset-sand");
  const rendererToggle = root.querySelector("#renderer-toggle");
  const muteButton = root.querySelector("#mute-button");
  const muteLabel = root.querySelector("#mute-label");
  const rendererStatus = root.querySelector("#renderer-status");

  let frequencyHz = initialState.frequencyHz;
  let muted = initialState.muted;
  let pointerActive = false;

  renderTicks(ticks);
  updateFrequencyVisuals(frequencyHz);
  updateStatus(initialState.rendererMode, initialState.isFallback);

  dial.addEventListener("pointerdown", (event) => {
    pointerActive = true;
    dial.setPointerCapture(event.pointerId);
    updateFrequencyFromPointer(event);
  });

  dial.addEventListener("pointermove", (event) => {
    if (!pointerActive) return;
    updateFrequencyFromPointer(event);
  });

  dial.addEventListener("pointerup", (event) => {
    pointerActive = false;
    dial.releasePointerCapture(event.pointerId);
  });

  dial.addEventListener("pointercancel", () => {
    pointerActive = false;
  });

  dial.addEventListener("keydown", (event) => {
    const coarse = event.shiftKey ? 250 : 25;

    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      setFrequency(Math.min(MAX_FREQUENCY, frequencyHz + coarse), true);
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      setFrequency(Math.max(MIN_FREQUENCY, frequencyHz - coarse), true);
    }
  });

  particleSlider.addEventListener("input", () => {
    const count = Number(particleSlider.value);
    particleOutput.textContent = formatParticleCount(count);
  });

  particleSlider.addEventListener("change", async () => {
    const count = Number(particleSlider.value);
    setControlsBusy(true);
    try {
      const actualCount = await handlers.onParticleCountChange(count);
      if (actualCount) {
        particleSlider.value = actualCount;
        particleOutput.textContent = formatParticleCount(actualCount);
      }
    } finally {
      setControlsBusy(false);
    }
  });

  presetStrip.addEventListener("click", (event) => {
    const button = event.target.closest("[data-frequency]");
    if (!button) return;

    const nextFrequency = Number(button.dataset.frequency);
    setFrequency(nextFrequency, true);
  });

  resetSandButton.addEventListener("click", async () => {
    setControlsBusy(true);
    try {
      const actualCount = await handlers.onResetParticles();
      if (actualCount) {
        particleSlider.value = actualCount;
        particleOutput.textContent = formatParticleCount(actualCount);
      }
    } finally {
      setControlsBusy(false);
    }
  });

  rendererToggle.addEventListener("click", async () => {
    setControlsBusy(true);
    try {
      await handlers.onRendererToggle();
    } finally {
      setControlsBusy(false);
    }
  });

  muteButton.addEventListener("click", async () => {
    muted = !muted;
    updateMute();
    muteButton.disabled = true;
    try {
      await handlers.onMutedChange(muted);
    } finally {
      muteButton.disabled = false;
    }
  });

  function updateFrequencyFromPointer(event) {
    const rect = dial.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    const angle = Math.atan2(y, x);
    const progress = angleToProgress(angle);
    const nextFrequency = MIN_FREQUENCY + progress * (MAX_FREQUENCY - MIN_FREQUENCY);
    setFrequency(nextFrequency, true);
  }

  function setFrequency(nextFrequency, emit) {
    frequencyHz = Math.round(Math.min(MAX_FREQUENCY, Math.max(MIN_FREQUENCY, nextFrequency)));
    updateFrequencyVisuals(frequencyHz);

    if (emit) {
      handlers.onFrequencyChange(frequencyHz);
    }
  }

  function updateFrequencyVisuals(nextFrequency) {
    const progress = (nextFrequency - MIN_FREQUENCY) / (MAX_FREQUENCY - MIN_FREQUENCY);
    const angle = progressToAngle(progress);
    const point = polarToCartesian(160, 160, DIAL_RADIUS, angle);
    const circumference = 2 * Math.PI * DIAL_RADIUS;
    const visibleLength = circumference * DIAL_SWEEP_DEGREES / 360 * progress;

    arc.style.strokeDasharray = `${visibleLength} ${circumference}`;
    arc.style.strokeDashoffset = "0";
    knob.setAttribute("cx", point.x);
    knob.setAttribute("cy", point.y);
    centerValue.textContent = Math.round(nextFrequency);
    dial.setAttribute("aria-valuenow", Math.round(nextFrequency));
  }

  function updateMute() {
    muteButton.setAttribute("aria-pressed", String(!muted));
    muteLabel.textContent = muted ? "Unmute Tone" : "Mute Tone";
    muteButton.classList.toggle("is-live", !muted);
  }

  return {
    sceneRoot,
    updateFrequency: (nextFrequency) => setFrequency(nextFrequency, false),
    updateParticleCount: (count) => {
      particleSlider.value = count;
      particleOutput.textContent = formatParticleCount(count);
    },
    updateStatus
  };

  function updateStatus(rendererMode, isFallback) {
    particleSlider.max = String(isFallback ? WEBGL_MAX_PARTICLES : WEBGPU_MAX_PARTICLES);
    rendererStatus.textContent = rendererMode;
    rendererStatus.classList.toggle("is-fallback", isFallback);
    rendererToggle.textContent = isFallback ? "Use WebGPU" : "Use WebGL2";
  }

  function setControlsBusy(isBusy) {
    particleSlider.disabled = isBusy;
    resetSandButton.disabled = isBusy;
    rendererToggle.disabled = isBusy;
    presetStrip.querySelectorAll("button").forEach((button) => {
      button.disabled = isBusy;
    });
  }
}

function renderTicks(group) {
  const labels = [
    { frequency: MIN_FREQUENCY, label: "345" },
    { frequency: 1000, label: "1k" },
    { frequency: 2000, label: "2k" },
    { frequency: 3000, label: "3k" },
    { frequency: 4000, label: "4k" },
    { frequency: 5000, label: "5k" },
    { frequency: MAX_FREQUENCY, label: "6k" }
  ];

  for (const mark of labels) {
    const progress = (mark.frequency - MIN_FREQUENCY) / (MAX_FREQUENCY - MIN_FREQUENCY);
    const angle = progressToAngle(progress);
    const outer = polarToCartesian(160, 160, 124, angle);
    const inner = polarToCartesian(160, 160, 109, angle);
    const label = polarToCartesian(160, 160, 84, angle);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", inner.x);
    line.setAttribute("y1", inner.y);
    line.setAttribute("x2", outer.x);
    line.setAttribute("y2", outer.y);
    line.setAttribute("class", "dial-tick");
    group.append(line);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", label.x);
    text.setAttribute("y", label.y);
    text.setAttribute("class", "dial-label");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.textContent = mark.label;
    group.append(text);
  }
}

function progressToAngle(progress) {
  return (DIAL_START_DEGREES + progress * DIAL_SWEEP_DEGREES) * (Math.PI / 180);
}

function angleToProgress(angle) {
  let degrees = angle * (180 / Math.PI);
  if (degrees < 0) degrees += 360;

  const endModulo = DIAL_END_DEGREES % 360;

  if (degrees < endModulo) {
    degrees += 360;
  }

  if (degrees < DIAL_START_DEGREES) {
    const distanceToStart = DIAL_START_DEGREES - degrees;
    const distanceToEnd = degrees + 360 - DIAL_END_DEGREES;
    degrees = distanceToStart <= distanceToEnd ? DIAL_START_DEGREES : DIAL_END_DEGREES;
  }

  const clamped = Math.min(DIAL_END_DEGREES, Math.max(DIAL_START_DEGREES, degrees));
  return (clamped - DIAL_START_DEGREES) / DIAL_SWEEP_DEGREES;
}

function polarToCartesian(cx, cy, radius, angle) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle)
  };
}

function formatParticleCount(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}m`;
  return `${Math.round(value / 1000)}k`;
}
