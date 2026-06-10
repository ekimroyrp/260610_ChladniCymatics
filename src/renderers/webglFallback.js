import * as THREE from "three";
import { evaluateMixedField, evaluateMixedGradient } from "../patterns.js";

const PLATE_HALF = 3.15;
const FALLBACK_CAP = 50000;

export class WebGLFallbackRenderer {
  constructor(container, initialState) {
    this.container = container;
    this.frequencyHz = initialState.frequencyHz;
    this.particleCount = Math.min(initialState.particleCount, FALLBACK_CAP);
    this.positions = null;
    this.velocities = null;
    this.seeds = null;
    this.geometry = null;
    this.points = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.resizeObserver = null;
    this.animationFrame = 0;
    this.seedBase = 0;
  }

  async init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080909);

    this.camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 20);
    this.camera.position.set(0, 0, 8);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.append(this.renderer.domElement);

    this.addPlate();
    this.rebuildParticles(this.particleCount);
    this.resize();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.animate();
  }

  addPlate() {
    const plateGeometry = new THREE.PlaneGeometry(PLATE_HALF * 2, PLATE_HALF * 2);
    const plateMaterial = new THREE.MeshBasicMaterial({ color: 0x202628 });
    const plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.position.z = -0.035;
    this.scene.add(plate);

    const rim = new THREE.LineSegments(
      new THREE.EdgesGeometry(plateGeometry),
      new THREE.LineBasicMaterial({ color: 0x4c5558, transparent: true, opacity: 0.62 })
    );
    rim.position.z = -0.025;
    this.scene.add(rim);

    const bolt = new THREE.Mesh(
      new THREE.CircleGeometry(0.07, 40),
      new THREE.MeshBasicMaterial({ color: 0xb8bab2 })
    );
    bolt.position.z = 0.02;
    this.scene.add(bolt);
  }

  rebuildParticles(requestedCount) {
    this.particleCount = Math.min(requestedCount, FALLBACK_CAP);

    if (this.points) {
      this.scene.remove(this.points);
      this.geometry.dispose();
      this.points.material.dispose();
    }

    this.positions = new Float32Array(this.particleCount * 3);
    this.velocities = new Float32Array(this.particleCount * 2);
    this.seeds = new Float32Array(this.particleCount);
    const colors = new Float32Array(this.particleCount * 3);

    for (let index = 0; index < this.particleCount; index += 1) {
      const offset3 = index * 3;
      const seed = seeded(index + 1 + this.seedBase);
      const x = seeded(index * 7 + 11 + this.seedBase) * 2 - 1;
      const y = seeded(index * 13 + 19 + this.seedBase) * 2 - 1;
      const tone = 0.82 + seeded(index * 17 + 3 + this.seedBase) * 0.16;

      this.positions[offset3] = x * PLATE_HALF * 0.96;
      this.positions[offset3 + 1] = y * PLATE_HALF * 0.96;
      this.positions[offset3 + 2] = 0;
      this.seeds[index] = seed;
      colors[offset3] = tone;
      colors[offset3 + 1] = tone * 0.985;
      colors[offset3 + 2] = tone * 0.91;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.028,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  updateFrequency(frequencyHz) {
    this.frequencyHz = frequencyHz;
  }

  async setParticleCount(nextCount) {
    this.rebuildParticles(nextCount);
    return this.particleCount;
  }

  async resetParticles() {
    this.seedBase += 1009;
    this.rebuildParticles(this.particleCount);
    return this.particleCount;
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const aspect = width / height;
    const view = aspect > 1 ? 4.1 : 4.1 / aspect;

    this.camera.left = -view * aspect;
    this.camera.right = view * aspect;
    this.camera.top = view;
    this.camera.bottom = -view;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    this.step();
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = window.requestAnimationFrame(() => this.animate());
  }

  step() {
    const attraction = 0.00115;
    const damping = 0.9;
    const jitter = 0.0009;
    const time = performance.now() * 0.001;

    for (let index = 0; index < this.particleCount; index += 1) {
      const offset3 = index * 3;
      const offset2 = index * 2;
      const x = this.positions[offset3] / PLATE_HALF;
      const y = this.positions[offset3 + 1] / PLATE_HALF;
      const field = evaluateMixedField(x, y, this.frequencyHz);
      const gradient = evaluateMixedGradient(x, y, this.frequencyHz);
      const pull = -field * attraction;
      const pulse = Math.sin(this.seeds[index] * 91.7 + time) * jitter;

      this.velocities[offset2] = (this.velocities[offset2] + gradient.x * pull + pulse * 0.6) * damping;
      this.velocities[offset2 + 1] = (this.velocities[offset2 + 1] + gradient.y * pull + pulse * 0.35) * damping;

      let nextX = this.positions[offset3] + this.velocities[offset2];
      let nextY = this.positions[offset3 + 1] + this.velocities[offset2 + 1];

      if (nextX > PLATE_HALF) {
        nextX = PLATE_HALF;
        this.velocities[offset2] = -Math.abs(this.velocities[offset2]) * 0.35;
      } else if (nextX < -PLATE_HALF) {
        nextX = -PLATE_HALF;
        this.velocities[offset2] = Math.abs(this.velocities[offset2]) * 0.35;
      }

      if (nextY > PLATE_HALF) {
        nextY = PLATE_HALF;
        this.velocities[offset2 + 1] = -Math.abs(this.velocities[offset2 + 1]) * 0.35;
      } else if (nextY < -PLATE_HALF) {
        nextY = -PLATE_HALF;
        this.velocities[offset2 + 1] = Math.abs(this.velocities[offset2 + 1]) * 0.35;
      }

      this.positions[offset3] = nextX;
      this.positions[offset3 + 1] = nextY;
    }

    this.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    window.cancelAnimationFrame(this.animationFrame);
    this.resizeObserver?.disconnect();
    this.scene.traverse((object) => {
      object.geometry?.dispose?.();
      object.material?.dispose?.();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function seeded(value) {
  const x = Math.sin(value * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
