export function createAudioController(initialFrequency) {
  let context = null;
  let oscillator = null;
  let gain = null;
  let muted = true;
  let frequencyHz = initialFrequency;

  function createOscillator(startTime = 0) {
    const nextOscillator = context.createOscillator();
    nextOscillator.type = "sine";
    nextOscillator.frequency.value = frequencyHz;
    nextOscillator.connect(gain);
    nextOscillator.start(startTime);
    return nextOscillator;
  }

  function ensureAudio() {
    if (context) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    context = new AudioContextClass();
    gain = context.createGain();

    gain.gain.value = 0;
    gain.connect(context.destination);
    oscillator = createOscillator();
  }

  async function resumeAudio() {
    ensureAudio();

    if (context.state === "suspended") {
      await Promise.race([
        context.resume().catch(() => {}),
        new Promise((resolve) => {
          window.setTimeout(resolve, 500);
        })
      ]);
    }
  }

  async function setMuted(nextMuted) {
    muted = nextMuted;
    await resumeAudio();

    const now = context.currentTime;
    const targetGain = muted ? 0 : 0.035;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(targetGain, now, 0.015);
  }

  function setFrequency(nextFrequency) {
    frequencyHz = nextFrequency;

    if (!oscillator || !context) return;

    oscillator.frequency.cancelScheduledValues(context.currentTime);
    oscillator.frequency.setTargetAtTime(frequencyHz, context.currentTime, 0.01);
  }

  async function restartTone() {
    await resumeAudio();

    const now = context.currentTime;
    const restartAt = muted ? now : now + 0.018;
    const oldOscillator = oscillator;

    if (!muted) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, 0.004);
      gain.gain.setValueAtTime(0, restartAt);
      gain.gain.setTargetAtTime(0.035, restartAt, 0.015);
    }

    oscillator = createOscillator(restartAt);

    if (oldOscillator) {
      oldOscillator.stop(restartAt);
      oldOscillator.onended = () => oldOscillator.disconnect();
    }
  }

  return {
    get muted() {
      return muted;
    },
    setMuted,
    setFrequency,
    restartTone
  };
}
