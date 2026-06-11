import * as THREE from "three";
import { evaluateMixedField, evaluateMixedGradient } from "../patterns.js";

const PLATE_HALF = 3.15;
const FALLBACK_CAP = 50000;
const DEFAULT_PARTICLE_SIZE = 0.01;
const BASE_OPACITY_AMOUNT = 100000;
const BASE_PARTICLE_OPACITY = 0.015;
const LOW_BLUR_PARTICLE_OPACITY = 0.055;
const WEBGL_POINT_SIZE_SCALE = 300;
const CRISP_PARTICLE_OPACITY = 0.92;
const BLUR_RESPONSE_POWER = 3.2;
const PARTICLE_TEXTURE_SIZE = 64;

export class WebGLFallbackRenderer {
  constructor(container, initialState) {
    this.container = container;
    this.frequencyHz = initialState.frequencyHz;
    this.particleCount = Math.min(initialState.particleCount, FALLBACK_CAP);
    this.particleSpeed = initialState.particleSpeed ?? 1;
    this.particleSize = initialState.particleSize ?? DEFAULT_PARTICLE_SIZE;
    this.particleBlur = initialState.particleBlur ?? 1;
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
    this.particleTexture = createParticleTexture();
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
      vertexColors: true,
      transparent: true,
      depthWrite: false
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    this.applyParticleMaterialSettings();
    this.scene.add(this.points);
  }

  updateFrequency(frequencyHz) {
    this.frequencyHz = frequencyHz;
  }

  setParticleSpeed(nextSpeed) {
    this.particleSpeed = nextSpeed;
  }

  setParticleSize(nextSize) {
    this.particleSize = nextSize;
    this.applyParticleMaterialSettings();
  }

  setParticleBlur(nextBlur) {
    this.particleBlur = clamp01(nextBlur);
    this.applyParticleMaterialSettings();
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
    const speed = this.particleSpeed;

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

      let nextX = this.positions[offset3] + this.velocities[offset2] * speed;
      let nextY = this.positions[offset3 + 1] + this.velocities[offset2 + 1] * speed;

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
    this.particleTexture.dispose();
    this.renderer.domElement.remove();
  }

  applyParticleMaterialSettings() {
    if (!this.points) return;

    const material = this.points.material;
    const blur = clamp01(this.particleBlur);

    if (blur <= 0.001) {
      material.size = toWebGLPointSize(this.particleSize);
      material.sizeAttenuation = false;
      material.map = null;
      material.alphaMap = null;
      material.blending = THREE.NormalBlending;
      material.opacity = CRISP_PARTICLE_OPACITY;
    } else {
      updateParticleTexture(this.particleTexture, easeBlur(blur));
      material.size = toWebGLPointSize(this.particleSize);
      material.sizeAttenuation = false;
      material.map = this.particleTexture;
      material.alphaMap = this.particleTexture;
      material.blending = THREE.AdditiveBlending;
      material.opacity = getParticleOpacityForSettings(this.particleCount, this.particleSize, blur);
    }

    material.needsUpdate = true;
  }
}

function createSoftParticleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = PARTICLE_TEXTURE_SIZE;
  canvas.height = PARTICLE_TEXTURE_SIZE;
  const texture = new THREE.CanvasTexture(canvas);
  texture.userData.canvas = canvas;
  updateParticleTexture(texture, 1);
  return texture;
}

function createParticleTexture() {
  return createSoftParticleTexture();
}

function updateParticleTexture(texture, blurAmount) {
  const canvas = texture.userData.canvas;
  const context = canvas.getContext("2d");
  const center = PARTICLE_TEXTURE_SIZE / 2;
  const blur = clamp01(blurAmount);
  const hardEdge = 0.48 - blur * 0.32;
  const midEdge = 0.58 + blur * 0.04;

  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(Math.max(0.08, hardEdge), `rgba(255, 255, 255, ${1 - blur * 0.58})`);
  gradient.addColorStop(Math.max(hardEdge + 0.02, midEdge), `rgba(255, 255, 255, ${blur * 0.12})`);
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  context.clearRect(0, 0, PARTICLE_TEXTURE_SIZE, PARTICLE_TEXTURE_SIZE);
  context.fillStyle = gradient;
  context.fillRect(0, 0, PARTICLE_TEXTURE_SIZE, PARTICLE_TEXTURE_SIZE);
  texture.needsUpdate = true;
}

function getParticleOpacityForSettings(amount, particleSize = DEFAULT_PARTICLE_SIZE, particleBlur = 1) {
  const blur = clamp01(particleBlur);
  if (blur <= 0.001) return CRISP_PARTICLE_OPACITY;
  const easedBlur = easeBlur(blur);

  const safeAmount = Math.max(1, amount);
  const sizeScale = Math.min(1.4, Math.max(0.25, DEFAULT_PARTICLE_SIZE / Math.max(0.001, particleSize)));
  const softOpacity = Math.min(
    0.05,
    Math.max(0.004, BASE_PARTICLE_OPACITY * Math.sqrt(BASE_OPACITY_AMOUNT / safeAmount) * sizeScale)
  );
  return mixNumber(LOW_BLUR_PARTICLE_OPACITY, softOpacity, easedBlur);
}

function toWebGLPointSize(size) {
  return Math.max(1, size * WEBGL_POINT_SIZE_SCALE);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value)));
}

function mixNumber(a, b, t) {
  const amount = clamp01(t);
  return a * (1 - amount) + b * amount;
}

function easeBlur(value) {
  return Math.pow(clamp01(value), BLUR_RESPONSE_POWER);
}

function seeded(value) {
  const x = Math.sin(value * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
