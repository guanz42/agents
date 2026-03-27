import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { ToolDefinition } from './registry.js'

export interface ReadFileInput {
  path: string
}

export interface ReadFileOutput {
  ok: boolean
  path: string
  content: string
  error?: string
}

export const readFileSchema = z.object({
  path: z.string().min(1, 'path is required')
})

function assertInsideWorkspace(workspaceRoot: string, targetPath: string): void {
  const relativePath = path.relative(workspaceRoot, targetPath)

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Path must stay inside the workspace root')
  }
}

async function resolveInsideWorkspace(workspaceRoot: string, targetPath: string): Promise<string> {
  const resolvedRoot = await realpath(path.resolve(workspaceRoot))
  const resolvedTarget = path.resolve(resolvedRoot, targetPath)
  assertInsideWorkspace(resolvedRoot, resolvedTarget)

  const realTarget = await realpath(resolvedTarget)
  assertInsideWorkspace(resolvedRoot, realTarget)

  return resolvedTarget
}

function resolveFallbackPath(workspaceRoot: string, targetPath: string): string {
  const resolvedRoot = path.resolve(workspaceRoot)
  const resolvedTarget = path.resolve(resolvedRoot, targetPath)
  const relativePath = path.relative(resolvedRoot, resolvedTarget)

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Path must stay inside the workspace root')
  }

  return resolvedTarget
}

export function createReadFileTool(workspaceRoot: string): ToolDefinition<ReadFileInput, ReadFileOutput> {
  return {
    name: 'read_file',
    description: 'Read a UTF-8 file inside the workspace',
    schema: readFileSchema,
    async execute(input: ReadFileInput): Promise<ReadFileOutput> {
      let targetPath = ''

      try {
        targetPath = resolveFallbackPath(workspaceRoot, input.path)
        targetPath = await resolveInsideWorkspace(workspaceRoot, input.path)
        const content = await readFile(targetPath, 'utf8')
        return {
          ok: true,
          path: targetPath,
          content
        }
      } catch (error) {
        return {
          ok: false,
          path: targetPath,
          content: '',
          error: error instanceof Error ? error.message : 'Unknown read error'
        }
      }
    }
  }
}
