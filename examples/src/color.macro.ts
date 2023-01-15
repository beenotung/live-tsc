import { genEnums } from './enums'

let template = `
'f00' red
'0f0' green
'00f' blue
`

genEnums('colors', template)
