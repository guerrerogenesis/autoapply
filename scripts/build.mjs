import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });

// pdf.js for "Import from CV" (loaded on demand by the options page).
mkdirSync('dist/vendor', { recursive: true });
for (const file of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  cpSync(`node_modules/pdfjs-dist/build/${file}`, `dist/vendor/${file}`);
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
  target: 'chrome110',
  outdir: 'dist',
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
