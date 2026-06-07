#!/usr/bin/env node
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  minify: true,
  external: ['@modelcontextprotocol/sdk'],
  banner: { js: '#!/usr/bin/env node' },
});

console.log('Build complete → dist/index.js');
