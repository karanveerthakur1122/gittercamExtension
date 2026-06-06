import { build } from 'vite';
import { buildManifest } from '../src/manifest.config.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  mkdirSync,
  copyFileSync,
  writeFileSync,
  existsSync,
  readdirSync
} from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const target = process.argv[2] === 'firefox' ? 'firefox' : 'chrome';
const dist = resolve(root, 'dist', target);

const STATIC_SCRIPTS = [
  'src/content/content.js',
  'src/content/inject.js',
  'src/content/pipeline.js',
  'src/content/audio-pipeline.js',
  'src/background/service-worker.js'
];

async function run() {
  console.log(`\n[gittercam] building for ${target}...`);

  await build({
    configFile: resolve(root, 'vite.config.js'),
    build: { outDir: dist, emptyOutDir: true }
  });

  for (const rel of STATIC_SCRIPTS) {
    const from = resolve(root, rel);
    const to = resolve(dist, rel.split('/').pop());
    copyFileSync(from, to);
  }

  for (const dir of ['icons', 'audio']) {
    const srcDir = resolve(root, 'public', dir);
    const destDir = resolve(dist, dir);
    if (existsSync(srcDir)) {
      mkdirSync(destDir, { recursive: true });
      for (const file of readdirSync(srcDir)) {
        copyFileSync(resolve(srcDir, file), resolve(destDir, file));
      }
    }
  }

  const manifest = buildManifest(target);
  writeFileSync(
    resolve(dist, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log(`[gittercam] done -> ${dist}\n`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
