import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile, chmod } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateIconPng } from './generate-icons.mjs';

export const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const distributionDirectory = join(rootDirectory, 'dist');

function assertInsideRoot(target) {
  const relativeTarget = relative(rootDirectory, resolve(target));
  if (!relativeTarget || relativeTarget.startsWith('..') || relativeTarget.includes(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new Error(`Unsafe build target: ${target}`);
  }
}

async function copyTree(source, destination) {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyTree(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      await copyFile(sourcePath, destinationPath);
      await chmod(destinationPath, 0o644);
    } else {
      throw new Error(`Unsupported source entry: ${sourcePath}`);
    }
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function build() {
  assertInsideRoot(distributionDirectory);
  await rm(distributionDirectory, { recursive: true, force: true });
  await mkdir(distributionDirectory, { recursive: true });

  const packageMetadata = await readJson(join(rootDirectory, 'package.json'));
  for (const target of ['chromium', 'firefox']) {
    const targetDirectory = join(distributionDirectory, target);
    const sourceManifest = join(rootDirectory, 'manifests', `${target}.json`);
    const manifest = await readJson(sourceManifest);
    if (manifest.version !== packageMetadata.version) {
      throw new Error(`${target} manifest version differs from package version`);
    }
    await copyTree(join(rootDirectory, 'src'), targetDirectory);
    for (const size of [16, 32, 48, 128]) {
      await writeFile(join(targetDirectory, 'assets', `icon-${size}.png`), generateIconPng(size), { mode: 0o644 });
    }
    await copyFile(sourceManifest, join(targetDirectory, 'manifest.json'));
    await chmod(join(targetDirectory, 'manifest.json'), 0o644);
    await copyFile(join(rootDirectory, 'NOTICE.txt'), join(targetDirectory, 'NOTICE.txt'));
    await chmod(join(targetDirectory, 'NOTICE.txt'), 0o644);

    const buildMetadata = {
      schema: 1,
      browser: target,
      version: packageMetadata.version,
      nativeHost: 'fr.maer.password_vault',
      nativeHostIncluded: false
    };
    await writeFile(
      join(targetDirectory, 'BUILD-METADATA.json'),
      `${JSON.stringify(buildMetadata, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o644 }
    );
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  await build();
  process.stdout.write(`Built Chromium and Firefox extensions in ${distributionDirectory}\n`);
}
