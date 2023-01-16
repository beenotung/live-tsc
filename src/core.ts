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
  postHooks: Hook[]
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

export interface Hook {
  watchFiles?: string[]
  command: string
}

type Context = Omit<ScanOptions, 'srcPath' | 'destPath'> & {
  serverProcess?: child_process.ChildProcess
  watchers: Set<FSWatcher>
}
type Paths = Pick<ScanOptions, 'srcPath' | 'destPath'>

function infoLog(...messages: any[]) {
  console.info('[live-tsc]', ...messages)
}

function debugLog(...messages: any[]) {
  console.debug('[live-tsc]', ...messages)
}

function errorLog(...messages: any[]) {
  console.error('[live-tsc]', ...messages)
}

export async function scanPath(options: ScanOptions) {
  if (!options.excludePaths.includes(options.destPath)) {
    options.excludePaths.push(options.destPath)
  }

  const context: Context = {
    ...options,
    watchers: new Set(),
  }

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
    infoLog('completed scanning in', usedTime, 'ms')

    await runHooks(context, { type: 'init' })
  }

  let setupWatch = () => {
    if (!options.watch) return
    infoLog('watching for changes...')
    infoLog('Tips: you can press Enter to manually re-scan')
    process.stdin.on('data', async (buffer: Buffer) => {
      let data = buffer.toString().trim()
      switch (data) {
        case '':
        case 'r':
        case 'reload':
          infoLog('re-scanning...')
          context.watchers.forEach(watcher => watcher.close())
          context.watchers.clear()
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
    errorLog(error)
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
  infoLog('stopping server for restart...')
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
  infoLog('starting server...')
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

type RunHookReason =
  | {
      type: 'init'
    }
  | { type: 'update'; file: string }

async function runHooks(context: Context, reason: RunHookReason) {
  for (let hook of context.postHooks) {
    if (
      reason.type == 'init' &&
      hook.watchFiles &&
      hook.watchFiles.length > 0
    ) {
      hook.watchFiles.forEach(file => {
        const watcher = watch(
          file,
          { persistent: true },
          wrapFn1(async event => {
            if (event == 'rename') {
              watcher.close()
              context.watchers.delete(watcher)
              return
            }
            if (event != 'change') return
            await runHook(context, hook, { type: 'update', file })
          }),
        )
        context.watchers.add(watcher)
      })
    }
    if (
      reason.type == 'update' &&
      hook.watchFiles &&
      hook.watchFiles.length > 0
    ) {
      continue
    }
    await runHook(context, hook, reason)
  }
}
async function runHook(context: Context, hook: Hook, reason: RunHookReason) {
  infoLog('running postHook', JSON.stringify(hook.command), 'reason:', reason)
  await new Promise<void>((resolve, reject) => {
    child_process
      .spawn('bash', ['-c', hook.command], {
        cwd: context.cwd,
        env: process.env,
        stdio: [process.stdin, process.stdout, process.stderr],
      })
      .once('exit', code => {
        if (code == 0) {
          return resolve()
        }
        errorLog(
          'Failed on postHook:',
          JSON.stringify(hook.command),
          '(exit code: ' + code + ')',
        )
        reject(new Error('postHook failed'))
      })
  })
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
      debugLog('[skip] ', srcPath, '(not dir nor file)')
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
        debugLog(
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
          infoLog('removed file:', file)
          files.splice(fileIdx, 1)
          const childWatcher = childWatchers[filename]
          if (childWatcher) {
            childWatcher.close()
            delete childWatchers[filename]
            context.watchers.delete(childWatcher)
          }
        } else {
          // the file is newly created
          infoLog('new file:', file)
          files.push(filename)
          await processFile(filename)
          await runHooks(context, { type: 'update', file })
        }
      }),
    )
    const selfFilename = path.basename(srcDir)
    parentWatchers[selfFilename] = watcher
    context.watchers.add(watcher)
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

  async function isSameContent() {
    try {
      const destContent = await fs.readFile(destPath)
      const destCode = destContent.toString()
      return destCode.trim() == transpiledCode.trim()
    } catch (error) {
      // maybe the destPath doesn't exist
      return false
    }
  }

  if (!(await isSameContent())) {
    await fs.writeFile(destPath, transpiledCode)
  }

  if (context.watch) {
    const watcher = watch(
      srcPath,
      { persistent: true },
      wrapFn1(async (event: WatchEventType) => {
        if (event == 'rename') {
          watcher.close()
          context.watchers.delete(watcher)
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
        infoLog('updated file:', srcPath, 'in', usedTime, 'ms')

        await runHooks(context, { type: 'update', file: srcPath })
        await runServer(context)
      }),
    )
    context.watchers.add(watcher)
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
      errorLog(error)
    }
  }
}

function wrapFn2<A, B>(fn: (a: A, b: B) => any): (a: A, b: B) => void {
  return async (a: A, b: B) => {
    try {
      await fn(a, b)
    } catch (error) {
      errorLog(error)
    }
  }
}

class TranspileError extends Error {
  constructor(public file: string, public errors: any[]) {
    super()
  }
}

export function parseHook(arg: string): Hook {
  // https://stackoverflow.com/a/11819111/14681561
  const match = arg.match(/(?<!\\)(?:\\\\)*#watch:(.*?)$/)

  if (!match) return { command: arg }

  const command = arg.slice(0, arg.length - match[0].length)

  return {
    command,
    watchFiles: match[1].split(','),
  }
}
