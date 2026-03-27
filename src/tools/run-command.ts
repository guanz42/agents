import { execa } from 'execa'
import type { ToolDefinition } from './registry.js'

export interface RunCommandInput {
  command: string
}

export interface RunCommandOutput {
  ok: boolean
  stdout: string
  stderr: string
  exitCode: number
}

export function createRunCommandTool(workspaceRoot: string): ToolDefinition<RunCommandInput, RunCommandOutput> {
  return {
    name: 'run_command',
    description: 'Run a local shell command inside the workspace',
    schema: null,
    async execute(input: RunCommandInput): Promise<RunCommandOutput> {
      try {
        const result = await execa({ shell: true, cwd: workspaceRoot })`${input.command}`

        return {
          ok: true,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode ?? 0
        }
      } catch (error) {
        const failure = error as { stdout?: string; stderr?: string; exitCode?: number }

        return {
          ok: false,
          stdout: failure.stdout ?? '',
          stderr: failure.stderr ?? '',
          exitCode: failure.exitCode ?? 1
        }
      }
    }
  }
}
