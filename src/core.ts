import { AssertionError } from 'assert'
import fs from 'fs/promises'
import path from 'path'

export interface ScanOptions {
  srcPath: string
  destPath: string
  watch: boolean
}

export async function scanPath(options: ScanOptions) {
  let stat = await fs.stat(options.srcPath)
  if (stat.isFile()) {
    return scanFile(options)
  }
  if (stat.isDirectory()) {
    return scanDirectory(options)
  }
}

async function scanDirectory(options: ScanOptions) {
  const { srcPath: srcDir, destPath: destDir, watch } = options

  const files = await fs.readdir(srcDir)

  await Promise.all(files.map(processFile))

  async function processFile(file: string) {
    const extname = path.extname(file)

    const srcPath = path.join(srcDir, file)
    let destPath = path.join(destDir, file)

    const stat = await fs.stat(srcPath)

    if (stat.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true })
      await scanDirectory({
        srcPath: srcPath,
        destPath: destPath,
        watch,
      })
      return
    }

    if (!stat.isFile()) {
      console.debug('[skip] ', srcPath, '(not dir nor file)')
      return
    }

    if (extname == '.ts') {
      destPath = destPath.replace(/ts$/, 'js')
    } else if (extname == '.tsx') {
      destPath = destPath.replace(/tsx$/, 'js')
    } else {
      await fs.copyFile(srcPath, destPath)
      return
    }

    await scanFile({ srcPath, destPath, watch })
  }
}

async function scanFile(options: ScanOptions) {
  let { srcPath, destPath } = options
  await transpileFile(srcPath, destPath)
}

async function transpileFile(srcPath: string, destPath: string) {
  const sourceCode = (await fs.readFile(srcPath)).toString()
  let transpiledCode: string
  try {
    transpiledCode = await transpile(sourceCode)
  } catch (error) {
    console.error('failed to transpile file:', srcPath)
    throw error
  }

  try {
    const destCode = (await fs.readFile(destPath)).toString()
    if (destCode.trim() == transpiledCode.trim()) {
      return
    }
  } catch (error) {
    // maybe the destPath doesn't exist
  }

  await fs.writeFile(destPath, transpiledCode)
}

