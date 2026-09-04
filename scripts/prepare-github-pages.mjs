import { copyFile, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const repositoryPath = '/Inspira-';
const publicDirectory = 'public';
const outputDirectory = 'dist/client';
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.rsc', '.txt', '.xml']);

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  }));
  return nested.flat();
}

const publicAssets = (await filesIn(publicDirectory))
  .map((path) => `/${relative(publicDirectory, path).replaceAll('\\\\', '/')}`)
  .filter((path) => path !== '/.nojekyll')
  .sort((left, right) => right.length - left.length);

for (const outputFile of await filesIn(outputDirectory)) {
  if (!textExtensions.has(extname(outputFile))) continue;

  let contents = await readFile(outputFile, 'utf8');
  for (const publicAsset of publicAssets) {
    contents = contents.replaceAll(publicAsset, `${repositoryPath}${publicAsset}`);
  }
  await writeFile(outputFile, contents);
}

await copyFile(join(outputDirectory, 'index.html'), join(outputDirectory, '404.html'));
