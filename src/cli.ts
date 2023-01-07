#!/usr/bin/env node

import { scanDirectory } from './core'

let pkg = require('../package.json')

let args = process.argv

let srcDir = ''
let destDir = ''
let watch = false

if (args.length <= 2) {
  showHelp()
  process.exit(0)
}

for (let i = 2; i < args.length; i++) {
  let arg = args[i]
  switch (arg) {
    case '--src-dir':
    case '-s':
      srcDir = args[i + 1]
      i++
      break
    case '-dest-dir':
    case '-d':
      destDir = args[i + 1]
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

if (!srcDir) {
  console.error('No --src-dir specified')
  process.exit(1)
}

if (!destDir) {
  console.error('No --dest-dir specified')
  process.exit(1)
}

scanDirectory({ srcDir, destDir, watch })
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

  --src-dir <dir>
    Specify the source directory
    Alias: -s

  --dest-dir <dir>
    Specify the destination directory
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
