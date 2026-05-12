import path from 'path'
import esbuild from 'esbuild'
import process from 'process'
import builtins from 'builtin-modules'
import fs from 'fs'

const nodeBuiltins = [...builtins, ...builtins.map((mod) => `node:${mod}`)]

const prod = process.argv[2] === 'production'

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lexical/clipboard/clipboard',
    ...nodeBuiltins,
  ],
  format: 'cjs',
  define: {
    'import.meta.url': 'import_meta_url',
    'process.env.NODE_ENV': JSON.stringify(prod ? 'production' : 'development'),
  },
  target: 'es2020',
  logLevel: 'info', // 'debug' for more detailed output
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  minify: prod,
  legalComments: 'none', // remove all comments
  metafile: true,
})

if (prod) {
  const result = await context.rebuild()
  fs.writeFileSync('meta.json', JSON.stringify(result.metafile))
  process.exit(0)
} else {
  await context.watch()
}
