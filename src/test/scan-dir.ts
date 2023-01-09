import { scanPath } from '../core'

async function main() {
  await scanPath({
    srcPath: '../ts-liveview',
    destPath: '../ts-liveview/dist',
    watch: false,
    excludePaths: ['../ts-liveview/scripts', '../ts-liveview/public'],
    postHooks: [],
    config: {
      jsx: 'transform',
      jsxFactory: 'o',
      jsxFragment: 'null',
    },
  })
}
main().catch(e => console.error(e))
