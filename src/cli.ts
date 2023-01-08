#!/usr/bin/env node

import { scanPath } from './core'

let pkg = require('../package.json')

let args = process.argv

let srcPath = ''
let destPath = ''
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
      srcPath = args[i + 1]
      i++
      break
    case '--dest':
    case '-d':
      destPath = args[i + 1]
      i++
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

scanPath({ srcPath, destPath, watch })
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

  --watch
    Watch for changes and rerun
    Alias: -w

  --help
    Show this message
    Alias: -h
`.trim(),
  )
}
