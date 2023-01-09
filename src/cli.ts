#!/usr/bin/env node

import fs from 'fs'
import { ScanOptions, scanPath } from './core'

let pkg = require('../package.json')

let args = process.argv

let srcPath = ''
let destPath = ''
let excludePaths: string[] = []
let tsconfigFile = 'tsconfig.json'
let watch = false
let postHooks: string[] = []

if (args.length <= 2) {
  showHelp()
  process.exit(0)
}

for (let i = 2; i < args.length; i++) {
  let arg = args[i]
  let takeNext = () => {
    i++
    let next = args[i]
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

let compilerOptions =
  JSON.parse(fs.readFileSync(tsconfigFile).toString()).compilerOptions || {}

let scanOptions: ScanOptions = {
  srcPath,
  destPath,
  watch,
  excludePaths,
  postHooks,
  config: {
    jsx: compilerOptions.jsx ? 'transform' : undefined,
    jsxFactory: compilerOptions.jsxFactory,
    jsxFragment: compilerOptions.jsxFragmentFactory,
  },
}

scanPath(scanOptions).catch(err => {
  console.error(err)
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
    --project ../ts-liveview/tsconfig.json \\
    --src     ../ts-liveview \\
    --dest    ../ts-liveview/dist \\
    --exclude ../ts-liveview/scripts \\
    --exclude ../ts-liveview/public \\
    --post-hook "npx fix-esm-import-path ../ts-liveview/dist/db/proxy.js"

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

  --watch
    Watch for changes and rerun
    Alias: -w

  --post-hook <command>
    Add command to run after initial scan and subsequence updates;
    Can be specified multiple times;

  --help
    Show help message
    Alias: -h
`.trim(),
  )
}
