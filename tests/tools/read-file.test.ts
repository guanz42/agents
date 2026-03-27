import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createReadFileTool } from '../../src/tools/read-file.js'

describe('read_file tool', () => {
  it('reads a file inside the workspace', async () => {
    const workspaceRoot = path.join(process.cwd(), 'tests/fixtures/sample-repo')
    const tool = createReadFileTool(workspaceRoot)
    const filePath = path.join(workspaceRoot, 'README.md')

    const result = await tool.execute({ path: 'README.md' })

    expect(result.ok).toBe(true)
    expect(result.path).toBe(filePath)
    expect(result.content).toContain('sample repo')
  })

  it('rejects reading through a symlink that escapes the workspace root', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'tool-read-workspace-'))
    const outsideRoot = mkdtempSync(path.join(tmpdir(), 'tool-read-outside-'))
    const outsideFile = path.join(outsideRoot, 'secret.txt')
    writeFileSync(outsideFile, 'outside', 'utf8')

    symlinkSync(outsideFile, path.join(workspaceRoot, 'escape.txt'))

    const tool = createReadFileTool(workspaceRoot)

    await expect(tool.execute({ path: 'escape.txt' })).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('Path must stay inside the workspace root')
    })
  })

  it('returns structured failure for direct escape paths', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'tool-read-workspace-'))
    const outsideRoot = mkdtempSync(path.join(tmpdir(), 'tool-read-outside-'))
    const outsideFile = path.join(outsideRoot, 'outside.txt')
    const tool = createReadFileTool(workspaceRoot)

    await expect(tool.execute({ path: '../outside.txt' })).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('Path must stay inside the workspace root')
    })

    await expect(tool.execute({ path: outsideFile })).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('Path must stay inside the workspace root')
    })
  })
})
