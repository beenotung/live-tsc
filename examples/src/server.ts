import { codes } from './enums'

console.log('server running:', codes)

setTimeout(() => {
  // hold the event loop
}, 1000000)
