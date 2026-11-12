import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

/**
 * Build for Chrome (default) or Firefox:
 *   node scripts/build.mjs                    -> dist/          (Chrome, Edge, Brave)
 *   node scripts/build.mjs --target=firefox   -> dist-firefox/  (Firefox)
 * Same code for both browsers; only the manifest changes.
 */
const watch = process.argv.includes('--watch');
const target = process.argv.find((a) => a.startsWith('--target='))?.split('=')[1] ?? 'chrome';
const outdir = target === 'firefox' ? 'dist-firefox' : 'dist';

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });
cpSync('public', outdir, { recursive: true });

// pdf.js for "Import from CV" (loaded on demand by the options page).
mkdirSync(`${outdir}/vendor`, { recursive: true });
for (const file of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  cpSync(`node_modules/pdfjs-dist/build/${file}`, `${outdir}/vendor/${file}`);
}

/**
 * Firefox differences:
 * - Manifest V3 background runs as an event page ("scripts"), not a service worker.
 * - An add-on ID is required.
 * - Mozilla asks extensions to declare what data they collect: Sabi collects nothing for the developer.
 *   Data only goes to the integrations the user turns on (see SECURITY.md).
 */
function firefoxManifest(manifest) {
  const { service_worker, ...background } = manifest.background ?? {};
  return {
    ...manifest,
    background: { ...background, scripts: [service_worker] },
    browser_specific_settings: {
      gecko: {
        id: 'sabi@geneg.com.mx',
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] },
      },
      // Firefox for Android supports the data declaration from version 142
      gecko_android: { strict_min_version: '142.0' },
    },
  };
}

if (target === 'firefox') {
  const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
  writeFileSync(`${outdir}/manifest.json`, `${JSON.stringify(firefoxManifest(manifest), null, 2)}\n`);
}

const options = {
  entryPoints: {
    content: 'src/content/content.ts',
    popup: 'src/popup/popup.ts',
    options: 'src/options/options.ts',
    background: 'src/background.ts',
  },
  bundle: true,
  format: 'iife',
  target: ['chrome110', 'firefox140'],
  outdir,
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
