import { scanPath } from '../core'

let file = 'server/app/components/script'
scanPath({
  srcPath: '../ts-liveview/' + file + '.ts',
  destPath: '../ts-liveview/dist/' + file + '.js',
  watch: false,
  config: {
    jsx: 'transform',
    jsxFactory: 'o',
    jsxFragment: 'null',
  },
})
