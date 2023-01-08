#!/usr/bin/env node

import fs from 'fs'
import { scanPath } from './core'

let pkg = require('../package.json')

let args = process.argv

let srcPath = ''
let destPath = ''
let watch = false
let tsconfigFile = 'tsconfig.json'

if (args.length <= 2) {
  showHelp()
  process.exit(0)
}

for (let i = 2; i < args.length; i++) {
  let arg = args[i]
  switch (arg) {
    case '--project':
    case '-p':
      i++
      tsconfigFile = args[i]
      break
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
    case '--help':
    case '-h':
      showHelp()
      process.exit(0)
    case '--watch':
    case '-w':
      watch = true
      break
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

scanPath({
  srcPath,
  destPath,
  watch,
  config: {
    jsx: compilerOptions.jsx ? 'transform' : undefined,
    jsxFactory: compilerOptions.jsxFactory,
    jsxFragment: compilerOptions.jsxFragmentFactory,
  },
})
  .then(() => {
    console.log('completed scanning')
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

Options:

  --src <dir|file>
    Specify the source directory/file
    Alias: -s

  --dest <dir|file>
    Specify the destination directory/file
    Alias: -d

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
