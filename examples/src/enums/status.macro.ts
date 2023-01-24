import { genEnums } from './genEnums'

let template = `
200 ok
302 continue
400 bad request
404 page not found
500 server failure
`

genEnums('statusCodes', template)
