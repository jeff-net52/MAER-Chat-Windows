import { readFile, readdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function filesBelow(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await filesBelow(target));
    } else if (entry.isFile()) {
      files.push(target);
    }
  }
  return files.sort();
}

const allFiles = await filesBelow(root);
const syntaxFiles = allFiles.filter((path) => ['.js', '.mjs', '.cjs'].includes(extname(path)));
for (const path of syntaxFiles) {
  const check = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  if (check.status !== 0) {
    process.stderr.write(check.stderr || check.stdout || `Syntax check failed: ${path}\n`);
    process.exit(1);
  }
}

for (const path of allFiles.filter((candidate) => extname(candidate) === '.json')) {
  JSON.parse(await readFile(path, 'utf8'));
}

const sourceFiles = await filesBelow(join(root, 'src'));
const forbidden = [
  { expression: /\bconsole\s*\./, label: 'console logging' },
  { expression: /\blocalStorage\b/, label: 'localStorage' },
  { expression: /\bsessionStorage\b/, label: 'sessionStorage' },
  { expression: /\bindexedDB\b/, label: 'IndexedDB' },
  { expression: /\bfetch\s*\(/, label: 'network fetch' },
  { expression: /\bXMLHttpRequest\b/, label: 'XMLHttpRequest' },
  { expression: /\bWebSocket\b/, label: 'WebSocket' },
  { expression: /\bEventSource\b/, label: 'EventSource' },
  { expression: /\beval\s*\(/, label: 'eval' },
  { expression: /\bnew\s+Function\b/, label: 'dynamic Function' },
  { expression: /\bchrome\.storage\b|\bbrowser\.storage\b/, label: 'extension storage' }
];
for (const path of sourceFiles.filter((candidate) => ['.js', '.html'].includes(extname(candidate)))) {
  const source = await readFile(path, 'utf8');
  for (const rule of forbidden) {
    if (rule.expression.test(source)) {
      throw new Error(`${rule.label} is forbidden in ${path}`);
    }
  }
}

for (const browser of ['chromium', 'firefox']) {
  const manifest = JSON.parse(await readFile(join(root, 'manifests', `${browser}.json`), 'utf8'));
  if (manifest.manifest_version !== 3 || !manifest.permissions.includes('nativeMessaging')) {
    throw new Error(`${browser} must use Manifest V3 and nativeMessaging`);
  }
  if (manifest.permissions.includes('storage') || manifest.externally_connectable) {
    throw new Error(`${browser} manifest exposes forbidden persistence or external messaging`);
  }
  const allowedHosts = JSON.stringify(['https://*/*']);
  if (JSON.stringify(manifest.host_permissions) !== allowedHosts) {
    throw new Error(`${browser} host permissions changed`);
  }
}

const obsoleteDomain = Buffer.from(['contacts', 'chaumont', 'me'].join('.'), 'utf8');
for (const path of allFiles) {
  const content = await readFile(path);
  if (content.includes(obsoleteDomain)) {
    throw new Error(`obsolete domain found in ${path}`);
  }
}

process.stdout.write(`Linted ${syntaxFiles.length} scripts and ${sourceFiles.length} extension files\n`);
