import { createHash } from 'node:crypto';
import { copyFile, cp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const repositoryPath = '/Inspira-';
const publicDirectory = 'public';
const outputDirectory = 'dist/client';
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.rsc', '.txt', '.xml']);

// Vinext applies assetPrefix both to the generated URLs and to the output
// directory. GitHub Pages already mounts this artifact at /Inspira-, so keep
// the URLs prefixed while moving the generated runtime back to the artifact
// root. Otherwise the browser requests /Inspira-/_next but the uploaded file
// ends up at /Inspira-/Inspira-/_next.
const prefixedRuntimeDirectory = join(outputDirectory, repositoryPath.slice(1), '_next');
const runtimeDirectory = join(outputDirectory, '_next');
await cp(prefixedRuntimeDirectory, runtimeDirectory, { recursive: true });
await rm(join(outputDirectory, repositoryPath.slice(1)), { recursive: true });

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
  // CSS assets are first rebased by Vinext under _next/static. Collapse the
  // duplicated public prefix so section background images keep pointing to
  // the public directory at the GitHub Pages project root.
  contents = contents.replaceAll(
    `${repositoryPath}/_next/static${repositoryPath}/`,
    `${repositoryPath}/`,
  );
  await writeFile(outputFile, contents);
}

// The public-image rewrite happens after Vite names the stylesheet. Give the
// rewritten CSS its own content hash so GitHub's immutable asset cache never
// serves a previous version under the same URL.
const cssDirectory = join(runtimeDirectory, 'static', 'css');
for (const cssFileName of await readdir(cssDirectory)) {
  if (extname(cssFileName) !== '.css') continue;
  const cssPath = join(cssDirectory, cssFileName);
  const cssContents = await readFile(cssPath, 'utf8');
  const cssHash = createHash('sha256').update(cssContents).digest('hex').slice(0, 10);
  const hashedCssFileName = cssFileName.replace(/\.css$/, `.${cssHash}.css`);
  await rename(cssPath, join(cssDirectory, hashedCssFileName));

  for (const outputFile of await filesIn(outputDirectory)) {
    if (!textExtensions.has(extname(outputFile))) continue;
    const contents = await readFile(outputFile, 'utf8');
    if (!contents.includes(cssFileName)) continue;
    await writeFile(outputFile, contents.replaceAll(cssFileName, hashedCssFileName));
  }
}

await copyFile(join(outputDirectory, 'index.html'), join(outputDirectory, '404.html'));
