import esbuild from 'esbuild'
import process from 'process'
import builtins from 'builtin-modules'
import fs from 'fs'

const nodeBuiltins = [...builtins, ...builtins.map((mod) => `node:${mod}`)]

const prod = process.argv[2] === 'production'

/**
 * zod v4 的 `v4/locales/index.js` 是一个 barrel 文件，re-export 了 60+ 个语言包，
 * 并被 `v4/core/index.js`、`v4/classic/external.js`、`v4/mini/external.js` 以
 * `export * as locales` 的形式引用。esbuild 无法对命名空间导出做 tree-shaking，
 * 导致全部语言包（约 260KB）被打进产物。
 *
 * 本项目只使用 `import { z } from 'zod'`，从未访问 `z.locales`，
 * 因此将该 barrel 替换为空模块以剔除语言包。
 * 注意：默认语言包 `locales/en.js` 是直接文件引用，不受影响。
 */
const zodLocalesStub = {
  name: 'zod-locales-stub',
  setup(build) {
    build.onResolve({ filter: /locales\/index\.js$/ }, (args) => {
      const importer = args.importer.replace(/\\/g, '/')
      if (!importer.includes('node_modules/zod')) return null
      return { path: args.path, namespace: 'zod-locales-stub' }
    })
    build.onLoad({ filter: /.*/, namespace: 'zod-locales-stub' }, () => ({
      contents: 'export {}',
      loader: 'js',
    }))
  },
}

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  plugins: [zodLocalesStub],
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
