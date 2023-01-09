import { FSWatcher, watch } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import esbuild from 'esbuild'
import child_process from 'child_process'

let skipFilenames = [
  'node_modules',
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
  watch: boolean
  excludePaths: string[]
  postHooks: string[]
  config: {
    jsx?: 'transform' | 'preserve' | 'automatic'
    jsxFactory?: string
    jsxFragment?: string
  }
}

export async function scanPath(options: ScanOptions) {
  let startTime = Date.now()

  if (!options.excludePaths.includes(options.destPath)) {
    options.excludePaths.push(options.destPath)
  }
  let stat = await fs.stat(options.srcPath)
  if (stat.isFile()) {
    await scanFile(options)
  } else if (stat.isDirectory()) {
    await scanDirectory(options, {})
  }

  let endTime = Date.now()
  let usedTime = endTime - startTime
  console.info('completed scanning in', usedTime, 'ms')

  await runHooks(options)

  if (options.watch) {
    console.info('watching for changes...')
  }
}

async function runHooks(options: ScanOptions) {
  for (let cmd of options.postHooks) {
    console.info('running postHook', JSON.stringify(cmd))
    await new Promise<void>((resolve, reject) => {
      child_process
        .spawn('bash', ['-c', cmd], {
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
  options: ScanOptions,
  parentWatchers: Record<string, FSWatcher>,
) {
  const { srcPath: srcDir, destPath: destDir } = options

  if (options.excludePaths.includes(srcDir)) return

  const childWatchers: Record<string, FSWatcher> = {}

  await fs.mkdir(destDir, { recursive: true })

  const files = await fs.readdir(srcDir)

  await Promise.all(files.map(processFile))

  async function processFile(file: string) {
    if (skipFilenames.includes(file)) return

    const srcPath = path.join(srcDir, file)
    if (options.excludePaths.includes(srcPath)) return

    let destPath = path.join(destDir, file)

    const stat = await fs.stat(srcPath)

    if (stat.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true })
      await scanDirectory(
        {
          srcPath: srcPath,
          destPath: destPath,
          watch: options.watch,
          config: options.config,
          excludePaths: options.excludePaths,
          postHooks: options.postHooks,
        },
        childWatchers,
      )
      return
    }

    if (!stat.isFile()) {
      console.debug('[skip] ', srcPath, '(not dir nor file)')
      return
    }

    const extname = path.extname(file)
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

    await scanFile({
      srcPath,
      destPath,
      watch: options.watch,
      config: options.config,
      excludePaths: options.excludePaths,
      postHooks: options.postHooks,
    })
  }

  if (options.watch) {
    const watcher = watch(
      srcDir,
      { persistent: true, recursive: false },
      async (event, filename) => {
        if (event != 'rename') return

        const file = path.join(srcDir, filename)

        if (options.excludePaths.includes(file)) return

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
          await runHooks(options)
        }
      },
    )
    const selfFilename = path.basename(srcDir)
    parentWatchers[selfFilename] = watcher
  }
}

async function scanFile(options: ScanOptions) {
  let { srcPath, destPath } = options
  await transpileFile(srcPath, destPath, options)
}

async function transpileFile(
  srcPath: string,
  destPath: string,
  options: ScanOptions,
) {
  let sourceCode = (await fs.readFile(srcPath)).toString()
  let transpiledCode = await transpile(sourceCode, srcPath, options.config)

  try {
    const destCode = (await fs.readFile(destPath)).toString()
    if (destCode.trim() == transpiledCode.trim()) {
      return
    }
  } catch (error) {
    // maybe the destPath doesn't exist
  }

  await fs.writeFile(destPath, transpiledCode)

  if (options.watch) {
    const watcher = watch(srcPath, { persistent: true }, async event => {
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
        options.config,
      )
      if (newTranspiledCode == transpiledCode) return
      transpiledCode = newTranspiledCode

      await fs.writeFile(destPath, newTranspiledCode)

      let endTime = Date.now()

      let usedTime = endTime - startTime
      console.info('updated file:', srcPath, 'in', usedTime, 'ms')

      await runHooks(options)
    })
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
    })
    code = result.code
  } catch (error: any) {
    throw new TranspileError(file, error.errors)
  }
  return code.replace(/ \/\* @__PURE__ \*\/ /g, ' ')
}

class TranspileError extends Error {
  constructor(public file: string, public errors: any[]) {
    super()
  }
}
