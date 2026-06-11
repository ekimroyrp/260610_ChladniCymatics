# 260610_ChladniCymatics

260610_ChladniCymatics is a WebGPU-first Three.js cymatics explorer that renders Chladni-style sand patterns on a square plate. The app uses analytic plate modes to move thousands of particles toward nodal lines in real time while a frequency dial changes the audible and visual resonance.

## Features

- WebGPU particle simulation and display using Three.js WebGPU/TSL compute.
- Reduced WebGL fallback for browsers without WebGPU support.
- Real-time frequency dial from 345 Hz to 5907 Hz.
- Reference frequency preset buttons for the visible Chladni modes.
- Per-renderer particle-count slider: 5k to 500k in WebGPU and 5k to 50k in WebGL2.
- Particle speed, size, and blur controls for live motion and material tuning.
- Sand reset control for restarting the particle distribution.
- In-app WebGPU/WebGL fallback switch.
- Muted-by-default Web Audio tone that follows the exact dial frequency.
- Responsive top-down plate view with soft additive off-white sand particles.

## Getting Started

Install dependencies and run the Vite dev server:

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173/` in a WebGPU-capable browser. Use the in-app renderer switch to inspect the reduced fallback mode.

Build for production:

```powershell
npm run build
```

## Controls

- Drag the circular dial to change frequency and morph the sand pattern.
- Click a preset Hz button to jump to a reference Chladni mode.
- Use the particle slider to rebuild the simulation; WebGPU and WebGL2 remember separate particle counts.
- Use `Speed` to change particle motion rate, `Size` to scale particle diameter, and `Blur` to blend from crisp particles to soft sand sprites.
- Click `Reset Sand` to restart the particle distribution.
- Click `Use WebGL2` or `Use WebGPU` to switch renderer mode.
- Click the tone button to unmute or mute the exact-Hz oscillator.
- Use arrow keys on the dial for fine frequency changes, or Shift+Arrow for larger steps.
