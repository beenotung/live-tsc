import { scanPath } from '../core'

async function main() {
  function run(dir: string) {
    return scanPath({
      srcPath: '../ts-liveview/' + dir,
      destPath: '../ts-liveview/dist/' + dir,
      watch: false,
      excludePaths: [],
      config: {
        jsx: 'transform',
        jsxFactory: 'o',
        jsxFragment: 'null',
      },
    })
  }
  await run('server')
  await run('template')
  await run('db')
  await run('client')
}
main().catch(e => console.error(e))
