// Generates keypress/click WAV samples into public/audio.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../public/audio');
const SR = 44100;

function encodeWav(samples) {
  const numSamples = samples.length;
  const buf = Buffer.alloc(44 + numSamples * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + numSamples * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(numSamples * 2, 40);
  for (let i = 0; i < numSamples; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

function keypress(durationMs, toneHz, bright) {
  const n = Math.floor((durationMs / 1000) * SR);
  const out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * (1000 / durationMs) * 6);
    const noise = Math.random() * 2 - 1;
    lp = lp + (noise - lp) * (bright ? 0.5 : 0.22);
    const tone = Math.sin(2 * Math.PI * toneHz * t) * 0.4;
    out[i] = (lp * 0.8 + tone) * env * 0.9;
  }
  return out;
}

function mouseClick() {
  const down = keypress(18, 1800, true);
  const gapN = Math.floor(0.05 * SR);
  const up = keypress(12, 2200, true);
  const out = new Float32Array(down.length + gapN + up.length);
  out.set(down, 0);
  out.set(up.map((v) => v * 0.7), down.length + gapN);
  return out;
}

mkdirSync(outDir, { recursive: true });

const files = {
  'typing-1.wav': keypress(45, 170, false),
  'typing-2.wav': keypress(38, 210, false),
  'typing-3.wav': keypress(50, 140, true),
  'mouse-click.wav': mouseClick()
};

for (const [name, samples] of Object.entries(files)) {
  const wav = encodeWav(samples);
  writeFileSync(resolve(outDir, name), wav);
  console.log(`[gittercam] wrote ${name} (${wav.length} bytes)`);
}
