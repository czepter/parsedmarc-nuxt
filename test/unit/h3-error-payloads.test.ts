import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverDir = join(process.cwd(), 'app/server')

async function tsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return tsFiles(path)
    if (entry.isFile() && entry.name.endsWith('.ts')) return [path]
    return []
  }))

  return nested.flat()
}

describe('H3 error payloads', () => {
  it('keeps dynamic error details out of statusMessage', async () => {
    const files = await tsFiles(serverDir)
    const offenders: string[] = []

    for (const file of files) {
      const source = await readFile(file, 'utf8')
      const matches = source.matchAll(/statusMessage:\s*`/g)
      for (const match of matches) {
        const line = source.slice(0, match.index).split('\n').length
        offenders.push(`${relative(process.cwd(), file)}:${line}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
