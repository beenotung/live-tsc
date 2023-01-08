import { AssertionError } from 'assert'
import fs from 'fs/promises'
import path from 'path'

let skipFilenames = [
  'node_modules',
  '.env',
  '.gitignore',
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
]

let skipExtnames = [
  '.env',
  '.md',
  '.txt',
  '.yaml',
  '.lock',
  '.sqlite3',
  '.sqlite3-shm',
  '.sqlite3-wal',
]

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
    if (skipFilenames.includes(file)) return
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
    } else if (extname == '.jsx') {
      destPath = destPath.replace(/jsx$/, 'js')
    } else if (extname == '.js' || extname == '.json') {
      await fs.copyFile(srcPath, destPath)
      return
    } else {
      if (!skipExtnames.includes(extname)) {
        console.debug('[skip]', srcPath, '(not supported extname)')
      }
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
  // console.debug('transpileFile:', srcPath)
  const sourceCode = (await fs.readFile(srcPath)).toString()
  let transpiledCode = transpile(sourceCode, srcPath)

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

// FIXME avoid messing with keywords in string value / jsx text
function transpile(sourceCode: string, file: string): string {
  let pendingRestores: [origin: string, placeholder: string][] = []
  function tmpReplace(origin: string, placeholder: string) {
    sourceCode = sourceCode.replace(origin, placeholder)
    pendingRestores.push([origin, placeholder])
  }

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

  // import as alias
  matches = sourceCode.matchAll(
    /import[\s\n]+{[\w\s\n]+?as[\w\s\n]+?}[\s\n]+from[\s\n]+/g,
  )
  for (let match of matches) {
    let origin = match[0]
    tmpReplace(origin, origin.replace(/ as /g, ' AS '))
  }
  matches = sourceCode.matchAll(/import \* as \w+ from/g)
  for (let match of matches) {
    let origin = match[0]
    tmpReplace(origin, origin.replace(/ as /g, ' AS '))
  }

  for (;;) {
    // as type casting
    let match = sourceCode.match(/ as (?!<)(.|\n)+/)
    if (match) {
      let [typeCode] = match
      let rest = typeCode.slice(' as '.length)
      let type = parseType(rest, file)
      typeCode = ' as ' + type
      sourceCode = sourceCode.replace(typeCode, '')
      continue
    }

    // variable declaration type with/without assignment
    match = sourceCode.match(/(let|const)([\s|\n]+\w+[\s|\n]*):(.|\n)*/)
    for (let match of matches) {
      let [typeCode, declare, name, rest] = match
      console.log({ declare, name, rest, match_0: match[0] })
      let type = parseType(rest, file)
      console.log({
        typeCode,
        declare,
        name,
        type,
        rest,
      })
      process.exit(0)
      sourceCode = sourceCode.replace(typeCode, `${declare}${name}`)
      continue
    }

    break
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

  for (;;) {
    // export type
    let match = sourceCode.match(/export type (\w+) =/)
    if (!match) break
    let [typeCode, name] = match
    let idx = match.index! + typeCode.length
    let rest = sourceCode.slice(idx)
    let type = parseType(rest, file)
    // console.debug('type declaration:', { name, type })
    typeCode += type
    sourceCode = sourceCode.replace(typeCode, '')

    // define type (not exported)
  }

  for (let [origin, placeholder] of pendingRestores) {
    // console.log('restore:', { origin, placeholder })
    sourceCode = sourceCode.replace(placeholder, origin)
  }

  return sourceCode
}

function parseType(code: string, file: string): string {
  return new TypeParser(code, file).type
}

class TypeParser {
  type = ''
  rest: string
  constructor(private code: string, private file: string) {
    this.rest = code
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
    return this.rest.match(regex)
  }
  private startsWith(part: string) {
    return this.rest.startsWith(part)
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

    if (this.startsWith('[')) {
      this.takeStaticArray()
      return
    }

    // named type
    this.takeName()
    this.takeGenericType()
  }
  private takeStaticArray() {
    // open bracket
    this.take('[')
    this.takeWhitespace()

    for (;;) {
      if (this.startsWith(']')) break

      // type or name
      this.takeType()
      this.takeWhitespace()

      // optional flag
      if (this.startsWith('?')) {
        this.take('?')
        this.takeWhitespace()
      }

      // colon and type
      if (this.startsWith(':')) {
        this.take(':')
        this.takeWhitespace()
        this.takeType()
        this.takeWhitespace()
      }

      // comma and next pair
      if (this.startsWith(',')) {
        this.take(',')
        this.takeWhitespace()
      }
    }

    // close bracket
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
    for (; this.rest.length > 0; ) {
      let char = this.rest[0]
      if (char == quote) {
        this.take(char)
        return
      }
      if (char == '\\') {
        this.take(this.rest.slice(0, 2))
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
    return new ParseError(this, name)
  }
  private take(part: string) {
    if (!this.rest.startsWith(part)) {
      let sample = this.rest.slice(0, part.length)
      console.error({})
      throw new AssertionError({
        expected: 'starts with ' + JSON.stringify(part),
        actual: 'starts with ' + JSON.stringify(sample),
        message: 'failed to take given part',
        operator: 'take(part)',
      })
    }
    this.type += part
    this.rest = this.rest.slice(part.length)
  }
}

class ParseError extends Error {
  constructor(public parser: TypeParser, public parsingPart: string) {
    super()
  }
}
