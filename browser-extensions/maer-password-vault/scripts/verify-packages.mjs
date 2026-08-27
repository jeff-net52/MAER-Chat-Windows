import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPackages } from './package.mjs';
import { distributionDirectory, rootDirectory } from './build.mjs';

function digest(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'maer-vault-packages-'));
const firstDirectory = join(temporaryRoot, 'first');
const secondDirectory = join(temporaryRoot, 'second');

try {
  const canonicalLicense = await readFile(join(rootDirectory, '..', '..', 'LICENSE'));
  for (const browser of ['chromium', 'firefox']) {
    const packagedLicense = await readFile(join(distributionDirectory, browser, 'LICENSE'));
    if (!canonicalLicense.equals(packagedLicense)) {
      throw new Error(`${browser} package does not contain the complete project LICENSE`);
    }
  }
  const first = await createPackages(firstDirectory, false);
  const second = await createPackages(secondDirectory, false);
  if (first.length !== second.length) {
    throw new Error('Package count is not reproducible');
  }
  for (let index = 0; index < first.length; index += 1) {
    const firstArchive = await readFile(first[index].outputPath);
    const secondArchive = await readFile(second[index].outputPath);
    if (digest(firstArchive) !== digest(secondArchive)) {
      throw new Error(`Package is not reproducible: ${first[index].outputPath}`);
    }
    process.stdout.write(`${digest(firstArchive)}  ${first[index].outputPath.split(/[\\/]/).pop()}\n`);
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
