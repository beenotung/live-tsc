import { parseHook } from '../core'

let hook = parseHook('command with spaces')

if (hook.command !== 'command with spaces' || hook.watchFiles.length !== 0) {
  throw new Error('Failed to parse hook command with spaces')
}

hook = parseHook('command with spaces#watch:./src')

if (
  hook.command !== 'command with spaces' ||
  hook.watchFiles.length !== 1 ||
  hook.watchFiles[0] !== './src'
) {
  throw new Error('Failed to parse single watch file')
}

hook = parseHook('command with spaces\\#watch:./src')

if (
  hook.command !== 'command with spaces\\#watch:./src' ||
  hook.watchFiles.length !== 0
) {
  throw new Error('Failed to parse escaped command')
}

hook = parseHook('command with spaces#watch:./file1.js,./file2.ts')

if (
  hook.command !== 'command with spaces' ||
  hook.watchFiles.length !== 2 ||
  hook.watchFiles[0] !== './file1.js' ||
  hook.watchFiles[1] !== './file2.ts'
) {
  throw new Error('Failed to parse multiple watch files')
}

hook = parseHook(
  'command with spaces\\#watch:./src#watch:./file1.js,./file2.ts',
)

if (
  hook.command !== 'command with spaces\\#watch:./src' ||
  hook.watchFiles.length !== 2 ||
  hook.watchFiles[0] !== './file1.js' ||
  hook.watchFiles[1] !== './file2.ts'
) {
  throw new Error(
    'Failed to parse escaped hook command with multiple watch files',
  )
}

console.log('passed all tests for parseHook()')
