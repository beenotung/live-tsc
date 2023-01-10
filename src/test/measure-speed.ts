import { execSync } from 'child_process'

function test_tsc() {
  let cwd = '../ts-liveview'
  let i = 0
  let totalTime = 0
  for (;;) {
    i++
    // execSync('rm -rf dist', { cwd })
    let start = Date.now()
    execSync('node_modules/.bin/tsc -p .', { cwd })
    let end = Date.now()
    totalTime += end - start
    let speed = Math.round(totalTime / i).toLocaleString()
    console.log(`${i} samples, ${speed} ms/run`)
  }
}

function test_live_tsc() {
  let i = 0
  let totalTime = 0
  for (;;) {
    i++
    // execSync('rm -rf ../ts-liveview/dist')
    let start = Date.now()
    execSync('node dist/test/scan-dir.js')
    let end = Date.now()
    totalTime += end - start
    let speed = Math.round(totalTime / i).toLocaleString()
    console.log(`${i} samples, ${speed} ms/run`)
  }
}

console.log('starts')

// test_tsc()
test_live_tsc()
