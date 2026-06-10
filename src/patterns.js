export const MIN_FREQUENCY = 345;
export const MAX_FREQUENCY = 5907;

export const PATTERN_MODES = [
  { frequency: 345, m: 1, n: 2 },
  { frequency: 1033, m: 2, n: 3 },
  { frequency: 1820, m: 3, n: 4 },
  { frequency: 2041, m: 2, n: 5 },
  { frequency: 3240, m: 4, n: 5 },
  { frequency: 3835, m: 5, n: 6 },
  { frequency: 3975, m: 4, n: 7 },
  { frequency: 4444, m: 6, n: 7 },
  { frequency: 4840, m: 5, n: 8 },
  { frequency: 5201, m: 7, n: 8 },
  { frequency: 5284, m: 6, n: 9 },
  { frequency: 5907, m: 8, n: 9 }
];

export function getModeMix(frequencyHz) {
  const frequency = Math.min(MAX_FREQUENCY, Math.max(MIN_FREQUENCY, frequencyHz));

  for (let index = 0; index < PATTERN_MODES.length - 1; index += 1) {
    const current = PATTERN_MODES[index];
    const next = PATTERN_MODES[index + 1];

    if (frequency >= current.frequency && frequency <= next.frequency) {
      const span = next.frequency - current.frequency;
      const blend = span === 0 ? 0 : (frequency - current.frequency) / span;

      return {
        current,
        next,
        blend: smoothstep(blend)
      };
    }
  }

  const last = PATTERN_MODES[PATTERN_MODES.length - 1];
  return { current: last, next: last, blend: 0 };
}

export function evaluateChladniField(x, y, mode) {
  const px = Math.PI * x;
  const py = Math.PI * y;

  return (
    Math.cos(mode.m * px) * Math.cos(mode.n * py) -
    Math.cos(mode.n * px) * Math.cos(mode.m * py)
  );
}

export function evaluateChladniGradient(x, y, mode) {
  const px = Math.PI * x;
  const py = Math.PI * y;
  const pi = Math.PI;

  return {
    x:
      -mode.m * pi * Math.sin(mode.m * px) * Math.cos(mode.n * py) +
      mode.n * pi * Math.sin(mode.n * px) * Math.cos(mode.m * py),
    y:
      -mode.n * pi * Math.cos(mode.m * px) * Math.sin(mode.n * py) +
      mode.m * pi * Math.cos(mode.n * px) * Math.sin(mode.m * py)
  };
}

export function evaluateMixedField(x, y, frequencyHz) {
  const mix = getModeMix(frequencyHz);
  const fieldA = evaluateChladniField(x, y, mix.current);
  const fieldB = evaluateChladniField(x, y, mix.next);
  return fieldA * (1 - mix.blend) + fieldB * mix.blend;
}

export function evaluateMixedGradient(x, y, frequencyHz) {
  const mix = getModeMix(frequencyHz);
  const gradientA = evaluateChladniGradient(x, y, mix.current);
  const gradientB = evaluateChladniGradient(x, y, mix.next);

  return {
    x: gradientA.x * (1 - mix.blend) + gradientB.x * mix.blend,
    y: gradientA.y * (1 - mix.blend) + gradientB.y * mix.blend
  };
}

function smoothstep(value) {
  const x = Math.min(1, Math.max(0, value));
  return x * x * (3 - 2 * x);
}
