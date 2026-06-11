# 260610_ChladniCymatics

260610_ChladniCymatics is a Vite + Three.js cymatics explorer that renders Chladni-style sand patterns as dense particles on a black field. The app uses a WebGPU-first simulation/rendering path with a WebGL2 fallback, analytic Chladni mode interpolation, live audio output, and a dial-based interface for exploring resonance frequencies from 345 Hz to 5907 Hz.

## Features
- WebGPU particle simulation and display using Three.js WebGPU/TSL compute, with WebGL2 fallback for unsupported browsers.
- Analytic Chladni mode table drives smooth real-time morphing between nodal patterns as frequency changes.
- Black-background particle field with soft additive off-white sand sprites, adjustable particle size, blur, and randomized path offset for thicker visible traces.
- Default startup state opens at 1820 Hz with 300k WebGPU particles, 0.20x speed, 0.020 particle size, 0.030 offset, and 5% blur.
- iOS-inspired frequency dial, reference preset buttons, and canvas-click random preset jumping.
- Preset buttons reset the sand on each jump; clicking the active preset also restarts the tone.
- Per-renderer particle-count memory keeps WebGPU and WebGL2 counts independent, with WebGPU up to 500k and WebGL2 capped at 50k.
- Muted-by-default Web Audio oscillator tracks the exact dial frequency, with a flat yellow Unmute button and transparent live Mute state.
- App-level right-click browser menu blocking and text-selection prevention keep the page interaction focused on the instrument.

## Getting Started
1. `npm install`
2. `npm run dev` to start Vite on `http://127.0.0.1:5173`
3. Open the app in a WebGPU-capable browser for the full compute/render path.
4. Use `Use WebGL2` in the UI to inspect the reduced fallback mode.
5. `npm run build` to emit a production build.

## Controls
- **Frequency Dial:** Drag the circular dial to change frequency continuously and morph the particle pattern in real time.
- **Preset Buttons:** Click a Hz preset to jump to that Chladni mode and reset the sand; click the active preset to restart the tone at the same frequency.
- **Canvas Click:** Click the particle canvas to jump to a random preset and reset the sand.
- **Particles:** Rebuild the simulation at the selected count; WebGPU supports 5k-500k and WebGL2 supports 5k-50k.
- **Speed:** Adjust how quickly particles move toward their nodal paths.
- **Size:** Scale the particle sprite diameter.
- **Offset:** Add each particle's fixed random render offset from its exact path, making paths appear thicker.
- **Blur:** Blend from crisp particles at 0% to soft additive sand sprites at higher values.
- **Reset Sand:** Restart the particle distribution without changing the current frequency.
- **Use WebGL2 / Use WebGPU:** Switch renderer modes on the same app URL.
- **Unmute Tone / Mute Tone:** Start or stop the exact-Hz oscillator; when unmuted, frequency changes update the tone live.
- **Keyboard:** Use arrow keys on the dial for fine frequency changes, or Shift+Arrow for larger steps.

## Deployment
- **Local production preview:** `npm install`, then `npm run build` followed by `npm run preview` to inspect the compiled bundle.
- **Publish to GitHub Pages:** From a clean `main`, run `npm run build -- --base=./`. Checkout (or create) the `gh-pages` branch in a separate worktree or temp clone, copy everything inside `dist/` plus a `.nojekyll` marker to its root, keep the flat Pages structure (`index.html`, `assets/`, optional `env/`, `.gitignore`, `.nojekyll`), commit with a descriptive message, `git push origin gh-pages`, then switch back to `main`.
- **Live demo:** https://ekimroyrp.github.io/260610_ChladniCymatics/
