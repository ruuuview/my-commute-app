const fs = require('fs');
const path = require('path');

function writeWavFile(filepath, duration, frequencyFunc, amplitudeFunc, sampleRate = 44100) {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const numSamples = Math.floor(duration * sampleRate);
  const blockAlign = 2; // 16-bit mono = 2 bytes
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const chunkSize = 36 + dataSize;

  const buffer = Buffer.alloc(44 + dataSize);

  // WAV Header (44 bytes)
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(chunkSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20);  // AudioFormat (PCM = 1)
  buffer.writeUInt16LE(1, 22);  // NumChannels (1 = Mono)
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let phase = 0.0;
  let offset = 44;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = frequencyFunc(t, duration);
    const amp = amplitudeFunc(t, duration);

    // Synthesize sine wave with physical transient click
    phase += (2 * Math.PI * freq) / sampleRate;
    const sineVal = Math.sin(phase);

    // Soft organic click noise transient at absolute start (t < 0.008s)
    let noiseVal = 0.0;
    if (t < 0.008) {
      noiseVal = Math.sin(t * 120000) * 0.12 * (1.0 - t / 0.008);
    }

    let sampleVal = sineVal * amp + noiseVal * amp;
    sampleVal = Math.max(-1.0, Math.min(1.0, sampleVal));

    // Convert to 16-bit signed PCM integer
    const pcmVal = Math.floor(sampleVal * 32767);
    buffer.writeInt16LE(pcmVal, offset);
    offset += 2;
  }

  fs.writeFileSync(filepath, buffer);
  console.log(`Generated high-fidelity audio: ${path.basename(filepath)}`);
}

// Snappy tactile woody click
const tapFreq = (t) => 1200 - t * 900;
const tapAmp = (t) => Math.exp(-t * 105) * 0.8;

// Premium physical bamboo pop/select
const selectFreq = (t) => 400 + Math.sin(t * Math.PI * 4.5) * 160;
const selectAmp = (t) => {
  if (t < 0.012) return (t / 0.012) * 0.9;
  return Math.exp(-(t - 0.012) * 38) * 0.9;
};

// Soft organic sliding wooden drop/deselect
const deselectFreq = (t) => 600 - t * 320;
const deselectAmp = (t) => {
  if (t < 0.008) return (t / 0.008) * 0.8;
  return Math.exp(-(t - 0.008) * 48) * 0.8;
};

const audioDir = path.join(__dirname, '..', 'assets', 'audio');
writeWavFile(path.join(audioDir, 'tap.wav'), 0.04, tapFreq, tapAmp);
writeWavFile(path.join(audioDir, 'select.wav'), 0.12, selectFreq, selectAmp);
writeWavFile(path.join(audioDir, 'deselect.wav'), 0.10, deselectFreq, deselectAmp);
