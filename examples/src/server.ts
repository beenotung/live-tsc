import { colors } from './enums/color'
import { statusCodes } from './enums/status'

console.log({ statusCodes, colors })

console.log('server running...')

setTimeout(() => {
  // hold the event loop
}, 1000000)
