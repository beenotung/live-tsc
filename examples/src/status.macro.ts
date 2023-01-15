import { genEnums } from './enums'

let template = `
400 bad request
404 page not found
500 server failure
`

genEnums('statusCodes', template)
