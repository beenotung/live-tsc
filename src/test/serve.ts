import { scanPath } from '../core'

scanPath({
  srcPath: '../ts-liveview',
  destPath: '../ts-liveview/dist',
  watch: true,
  excludePaths: [
    '../ts-liveview/scripts',
    '../ts-liveview/public',
    '../ts-liveview/data',
    '../ts-liveview/db/data',
  ],
  postHooks: ['npx fix-esm-import-path dist/db/proxy.js'],
  cwd: '../ts-liveview',
  serverFile: 'dist/server/index.js',
  open: 'https://localhost:8100',
  config: {
    jsx: 'transform',
    jsxFactory: 'o',
    jsxFragment: 'null',
  },
})
