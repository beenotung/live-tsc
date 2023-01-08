import { scanPath } from '../src/core'

scanPath({
  srcPath: '../ts-liveview/server/app/components/menu.tsx',
  destPath: '../ts-liveview/dist/server/app/components/menu.js',
  watch: false,
})
