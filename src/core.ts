import fs from 'fs/promises'
import path from 'path'

export interface ScanOptions {
  srcDir: string
  destDir: string
  watch: boolean
}

export async function scanDirectory(options: ScanOptions) {
  const { srcDir, destDir, watch } = options

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
        srcDir: srcPath,
        destDir: destPath,
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

    await transpileFile(srcPath, destPath)
  }
}

async function transpileFile(srcPath: string, destPath: string) {
  const sourceCode = (await fs.readFile(srcPath)).toString()
  const transpiledCode = await transpile(sourceCode)

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
  matches = sourceCode.matchAll(/ as (\w+)/g)
  for (let match of matches) {
    let [typeCode] = match
    let before = sourceCode[match.index! - 1]
    if (before == '*') continue
    sourceCode = sourceCode.replace(typeCode, '')
  }

  // TODO type declaration

  // variable declaration type with assignment
  matches = sourceCode.matchAll(/(\w+): \w+ =/g)
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

  return sourceCode
}
