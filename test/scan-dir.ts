import { scanPath } from '../src/core'

scanPath({
  srcPath: '../ts-liveview/server',
  destPath: '../ts-liveview/dist/server',
  watch: false,
})
