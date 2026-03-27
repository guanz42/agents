import { existsSync, mkdtempSync, readFileSync, realpathSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createWriteFileTool, writeFileSchema } from '../../src/tools/write-file.js'

describe('write_file tool', () => {
  it('writes a file inside the workspace', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tool-write-'))
    const tool = createWriteFileTool(root)
    const target = path.join(root, 'notes.txt')

    const result = await tool.execute({ path: 'notes.txt', content: 'hello tools' })

    expect(result.ok).toBe(true)
    expect(result.path).toBe(realpathSync(target))
    expect(result.bytesWritten).toBe(11)
    expect(readFileSync(target, 'utf8')).toBe('hello tools')
  })

  it('exposes the expected input schema', () => {
    const tool = createWriteFileTool(process.cwd())
    expect(tool.schema).toBe(writeFileSchema)
  })

  it('rejects writing through a symlinked directory that escapes the workspace root', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'tool-write-workspace-'))
    const outsideRoot = mkdtempSync(path.join(tmpdir(), 'tool-write-outside-'))
    const escapedFile = path.join(outsideRoot, 'pwned.txt')

    symlinkSync(outsideRoot, path.join(workspaceRoot, 'escape'))

    const tool = createWriteFileTool(workspaceRoot)
    const result = await tool.execute({ path: 'escape/pwned.txt', content: 'should not write' })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('Path must stay inside the workspace root')
    expect(existsSync(escapedFile)).toBe(false)
  })

  it('returns structured failure for direct escape paths', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'tool-write-workspace-'))
    const outsideRoot = mkdtempSync(path.join(tmpdir(), 'tool-write-outside-'))
    const outsideFile = path.join(outsideRoot, 'outside.txt')
    const tool = createWriteFileTool(workspaceRoot)

    const relativeEscape = await tool.execute({ path: '../outside.txt', content: 'blocked' })
    expect(relativeEscape.ok).toBe(false)
    expect(relativeEscape.error).toContain('Path must stay inside the workspace root')

    const absoluteEscape = await tool.execute({ path: outsideFile, content: 'blocked' })
    expect(absoluteEscape.ok).toBe(false)
    expect(absoluteEscape.error).toContain('Path must stay inside the workspace root')
    expect(existsSync(outsideFile)).toBe(false)
  })
})
