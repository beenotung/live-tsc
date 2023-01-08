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
    return scanDirectory(options)
  }
}

async function scanDirectory(options: ScanOptions) {
  const { srcPath: srcDir, destPath: destDir, watch, config } = options

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
      await scanDirectory({
        srcPath: srcPath,
        destPath: destPath,
        watch,
        config,
      })
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

    await scanFile({ srcPath, destPath, watch, config })
  }
}

async function scanFile(options: ScanOptions) {
  let { srcPath, destPath } = options
  await transpileFile(srcPath, destPath, options.config)
}

async function transpileFile(
  srcPath: string,
  destPath: string,
  config: ScanOptions['config'],
) {
  // console.debug('transpileFile:', srcPath)
  const sourceCode = (await fs.readFile(srcPath)).toString()
  let transpiledCode = await transpile(sourceCode, srcPath, config)

  try {
    const destCode = (await fs.readFile(destPath)).toString()
    if (destCode.trim() == transpiledCode.trim()) {
      return
    }
  } catch (error) {
    // maybe the destPath doesn't exist
  }

  await fs.writeFile(destPath, transpiledCode)
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
