import { EOL } from 'os'

let code = ''

let template = `
400 bad request
404 page not found
500 server failure
`

let names: string[] = []

template.split(EOL).forEach(line => {
  if (!line) return
  let parts = line.split(' ')
  let statusCode = parts[0]
  let statusText = parts
    .slice(1)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join('')
  names.push(statusText)
  code += `
export let ${statusText} = ${statusCode}
`
})

code += `
export let codes = {`
names.forEach(
  name =>
    (code += `
  ${name},`),
)
code += `
}`

code.trim() + '\n'
