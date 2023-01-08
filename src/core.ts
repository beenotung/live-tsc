import { FSWatcher, watch } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import esbuild from 'esbuild'

let skipFilenames = [
  'node_modules',
  '.env',
  '.gitignore',
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'tsconfig.json',
]

let skipExtnames = [
  '.env',
  '.md',
  '.txt',
  '.yaml',
  '.lock',
  '.sqlite3',
  '.sqlite3-shm',
  '.sqlite3-wal',
]

let copyExtnames = ['.js', '.html', '.css']

export interface ScanOptions {
  srcPath: string
  destPath: string
  watch: boolean
  config: {
    jsx?: 'transform' | 'preserve' | 'automatic'
    jsxFactory?: string
    jsxFragment?: string
  }
}

export async function scanPath(options: ScanOptions) {
  let stat = await fs.stat(options.srcPath)
  if (stat.isFile()) {
    return scanFile(options)
  }
  if (stat.isDirectory()) {
    return scanDirectory(options, {})
  }
}

async function scanDirectory(
  options: ScanOptions,
  parentWatchers: Record<string, FSWatcher>,
) {
  const { srcPath: srcDir, destPath: destDir, config } = options
  const childWatchers: Record<string, FSWatcher> = {}

  await fs.mkdir(destDir, { recursive: true })

  const files = await fs.readdir(srcDir)

  await Promise.all(files.map(processFile))

  async function processFile(file: string) {
    if (skipFilenames.includes(file)) return
    const extname = path.extname(file)

    const srcPath = path.join(srcDir, file)
    let destPath = path.join(destDir, file)

    const stat = await fs.stat(srcPath)

    if (stat.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true })
      await scanDirectory(
        {
          srcPath: srcPath,
          destPath: destPath,
          watch: options.watch,
          config,
        },
        childWatchers,
      )
      return
    }

    if (!stat.isFile()) {
      console.debug('[skip] ', srcPath, '(not dir nor file)')
      return
    }

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
        console.debug('[skip]', srcPath, '(not supported extname)')
      }
      return
    }

    await scanFile({ srcPath, destPath, watch: options.watch, config })
  }

  if (options.watch) {
    const watcher = watch(
      srcDir,
      { persistent: true, recursive: false },
      (event, filename) => {
        if (event != 'rename') return

        const file = path.join(srcDir, filename)
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
          processFile(filename)
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
