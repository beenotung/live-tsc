import { EOL } from 'os'

export function genEnums(name: string, template: string) {
  let code = ''

  let keys: string[] = []

  template.split(EOL).forEach(line => {
    if (!line) return
    let parts = line.split(' ')
    let value = parts[0]
    let key = parts
      .slice(1)
      .map(word => word[0].toUpperCase() + word.slice(1))
      .join('')
    keys.push(key)
    code += `
export let ${key} = ${value}
`
  })

  code += `
export let ${name} = {`
  keys.forEach(
    name =>
      (code += `
  ${name},`),
  )
  code += `
}`

  return code.trim() + '\n'
}
