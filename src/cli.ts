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

if (args.length <= 2) {
  showHelp()
  process.exit(0)
}

for (let i = 2; i < args.length; i++) {
  let arg = args[i]
  switch (arg) {
    case '--src':
    case '-s':
      i++
      srcPath = args[i]
      break
    case '--dest':
    case '-d':
      i++
      destPath = args[i]
      break
    case '--exclude':
    case '-e':
      i++
      excludePaths.push(args[i])
      break
    case '--project':
    case '-p':
      i++
      tsconfigFile = args[i]
      break
    case '--watch':
    case '-w':
      watch = true
      break
    case '--help':
    case '-h':
      showHelp()
      process.exit(0)

    default:
      console.error('Unknown argument: ' + JSON.stringify(arg))
      process.exit(1)
  }
}

if (!srcPath) {
  console.error('No --src specified')
  process.exit(1)
}

if (!destPath) {
  console.error('No --dest specified')
  process.exit(1)
}

if (!tsconfigFile) {
  console.error('No --project specified')
  process.exit(1)
}

let compilerOptions =
  JSON.parse(fs.readFileSync(tsconfigFile).toString()).compilerOptions || {}

let scanOptions: ScanOptions = {
  srcPath,
  destPath,
  watch,
  excludePaths,
  config: {
    jsx: compilerOptions.jsx ? 'transform' : undefined,
    jsxFactory: compilerOptions.jsxFactory,
    jsxFragment: compilerOptions.jsxFragmentFactory,
  },
}

let startTime = Date.now()
scanPath(scanOptions)
  .then(() => {
    let endTime = Date.now()
    let usedTime = endTime - startTime
    console.info('completed scanning in', usedTime, 'ms')
    if (watch) {
      console.info('watching for changes...')
    }
  })
  .catch(err => {
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
    --src ../ts-liveview \\
    --dest ../ts-liveview/dist \\
    --exclude ../ts-liveview/scripts

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

  --help
    Show this message
    Alias: -h
`.trim(),
  )
}
