import {
  FSWatcher,
  watch,
  unlinkSync,
  existsSync,
  readFileSync,
  WatchEventType,
} from 'fs'
import fs from 'fs/promises'
import path from 'path'
import esbuild from 'esbuild'
import child_process from 'child_process'
import open from 'open'

let skipFilenames = [
  'node_modules',
  '.idea',
  '.git',
  '.env',
  '.gitignore',
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'LICENSE',
  'config',
  '.dccache',
  '.last',
  '.prettierrc',
  '.prettierignore',
  '.eslintignore',
  '.eslintrc.json',
  'nodemon.json',
]

let skipExtnames = [
  '.env',
  '.md',
  '.txt',
  '.sh',
  '.yaml',
  '.lock',
  '.gz',
  '.pem',
  '.ico',
  '.sqlite3',
  '.sqlite3-shm',
  '.sqlite3-wal',
  '.example',
  '.html',
  '.css',
  '.xml',
  '.cert',
  '.key',
  '.mp4',
  '.jpg',
  '.jpeg',
  '.png',
  '.svg',
]

let copyExtnames = ['.js']

export interface ScanOptions {
  srcPath: string
  destPath: string
  watch?: boolean
  excludePaths: string[]
  postHooks: string[]
  serverFile?: string
  cwd?: string
  open?: string
  config: {
    jsx?: 'transform' | 'preserve' | 'automatic'
    jsxFactory?: string
    jsxFragment?: string
    format?: esbuild.Format
  }
}

type Context = Omit<ScanOptions, 'srcPath' | 'destPath'> & {
  serverProcess?: child_process.ChildProcess
}
type Paths = Pick<ScanOptions, 'srcPath' | 'destPath'>

export async function scanPath(options: ScanOptions) {
  if (!options.excludePaths.includes(options.destPath)) {
    options.excludePaths.push(options.destPath)
  }

  const context: Context = options

  const stat = await fs.stat(options.srcPath)

  async function scan() {
    const startTime = Date.now()

    if (stat.isFile()) {
      await scanFile(context, options)
    } else if (stat.isDirectory()) {
      await scanDirectory(context, options, {})
    }

    const endTime = Date.now()
    const usedTime = endTime - startTime
    console.info('completed scanning in', usedTime, 'ms')

    await runHooks(options)
  }

  let setupWatch = () => {
    if (!options.watch) return
    console.info('watching for changes...')
    console.info('Tips: you can press Enter to manually re-scan')
    process.stdin.on('data', async (buffer: Buffer) => {
      let data = buffer.toString().trim()
      switch (data) {
        case '':
        case 'r':
        case 'reload':
          console.info('re-scanning...')
          await Promise.all([stopServer(context), scan()])
          await runServer(context)
      }
    })
    process.on('SIGINT', async () => {
      await stopServer(context)
      process.exit(0)
    })
  }

  try {
    await scan()
    setupWatch()
    setupWatch = () => {}
    await stopLastServer()
    await runServer(context)
  } catch (error) {
    console.error(error)
    setupWatch()
  }
}

async function stopLastServer() {
  if (!existsSync(serverPidFile)) return
  let pid = parseInt(readFileSync(serverPidFile).toString())
  if (!pid) return
  if (!isPidAlive(pid)) return
  process.kill(pid)
  while (isPidAlive(pid)) {
    await sleep(3)
  }
  unlinkSync(serverPidFile)
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isPidAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return false
  }
}

async function stopServer(context: Context) {
  const child = context.serverProcess
  if (!child) return
  console.info('stopping server for restart...')
  delete context.serverProcess
  await new Promise(resolve => {
    child.once('exit', resolve)
    child.kill()
  })
  if (existsSync(serverPidFile)) {
    unlinkSync(serverPidFile)
  }
}

const serverPidFile = 'server.pid'

async function runServer(context: Context) {
  if (!context.serverFile) return
  await stopServer(context)
  console.info('starting server...')
  context.serverProcess = child_process.spawn('node', [context.serverFile], {
    cwd: context.cwd,
    env: process.env,
    stdio: [process.stdin, process.stdout, process.stderr],
  })
  await fs.writeFile(serverPidFile, String(context.serverProcess.pid))
  if (context.open) {
    await open(context.open)
    delete context.open
  }
}

async function runHooks(context: Context) {
  for (let cmd of context.postHooks) {
    console.info('running postHook', JSON.stringify(cmd))
    await new Promise<void>((resolve, reject) => {
      child_process
        .spawn('bash', ['-c', cmd], {
          cwd: context.cwd,
          env: process.env,
          stdio: [process.stdin, process.stdout, process.stderr],
        })
        .once('exit', code => {
          if (code == 0) {
            return resolve()
          }
          console.error(
            'Failed on postHook:',
            JSON.stringify(cmd),
            '(exit code: ' + code + ')',
          )
          reject(new Error('postHook failed'))
        })
    })
  }
}

