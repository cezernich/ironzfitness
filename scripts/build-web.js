// Package browser runtime files only. This does not publish or contact a backend.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT_FILES = [
  'index.html', '404.html', 'pricing.html', 'privacy.html', 'support.html',
  'terms.html', 'style.css', 'manifest.json', 'service-worker.js',
  'exercise-data.js', 'exercise-filters.js', 'CNAME', '.nojekyll',
  'share/index.html', 'c/index.html',
  '.well-known/apple-app-site-association',
  'sources-of-truth/philosophy/modules_static.json',
];
const ASSET_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.ico', '.json',
  '.woff', '.woff2', '.ttf', '.otf',
]);

function buildWeb(root = path.resolve(__dirname, '..')) {
  const output = path.join(root, 'www');
  const files = [...ROOT_FILES];

  function collect(directory, accepts) {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const relative = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symlinks are not build inputs: ${relative}`);
      if (entry.isDirectory()) collect(relative, accepts);
      else if (entry.isFile() && accepts(relative)) files.push(relative);
    }
  }
  collect('js', file => path.extname(file) === '.js');
  collect('assets', file => ASSET_EXTENSIONS.has(path.extname(file).toLowerCase()));

  const included = new Set(files.map(file => file.split(path.sep).join('/')));
  for (const file of files) {
    if (!fs.lstatSync(path.join(root, file)).isFile()) {
      throw new Error(`Build input is not a regular file: ${file}`);
    }
  }

  function checkReference(from, reference) {
    if (!reference || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference)) return;
    const pathname = decodeURIComponent(reference.split(/[?#]/)[0]);
    if (!pathname) return;
    const relative = pathname.startsWith('/')
      ? pathname.slice(1)
      : path.posix.join(path.posix.dirname(from), pathname);
    const resolved = path.posix.normalize(relative);
    if (!included.has(resolved)) {
      throw new Error(`Missing packaged asset: ${from} references ${reference}`);
    }
  }

  // Validate the main shells. Runtime-generated URLs and third-party assets
  // need browser tests; this check deliberately covers static local assets.
  for (const file of ['index.html', 'pricing.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of html.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      checkReference(file, match[1]);
    }
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  for (const icon of manifest.icons || []) checkReference('manifest.json', icon.src);

  // Validate before removing an earlier build. Clean output prevents stale
  // backend files from the former rsync command from surviving a rebuild.
  if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) {
    throw new Error('Refusing to replace a symlink at www');
  }
  fs.rmSync(output, { recursive: true, force: true });
  for (const file of files) {
    const target = path.join(output, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, file), target);
  }
  return { output, files: files.length };
}

if (require.main === module) {
  try {
    const result = buildWeb();
    console.log(`Built ${result.files} client files into ${result.output}`);
  } catch (error) {
    console.error(`Client build failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { buildWeb };
