import { parseHook } from '../core'

function test(input: {
  action: string
  arg: string
  command: string
  watchFiles?: string[]
}) {
  let hook = parseHook(input.arg)
  if (
    hook.command !== input.command ||
    hook.watchFiles?.length !== input.watchFiles?.length ||
    JSON.stringify(hook.watchFiles) !== JSON.stringify(input.watchFiles)
  ) {
    console.log('[failed]', input.action)
    console.dir({ input, parsedHook: hook }, { depth: 20 })
    throw new Error('Failed to ' + input.action)
  }
  console.log('[passed]', input.action)
}

test({
  action: 'parse hook command with spaces',
  arg: 'command with spaces',
  command: 'command with spaces',
})

test({
  action: 'parse single watch file',
  arg: 'command with spaces#watch:./src',
  command: 'command with spaces',
  watchFiles: ['./src'],
})

test({
  action: 'parse escaped command',
  arg: 'command with spaces\\#watch:./src',
  command: 'command with spaces\\#watch:./src',
})

test({
  action: 'parse multiple watch files',
  arg: 'command with spaces#watch:./file1.js,./file2.ts',
  command: 'command with spaces',
  watchFiles: ['./file1.js', './file2.ts'],
})

test({
  action: 'parse escaped hook command with multiple watch files',
  arg: 'command with spaces\\#watch:./src#watch:./file1.js,./file2.ts',
  command: 'command with spaces\\#watch:./src',
  watchFiles: ['./file1.js', './file2.ts'],
})

console.log('passed all tests for parseHook()')
