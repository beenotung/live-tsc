import { scanPath } from '../src/core'

let file = 'server/app/components/script'
scanPath({
  srcPath: '../ts-liveview/' + file + '.ts',
  destPath: '../ts-liveview/dist/' + file + '.js',
  watch: false,
})
