import * as THREE from "three/webgpu";
import {
  Fn,
  If,
  abs,
  cos,
  float,
  hash,
  instanceIndex,
  instancedArray,
  lengthSq,
  mix,
  oneMinus,
  shapeCircle,
  sin,
  smoothstep,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4
} from "three/tsl";
import { getModeMix } from "../patterns.js";

const PLATE_HALF = 3.15;
const WORKGROUP_SIZE = 128;
const PARTICLE_BASE_SIZE = 0.01;
const BASE_OPACITY_AMOUNT = 100000;
const BASE_PARTICLE_OPACITY = 0.006;
const LOW_BLUR_PARTICLE_OPACITY = 0.035;
const CRISP_PARTICLE_OPACITY = 0.9;
const BLUR_RESPONSE_POWER = 3.2;

export class WebGPUChladniRenderer {
  constructor(container, initialState) {
    this.container = container;
    this.frequencyHz = initialState.frequencyHz;
    this.particleCount = initialState.particleCount;
    this.width = 1;
    this.height = 1;
    this.resizeObserver = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.particles = null;
    this.computeInit = null;
    this.computeUpdate = null;

    this.modeA = {
      m: uniform(1),
      n: uniform(2)
    };
    this.modeB = {
      m: uniform(1),
      n: uniform(2)
    };
    this.modeBlend = uniform(0);
    this.particleSpeed = uniform(initialState.particleSpeed ?? 1);
    this.particleSize = uniform(initialState.particleSize ?? PARTICLE_BASE_SIZE);
    this.particleOffset = uniform(initialState.particleOffset ?? 0);
    this.particleBlur = uniform(initialState.particleBlur ?? 1);
    this.particleOpacity = uniform(getParticleOpacityForSettings(this.particleCount, this.particleSize.value, this.particleBlur.value));
    this.attraction = uniform(0.0022);
    this.damping = uniform(0.91);
    this.jitter = uniform(0.0016);
  }