async function transpile(sourceCode: string): Promise<string> {
  // import type
  let matches = sourceCode.matchAll(/import type {(.|\n)*?} from '.*';?\n/g)
  for (let match of matches) {
    let [typeCode] = match
    sourceCode = sourceCode.replace(typeCode, '')
  }
  matches = sourceCode.matchAll(/import type \w+ from '.*';?\n/g)
  for (let match of matches) {
    let [typeCode] = match
    sourceCode = sourceCode.replace(typeCode, '')
  }

  // as type casting
  matches = sourceCode.matchAll(/ as ([\w.]+)/g)
  for (let match of matches) {
    let [typeCode] = match
    let before = sourceCode[match.index! - 1]
    if (before == '*') continue
    sourceCode = sourceCode.replace(typeCode, '')
  }

  // variable declaration type with assignment
  matches = sourceCode.matchAll(/(\w+): [\w.]+ =/g)
  for (let match of matches) {
    let [typeCode, name] = match
    sourceCode = sourceCode.replace(typeCode, `${name} =`)
  }

  // variable declaration type without assignment
  matches = sourceCode.matchAll(/let (\w+): .*(?!=)\n/g)
  for (let match of matches) {
    let [typeCode, name] = match
    sourceCode = sourceCode.replace(typeCode, `let ${name}\n`)
  }

  // function argument type
  matches = sourceCode.matchAll(/\((\w+): ([\w.]+)\)/g)
  for (let match of matches) {
    let [typeCode, name, type] = match
    sourceCode = sourceCode.replace(typeCode, `(${name})`)
  }
  // TODO support multiple arguments

  // function return type
  matches = sourceCode.matchAll(/function (\w+\(.*\)): [\w. |]+{/g)
  for (let match of matches) {
    let [typeCode, rest] = match
    sourceCode = sourceCode.replace(typeCode, `function ${rest} {`)
  }

  // TODO type declaration
  for (;;) {
    let match = sourceCode.match(/export type (\w+) =/)
    if (!match) break
    let [typeCode, name] = match
    let idx = match.index! + typeCode.length
    let rest = sourceCode.slice(idx)
    let type = parseType(rest)
    console.debug('type declaration:', { name, type })
    typeCode += type
    sourceCode = sourceCode.replace(typeCode, '')
  }

  return sourceCode
}

function parseType(code: string): string {
  try {
    return new TypeParser(code).type
  } catch (error) {
    console.error('failed to parse type, sample:')
    console.error('v'.repeat(32))
    console.error(code.slice(0, 200))
    console.error('^'.repeat(32))
    throw error
  }
}

class TypeParser {
  type = ''
  constructor(private code: string) {
    this.takeType()
  }
  private takeType() {
    this.takeWhitespace()

    // union type
    let match = this.match(/^[|&]/)
    if (match) {
      this.take(match[0])
      this.takeWhitespace()
    }

    this.takeOneType()
    for (;;) {
      let match = this.match(/^[\s|\n]*[|&][\s|\n]*/)
      if (!match) break
      this.take(match[0])
      this.takeOneType()
    }
  }
  private match(regex: RegExp) {
    return this.code.match(regex)
  }
  private startsWith(part: string) {
    return this.code.startsWith(part)
  }
  private takeOneType() {
    this.takeOneTypeNotArray()
    let match = this.match(/^\[\]/)
    if (match) {
      this.take(match[0])
    }
  }
  // TODO support array function
  private takeOneTypeNotArray() {
    // number literal
    let match = this.match(/^[\d-]+/)
    if (match) {
      this.take(match[0])
      return
    }

    // string literal
    match = this.match(/^["']/)
    if (match) {
      this.takeString(match[0])
      return
    }
    // TODO support template string

    // object
    if (this.startsWith('{')) {
      this.takeObject()
      return
    }

    // bracket
    if (this.startsWith('(')) {
      this.takeCurlyBracket()
      return
    }

    if (this.match(/^\[\w+(.|\n)*\]/)) {
      this.takeStaticArray()
      return
    }

    // named type
    this.takeName()
    this.takeGenericType()
  }
  private takeStaticArray() {
    this.take('[')
    this.takeWhitespace()

    for (;;) {
      if (this.startsWith(']')) break

      this.takeName()
      this.takeWhitespace()

      if (this.startsWith('?')) {
        this.take('?')
        this.takeWhitespace()
      }

      if (this.startsWith(':')) {
        this.take(':')
        this.takeWhitespace()
        this.takeType()
        this.takeWhitespace()
      }

      if (this.startsWith(',')) {
        this.take(',')
        this.takeWhitespace()
      }
    }
    this.take(']')
  }
  private takeCurlyBracket() {
    // open bracket
    this.take('(')
    this.takeWhitespace()

    for (;;) {
      // close bracket
      if (this.startsWith(')')) break

      // name or type
      this.takeType()
      this.takeWhitespace()

      // optional flag
      let match = this.match(/^\?[\s|\n]*/)
      if (match) {
        this.take(match[0])
      }

      // colon and type
      match = this.match(/^:[\s|\n]*/)
      if (match) {
        this.take(match[0])
        this.takeType()
        this.takeWhitespace()
      }

      // comma and next pair
      match = this.match(/^,[\s|\n]*/)
      if (match) {
        this.take(match[0])
      }
    }
    this.take(')')

    let match = this.match(/^[\s|\n]*=>[\s|\n]*/)
    if (match) {
      this.take(match[0])
      this.takeType()
    }
  }
  private takeObject() {
    // open bracket
    this.take('{')

    for (;;) {
      this.takeWhitespace()

      // close bracket
      if (this.startsWith('}')) {
        this.take('}')
        return
      }

      // key
      this.takeObjectKey()

      this.takeWhitespace()

      // method parameter
      if (this.startsWith('(')) {
        this.takeCurlyBracket()
      }

      // optional flag
      let match = this.match(/^\?[\s|\n]*/)
      if (match) {
        this.take(match[0])
      }

      // colon
      this.takeColon('after object key')

      // value
      this.takeType()
    }
  }
  private takeObjectKey() {
    // literal string
    let match = this.match(/^['"]/)
    if (match) {
      this.takeString(match[0])
      return
    }

    // square bracket, e.g. [key: string]
    if (this.startsWith('[')) {
      this.takeObjectKeySquareBracket()
      return
    }

    this.takeName()
  }
  private takeColon(place: string) {
    let match = this.match(/^[\s|\n]*:[\s|\n]*/)
    if (!match) throw this.parseError('colon ' + place)
    this.take(match[0])
  }
  private takeObjectKeySquareBracket() {
    // open bracket
    this.take('[')

    // name
    this.takeWhitespace()
    this.takeName()

    // colon
    this.takeColon('in object key square bracket')

    // type
    this.takeType()

    // close bracket
    let match = this.match(/^[\s|\n]*]/)
    if (!match)
      throw this.parseError('close bracket of object key square bracket')
    this.take(match[0])
  }
  private takeString(quote: string) {
    this.take(quote)
    quote = quote.trim()
    for (; this.code.length > 0; ) {
      let char = this.code[0]
      if (char == quote) {
        this.take(char)
        return
      }
      if (char == '\\') {
        this.take(this.code.slice(0, 2))
      } else {
        this.take(char)
      }
    }
    throw this.parseError('string close quote')
  }
  private takeGenericType() {
    // open bracket
    let match = this.match(/^[\s|\n]*<[\s|\n]*/)
    if (!match) return

    // first generic type
    this.take(match[0])
    this.takeType()

    // more generic types
    for (;;) {
      // comma
      let match = this.match(/^[\s|\n]*,[\s|\n]*/)
      if (!match) break
      this.take(match[0])
      // next generic type
      this.takeType()
    }

    // close bracket
    match = this.match(/^[\s|\n]*>/)
    if (!match) throw this.parseError('generic type close bracket')
    this.take(match[0])
  }
  private takeWhitespace() {
    for (;;) {
      // whitespace and newline
      let match = this.match(/^[\s|\n]+/)
      if (match) {
        this.take(match[0])
        continue
      }
      // whole-line comment
      match = this.match(/^\/\/.*\n/)
      if (match) {
        this.take(match[0])
        continue
      }
      // inline comment
      match = this.match(/^\/\*.*\*\//)
      if (match) {
        this.take(match[0])
        continue
      }
      break
    }
  }
  private takeName() {
    let match = this.match(/^[\w.]+/)
    if (!match) throw this.parseError('name')
    this.take(match[0])
  }
  private parseError(name: string) {
    let acc = JSON.stringify(this.type)
    let rest = JSON.stringify(this.code.slice(0, 10))
    return new Error(`Failed to parse ${name}, acc: ${acc}, rest: ${rest} ...`)
  }
  private take(part: string) {
    if (!this.code.startsWith(part)) {
      let sample = this.code.slice(0, part.length)
      console.error({})
      throw new AssertionError({
        expected: 'starts with ' + JSON.stringify(part),
        actual: 'starts with ' + JSON.stringify(sample),
        message: 'failed to take given part',
        operator: 'take(part)',
      })
    }
    this.type += part
    this.code = this.code.slice(part.length)
  }
}
