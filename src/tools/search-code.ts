import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { ToolDefinition } from './registry.js'

const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'coverage'])
const MAX_FILE_BYTES = 128 * 1024

export interface SearchCodeInput {
  query: string
}

export interface SearchCodeMatch {
  path: string
  line: number
  preview: string
}

export interface SearchCodeOutput {
  ok: boolean
  query: string
  matches: SearchCodeMatch[]
  error?: string
}

async function collectFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name)

    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue
      }

      files.push(...(await collectFiles(absolutePath)))
      continue
    }

    if (entry.isFile()) {
      files.push(absolutePath)
    }
  }

  return files
}

function isLikelyBinary(content: Buffer): boolean {
  return content.includes(0)
}

function findMatches(content: string, filePath: string, query: string): SearchCodeMatch[] {
  const lines = content.split(/\r?\n/)
  const matches: SearchCodeMatch[] = []

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes(query)) {
      matches.push({
        path: filePath,
        line: i + 1,
        preview: lines[i]
      })
    }
  }

  return matches
}

export function createSearchCodeTool(workspaceRoot: string): ToolDefinition<SearchCodeInput, SearchCodeOutput> {
  return {
    name: 'search_code',
    description: 'Search text across files in the workspace',
    schema: null,
    async execute(input: SearchCodeInput): Promise<SearchCodeOutput> {
      try {
        const files = await collectFiles(path.resolve(workspaceRoot))
        const matches: SearchCodeMatch[] = []

        for (const file of files) {
          const fileStats = await stat(file)

          if (fileStats.size > MAX_FILE_BYTES) {
            continue
          }

          const content = await readFile(file)

          if (isLikelyBinary(content)) {
            continue
          }

          matches.push(...findMatches(content.toString('utf8'), file, input.query))
        }

        return {
          ok: true,
          query: input.query,
          matches
        }
      } catch (error) {
        return {
          ok: false,
          query: input.query,
          matches: [],
          error: error instanceof Error ? error.message : 'Unknown search error'
        }
      }
    }
  }
}
