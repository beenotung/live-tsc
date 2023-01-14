#!/usr/bin/env node

import fs from 'fs'
import { ScanOptions, scanPath } from './core'
import type { Format } from 'esbuild'

const pkg = require('../package.json')

const args = process.argv

let srcPath = ''
let destPath = ''
let excludePaths: string[] = []
let tsconfigFile = 'tsconfig.json'
let watch = false
let format: Format = 'esm'
let postHooks: string[] = []
let serverFile = ''
let open = ''
let cwd = process.cwd()

if (args.length <= 2) {
  showHelp()
  process.exit(0)
}

for (let i = 2; i < args.length; i++) {
  const arg = args[i]
  const takeNext = () => {
    i++
    const next = args[i]
    if (!next) {
      console.error('Error: missing argument after', JSON.stringify(arg))
      process.exit(1)
    }
    return next
  }
  switch (arg) {
    case '--src':
    case '-s':
      srcPath = takeNext()
      break
    case '--dest':
    case '-d':
      destPath = takeNext()
      break
    case '--exclude':
    case '-e':
      excludePaths.push(takeNext())
      break
    case '--project':
    case '-p':
      tsconfigFile = takeNext()
      break
    case '--watch':
    case '-w':
      watch = true
      break
    case '--post-hook':
      postHooks.push(takeNext())
      break
    case '--server':
      serverFile = takeNext()
      break
    case '--cwd':
    case '-c':
      cwd = takeNext()
      break
    case '--open':
    case '-o':
      open = takeNext()
      break
    case '--format':
    case '-f':
      const formatStr = takeNext()
  
      if (formatStr !== 'cjs' && formatStr !== 'esm' && formatStr !== 'iife') {
        console.error('Error: unknown format', JSON.stringify(formatStr))
        process.exit(1)
      }
  
      format = formatStr 
      break
    case '--help':
    case '-h':
      showHelp()
      process.exit(0)

    default:
      console.error('Error: unknown argument', JSON.stringify(arg))
      process.exit(1)
  }
}

if (!srcPath) {
  console.error('Error: no "--src" specified')
  process.exit(1)
}

if (!destPath) {
  console.error('Error: no "--dest" specified')
  process.exit(1)
}

if (!tsconfigFile) {
  console.error('Error: no "--project" specified')
  process.exit(1)
}

if (!cwd) {
  console.error('Error: no "--cwd" specified')
  process.exit(1)
}

const compilerOptions =
  JSON.parse(fs.readFileSync(tsconfigFile).toString()).compilerOptions || {}

const scanOptions: ScanOptions = {
  srcPath,
  destPath,
  watch,
  excludePaths,
  postHooks,
  cwd,
  serverFile,
  open,
  config: {
    jsx: compilerOptions.jsx ? 'transform' : undefined,
    jsxFactory: compilerOptions.jsxFactory,
    jsxFragment: compilerOptions.jsxFragmentFactory,
    format,
  },
}

scanPath(scanOptions).catch(err => {
  console.error(err || '(error not specified)')
  process.exit(1)
})

function showHelp() {
  console.log(
    `
${pkg.name} v${pkg.version}

Usage:
  ${pkg.name} [options]

Example:
  npx ${pkg.name} \\
    --watch \\
    --src     ./ \\
    --dest    ./dist \\
    --exclude ./scripts \\
    --exclude ./public \\
    --exclude ./data \\
    --exclude ./db/data \\
    --post-hook "npx fix-esm-import-path dist/db/proxy.js" \\
    --server  ./dist/server/index.js \\
    --open "https://localhost:8100"

Options:

  --src <dir|file>
    Specify the source directory/file
    Alias: -s

  --dest <dir|file>
    Specify the destination directory/file
    Alias: -d

  --exclude <dir|file>
    Specify the path to be excluded;
    Can be specified multiple times;
    The destination directory is excluded by default
    Alias: -e

  --project <file>
    Specify the path of tsconfig file
    Alias: -p
    Default: tsconfig.json

  --watch
    Watch for changes and rerun
    Alias: -w
    
  --format <cjs|esm|iife>
    Sets the output format for the generated JavaScript files
    Alias: -f
    Default: esm

  --post-hook <command>
    Add command to run after initial scan and subsequence updates;
    Can be specified multiple times;

  --server <file>
    Specify the path of server js file

  --cwd <dir>
    Specify the current working directory for the server and postHooks
    Alias: -c
    Default: sample as process.cwd

  --open <url>
    Open the url in the default browser after initial scanning
    Alias: -o

  --help
    Show help message
    Alias: -h
`.trim(),
  )
}
