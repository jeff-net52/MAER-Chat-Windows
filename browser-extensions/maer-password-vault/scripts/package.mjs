import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, distributionDirectory, rootDirectory } from './build.mjs';
import { createDeterministicZip } from './zip.mjs';

export const packagesDirectory = join(rootDirectory, 'packages');

export async function createPackages(outputDirectory = packagesDirectory, rebuild = true) {
  if (rebuild) {
    await build();
  }
  await rm(outputDirectory, { recursive: true, force: true });
  const metadata = JSON.parse(await readFile(join(rootDirectory, 'package.json'), 'utf8'));
  const outputs = [];
  for (const browser of ['chromium', 'firefox']) {
    const output = join(outputDirectory, `maer-password-vault-${browser}-${metadata.version}.zip`);
    outputs.push(await createDeterministicZip(join(distributionDirectory, browser), output));
  }
  return outputs;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  const outputs = await createPackages();
  for (const output of outputs) {
    process.stdout.write(`Packaged ${output.outputPath}\n`);
  }
}
