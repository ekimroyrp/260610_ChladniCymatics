# 260610_ChladniCymatics

260610_ChladniCymatics is a WebGPU-first Three.js cymatics explorer that renders Chladni-style sand patterns on a square plate. The app uses analytic plate modes to move thousands of particles toward nodal lines in real time while a frequency dial changes the audible and visual resonance.

## Features

- WebGPU particle simulation and display using Three.js WebGPU/TSL compute.
- Reduced WebGL fallback for browsers without WebGPU support.
- Real-time frequency dial from 345 Hz to 5907 Hz.
- Particle-count slider from 5k to 500k particles.
- Muted-by-default Web Audio tone that follows the exact dial frequency.
- Responsive top-down plate view with realistic off-white sand particles.

## Getting Started

Install dependencies and run the Vite dev server:

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173/` in a WebGPU-capable browser. To inspect the reduced fallback intentionally, open `http://127.0.0.1:5173/?renderer=webgl`.

Build for production:

```powershell
npm run build
```

## Controls

- Drag the circular dial to change frequency and morph the sand pattern.
- Use the particle slider to rebuild the simulation from 5k to 500k particles.
- Click the tone button to unmute or mute the exact-Hz oscillator.
- Use arrow keys on the dial for fine frequency changes, or Shift+Arrow for larger steps.