  async init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080909);

    this.camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 20);
    this.camera.position.set(0, 0, 8);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGPURenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.append(this.renderer.domElement);

    await this.renderer.init();

    this.addPlate();
    await this.rebuildParticles(this.particleCount);
    this.updateFrequency(this.frequencyHz);
    this.resize();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.renderer.setAnimationLoop(() => this.animate());
  }

  addPlate() {
    const plateGeometry = new THREE.PlaneGeometry(PLATE_HALF * 2, PLATE_HALF * 2);
    const plateMaterial = new THREE.MeshBasicMaterial({ color: 0x202628 });
    const plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.position.z = -0.035;
    this.scene.add(plate);

    const rimGeometry = new THREE.EdgesGeometry(plateGeometry);
    const rimMaterial = new THREE.LineBasicMaterial({ color: 0x4c5558, transparent: true, opacity: 0.62 });
    const rim = new THREE.LineSegments(rimGeometry, rimMaterial);
    rim.position.z = -0.025;
    this.scene.add(rim);

    const bolt = new THREE.Mesh(
      new THREE.CircleGeometry(0.07, 40),
      new THREE.MeshBasicMaterial({ color: 0xb8bab2 })
    );
    bolt.position.z = 0.02;
    this.scene.add(bolt);

    const ring = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.RingGeometry(0.28, 0.295, 72)),
      new THREE.LineBasicMaterial({ color: 0x606861, transparent: true, opacity: 0.55 })
    );
    ring.position.z = 0.015;
    this.scene.add(ring);
  }

  async rebuildParticles(nextCount) {
    this.particleCount = nextCount;

    if (this.particles) {
      this.scene.remove(this.particles);
      this.particles.material.dispose();
      this.particles = null;
    }

    const positions = instancedArray(this.particleCount, "vec3");
    const velocities = instancedArray(this.particleCount, "vec3");
    const colors = instancedArray(this.particleCount, "vec3");
    const sizes = instancedArray(this.particleCount, "float");
    const offsets = instancedArray(this.particleCount, "vec2");
    const seeds = instancedArray(this.particleCount, "float");

    this.computeInit = Fn(() => {
      const position = positions.element(instanceIndex);
      const velocity = velocities.element(instanceIndex);
      const color = colors.element(instanceIndex);
      const size = sizes.element(instanceIndex);
      const offset = offsets.element(instanceIndex);
      const seed = seeds.element(instanceIndex);

      const sx = hash(instanceIndex).mul(2).sub(1);
      const sy = hash(instanceIndex.add(193)).mul(2).sub(1);
      const tone = hash(instanceIndex.add(613)).mul(0.16).add(0.84);
      const offsetAngle = hash(instanceIndex.add(1201)).mul(float(Math.PI * 2));
      const offsetRadius = hash(instanceIndex.add(1601));

      position.assign(vec3(sx.mul(PLATE_HALF * 0.96), sy.mul(PLATE_HALF * 0.96), 0));
      velocity.assign(vec3(0, 0, 0));
      color.assign(vec3(tone, tone.mul(0.985), tone.mul(0.91)));
      size.assign(hash(instanceIndex.add(997)).mul(0.55).add(0.68));
      offset.assign(vec2(cos(offsetAngle).mul(offsetRadius), sin(offsetAngle).mul(offsetRadius)));
      seed.assign(hash(instanceIndex.add(313)));
    })().compute(this.particleCount, [WORKGROUP_SIZE]).setName("Initialize Chladni Sand");

    this.computeUpdate = Fn(() => {
      const position = positions.element(instanceIndex);
      const velocity = velocities.element(instanceIndex);
      const seed = seeds.element(instanceIndex);

      const x = position.x.div(PLATE_HALF);
      const y = position.y.div(PLATE_HALF);
      const modeA = computeFieldAndGradient(x, y, this.modeA.m, this.modeA.n);
      const modeB = computeFieldAndGradient(x, y, this.modeB.m, this.modeB.n);
      const field = mix(modeA.field, modeB.field, this.modeBlend);
      const gradientX = mix(modeA.gradientX, modeB.gradientX, this.modeBlend);
      const gradientY = mix(modeA.gradientY, modeB.gradientY, this.modeBlend);
      const pulse = sin(seed.mul(91.7).add(time.mul(1.35))).mul(this.jitter);
      const nodePull = field.mul(this.attraction).negate();

      velocity.x = velocity.x.add(gradientX.mul(nodePull)).add(pulse.mul(0.6));
      velocity.y = velocity.y.add(gradientY.mul(nodePull)).add(pulse.mul(0.35));
      velocity.mulAssign(this.damping);
      position.addAssign(velocity.mul(this.particleSpeed));

      If(position.x.greaterThan(PLATE_HALF), () => {
        position.x = PLATE_HALF;
        velocity.x = abs(velocity.x).negate().mul(0.35);
      });
      If(position.x.lessThan(-PLATE_HALF), () => {
        position.x = -PLATE_HALF;
        velocity.x = abs(velocity.x).mul(0.35);
      });
      If(position.y.greaterThan(PLATE_HALF), () => {
        position.y = PLATE_HALF;
        velocity.y = abs(velocity.y).negate().mul(0.35);
      });
      If(position.y.lessThan(-PLATE_HALF), () => {
        position.y = -PLATE_HALF;
        velocity.y = abs(velocity.y).mul(0.35);
      });
    })().compute(this.particleCount, [WORKGROUP_SIZE]).setName("Update Chladni Sand");

    this.particleOpacity.value = getParticleOpacityForSettings(this.particleCount, this.particleSize.value, this.particleBlur.value);

    const material = new THREE.SpriteNodeMaterial({
      blending: getParticleBlending(this.particleBlur.value),
      depthWrite: false,
      transparent: true,
      opacity: 1
    });
    material.colorNode = vec4(
      colors.element(instanceIndex).mul(uv().y.mul(0.18).add(0.88)),
      this.particleOpacity
    );
    const renderOffset = offsets.element(instanceIndex).mul(this.particleOffset);
    material.positionNode = positions.toAttribute().add(vec3(renderOffset.x, renderOffset.y, 0));
    material.scaleNode = sizes.element(instanceIndex).mul(this.particleSize);
    material.opacityNode = mix(shapeCircle(), softParticleMask(), easedBlurNode(this.particleBlur));

    this.particles = new THREE.Sprite(material);
    this.particles.count = this.particleCount;
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);

    await this.resetParticles();
  }

  updateFrequency(frequencyHz) {
    this.frequencyHz = frequencyHz;
    const mixMode = getModeMix(frequencyHz);

    this.modeA.m.value = mixMode.current.m;
    this.modeA.n.value = mixMode.current.n;
    this.modeB.m.value = mixMode.next.m;
    this.modeB.n.value = mixMode.next.n;
    this.modeBlend.value = mixMode.blend;
  }

  async setParticleCount(nextCount) {
    await this.rebuildParticles(nextCount);
    return this.particleCount;
  }

  setParticleSpeed(nextSpeed) {
    this.particleSpeed.value = nextSpeed;
  }

  setParticleSize(nextSize) {
    this.particleSize.value = nextSize;
    this.updateParticleOpacity();
  }

  setParticleOffset(nextOffset) {
    this.particleOffset.value = clampNonNegative(nextOffset);
  }

  setParticleBlur(nextBlur) {
    this.particleBlur.value = clamp01(nextBlur);
    this.updateParticleOpacity();
    this.updateParticleBlending();
  }

  async resetParticles() {
    if (!this.computeInit) return;
    await this.renderer.computeAsync(this.computeInit);
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);

    const aspect = this.width / this.height;
    const view = aspect > 1 ? 4.1 : 4.1 / aspect;
    this.camera.left = -view * aspect;
    this.camera.right = view * aspect;
    this.camera.top = view;
    this.camera.bottom = -view;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  animate() {
    if (this.computeUpdate) {
      this.renderer.compute(this.computeUpdate);
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver?.disconnect();
    this.scene.traverse((object) => {
      object.geometry?.dispose?.();
      object.material?.dispose?.();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  updateParticleOpacity() {
    this.particleOpacity.value = getParticleOpacityForSettings(
      this.particleCount,
      this.particleSize.value,
      this.particleBlur.value
    );
  }

  updateParticleBlending() {
    if (!this.particles) return;
    const material = this.particles.material;
    const nextBlending = getParticleBlending(this.particleBlur.value);
    if (material.blending === nextBlending) return;
    material.blending = nextBlending;
    material.needsUpdate = true;
  }
}

function getParticleOpacityForSettings(amount, particleSize = PARTICLE_BASE_SIZE, particleBlur = 1) {
  const blur = clamp01(particleBlur);
  if (blur <= 0.001) return CRISP_PARTICLE_OPACITY;
  const easedBlur = easeBlur(blur);

  const safeAmount = Math.max(1, amount);
  const sizeScale = Math.min(1.4, Math.max(0.25, PARTICLE_BASE_SIZE / Math.max(0.001, particleSize)));
  const softOpacity = Math.min(
    0.035,
    Math.max(0.0015, BASE_PARTICLE_OPACITY * Math.sqrt(BASE_OPACITY_AMOUNT / safeAmount) * sizeScale)
  );
  return mixNumber(LOW_BLUR_PARTICLE_OPACITY, softOpacity, easedBlur);
}

function getParticleBlending(particleBlur) {
  return particleBlur <= 0.001 ? THREE.NormalBlending : THREE.AdditiveBlending;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value)));
}

function clampNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function mixNumber(a, b, t) {
  const amount = clamp01(t);
  return a * (1 - amount) + b * amount;
}

function easeBlur(value) {
  return Math.pow(clamp01(value), BLUR_RESPONSE_POWER);
}

function easedBlurNode(value) {
  const squared = value.mul(value);
  return squared.mul(squared).mul(0.45).add(value.mul(value).mul(value).mul(0.55));
}

function softParticleMask() {
  const radial = lengthSq(uv().mul(2).sub(1));
  return oneMinus(smoothstep(0.0, 1.0, radial));
}

function computeFieldAndGradient(x, y, m, n) {
  const pi = float(Math.PI);
  const mx = x.mul(m).mul(pi);
  const nx = x.mul(n).mul(pi);
  const my = y.mul(m).mul(pi);
  const ny = y.mul(n).mul(pi);
  const mPi = m.mul(pi);
  const nPi = n.mul(pi);

  const cosMx = cos(mx);
  const cosNx = cos(nx);
  const cosMy = cos(my);
  const cosNy = cos(ny);
  const sinMx = sin(mx);
  const sinNx = sin(nx);
  const sinMy = sin(my);
  const sinNy = sin(ny);

  return {
    field: cosMx.mul(cosNy).sub(cosNx.mul(cosMy)),
    gradientX: mPi.negate().mul(sinMx).mul(cosNy).add(nPi.mul(sinNx).mul(cosMy)),
    gradientY: nPi.negate().mul(cosMx).mul(sinNy).add(mPi.mul(cosNx).mul(sinMy))
  };
}
