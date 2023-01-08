import { scanPath } from '../src/core'

async function main() {
  await scanPath({
    srcPath: '../ts-liveview/server',
    destPath: '../ts-liveview/dist/server',
    watch: false,
  })
  await scanPath({
    srcPath: '../ts-liveview/db',
    destPath: '../ts-liveview/dist/db',
    watch: false,
  })
  await scanPath({
    srcPath: '../ts-liveview/client',
    destPath: '../ts-liveview/dist/client',
    watch: false,
  })
}
main().catch(e => console.error(e))
