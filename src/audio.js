export function createAudioController(initialFrequency) {
  let context = null;
  let oscillator = null;
  let gain = null;
  let muted = true;
  let frequencyHz = initialFrequency;

  function ensureAudio() {
    if (context) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    context = new AudioContextClass();
    oscillator = context.createOscillator();
    gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequencyHz;
    gain.gain.value = 0;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
  }

  async function setMuted(nextMuted) {
    muted = nextMuted;
    ensureAudio();

    if (context.state === "suspended") {
      await Promise.race([
        context.resume().catch(() => {}),
        new Promise((resolve) => {
          window.setTimeout(resolve, 500);
        })
      ]);
    }

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

  return {
    get muted() {
      return muted;
    },
    setMuted,
    setFrequency
  };
}