async function scanDirectory(
  context: Context,
  paths: Paths,
  parentWatchers: Record<string, FSWatcher>,
) {
  const { srcPath: srcDir, destPath: destDir } = paths

  if (context.excludePaths.includes(srcDir)) return

  const childWatchers: Record<string, FSWatcher> = {}

  await fs.mkdir(destDir, { recursive: true })

  const files = await fs.readdir(srcDir)

  await Promise.all(files.map(processFile))

  async function processFile(filename: string) {
    if (skipFilenames.includes(filename)) return

    const srcPath = path.join(srcDir, filename)
    if (context.excludePaths.includes(srcPath)) return

    let destPath = path.join(destDir, filename)

    const stat = await fs.stat(srcPath)

    if (stat.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true })
      await scanDirectory(
        context,
        {
          srcPath: srcPath,
          destPath: destPath,
        },
        childWatchers,
      )
      return
    }

    if (!stat.isFile()) {
      console.debug('[skip] ', srcPath, '(not dir nor file)')
      return
    }

    const extname = path.extname(filename)
    if (extname == '.ts') {
      destPath = destPath.replace(/ts$/, 'js')
    } else if (extname == '.tsx') {
      destPath = destPath.replace(/tsx$/, 'js')
    } else if (extname == '.jsx') {
      destPath = destPath.replace(/jsx$/, 'js')
    } else if (copyExtnames.includes(extname)) {
      await fs.copyFile(srcPath, destPath)
      return
    } else {
      if (!skipExtnames.includes(extname)) {
        console.debug(
          '[skip]',
          srcPath,
          `(not supported extname ${JSON.stringify(extname)})`,
        )
      }
      return
    }

    await scanFile(context, {
      srcPath,
      destPath,
    })
  }

  if (context.watch) {
    const watcher = watch(
      srcDir,
      { persistent: true, recursive: false },
      wrapFn2(async (event, filename) => {
        if (event != 'rename') return

        const file = path.join(srcDir, filename)

        if (context.excludePaths.includes(file)) return

        const fileIdx = files.indexOf(filename)
        if (fileIdx != -1) {
          // the file is removed
          console.info('removed file:', file)
          files.splice(fileIdx, 1)
          const childWatcher = childWatchers[filename]
          if (childWatcher) {
            childWatcher.close()
            delete childWatchers[filename]
          }
        } else {
          // the file is newly created
          console.info('new file:', file)
          files.push(filename)
          await processFile(filename)
          await runHooks(context)
        }
      }),
    )
    const selfFilename = path.basename(srcDir)
    parentWatchers[selfFilename] = watcher
  }
}

async function scanFile(context: Context, paths: Paths) {
  let { srcPath, destPath } = paths
  await transpileFile(srcPath, destPath, context)
}

async function transpileFile(
  srcPath: string,
  destPath: string,
  context: Context,
) {
  let sourceCode = (await fs.readFile(srcPath)).toString()
  let transpiledCode = await transpile(sourceCode, srcPath, context.config)

  try {
    const destCode = (await fs.readFile(destPath)).toString()
    if (destCode.trim() == transpiledCode.trim()) {
      return
    }
  } catch (error) {
    // maybe the destPath doesn't exist
  }

  await fs.writeFile(destPath, transpiledCode)

  if (context.watch) {
    const onEvent = wrapFn1(async (event: WatchEventType) => {
      if (event == 'rename') {
        watcher.close()
        return
      }

      if (event != 'change') return

      let newSourceCode = (await fs.readFile(srcPath)).toString()
      if (newSourceCode == sourceCode) return
      sourceCode = newSourceCode

      let startTime = Date.now()
      let newTranspiledCode = await transpile(
        newSourceCode,
        srcPath,
        context.config,
      )
      if (newTranspiledCode == transpiledCode) return
      transpiledCode = newTranspiledCode

      await fs.writeFile(destPath, newTranspiledCode)

      let endTime = Date.now()

      let usedTime = endTime - startTime
      console.info('updated file:', srcPath, 'in', usedTime, 'ms')

      await runHooks(context)
      await runServer(context)
    })
    const watcher = watch(srcPath, { persistent: true }, onEvent)
  }
}

async function transpile(
  code: string,
  file: string,
  config: ScanOptions['config'],
): Promise<string> {
  try {
    let result = await esbuild.transform(code, {
      loader: file.endsWith('.tsx') ? 'tsx' : 'ts',
      jsx: config.jsx,
      jsxFactory: config.jsxFactory,
      jsxFragment: config.jsxFragment,
      format: config.format,
    })
    code = result.code
  } catch (error: any) {
    throw new TranspileError(file, error.errors)
  }
  return code.replace(/ \/\* @__PURE__ \*\/ /g, ' ')
}

function wrapFn1<A>(fn: (a: A) => any): (a: A) => void {
  return async (a: A) => {
    try {
      await fn(a)
    } catch (error) {
      console.error(error)
    }
  }
}

function wrapFn2<A, B>(fn: (a: A, b: B) => any): (a: A, b: B) => void {
  return async (a: A, b: B) => {
    try {
      await fn(a, b)
    } catch (error) {
      console.error(error)
    }
  }
}

class TranspileError extends Error {
  constructor(public file: string, public errors: any[]) {
    super()
  }
}
