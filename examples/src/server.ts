import { colors } from './color'
import { statusCodes } from './status'

console.log({ statusCodes, colors })

console.log('server running...')

setTimeout(() => {
  // hold the event loop
}, 1000000)
