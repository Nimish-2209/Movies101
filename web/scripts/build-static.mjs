import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(webRoot, 'public');
const apiBaseUrl = process.env.MOVIES101_API_BASE_URL || '/api/v1';

if (!apiBaseUrl.startsWith('/') && !apiBaseUrl.startsWith('https://')) {
  throw new Error('MOVIES101_API_BASE_URL must use HTTPS or a relative path.');
}

await writeFile(
  resolve(publicRoot, 'runtime-config.js'),
  `window.MOVIES101_API_BASE_URL = ${JSON.stringify(apiBaseUrl)};\n`
);

const bootstrapTarget = resolve(publicRoot, 'bootstrap/css/bootstrap.min.css');
await mkdir(dirname(bootstrapTarget), { recursive: true });
await copyFile(
  resolve(webRoot, 'node_modules/bootstrap/dist/css/bootstrap.min.css'),
  bootstrapTarget
);

console.log(`Static site configured for ${apiBaseUrl}`);
