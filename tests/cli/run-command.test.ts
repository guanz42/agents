import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { OrchestratorResult, RunOrchestratorInput } from '../../src/agents/orchestrator.js'
import { runTask } from '../../src/app/bootstrap.js'
import { createSessionStore } from '../../src/session/store.js'

describe('runTask runtime wiring', () => {
  it('returns a session id and persists start/final events for a successful run', async () => {
    const sessionDir = mkdtempSync(path.join(tmpdir(), 'agent-run-'))

    const result = await runTask({
      task: 'Inspect the sample repo',
      config: {
        provider: 'anthropic',
        model: 'claude-3-7',
        sessionDir
      },
      orchestratorRunner: vi.fn(async (input: RunOrchestratorInput): Promise<OrchestratorResult> => {
        const readFileTool = input.tools.find((tool) => tool.name === 'read_file')

        if (readFileTool) {
          await readFileTool.execute({ path: 'missing-file.txt' })
        }

        return {
          delegatedAgent: 'research-agent',
          summary: 'delegated summary'
        }
      })
    })

    const store = createSessionStore(sessionDir)
    const saved = await store.readSession(result.sessionId)

    expect(result.sessionId).toBeTruthy()
    expect(result.summary).toBe('delegated summary')
    expect(saved.status).toBe('completed')
    expect(saved.events).toHaveLength(5)
    expect(saved.events[0]).toMatchObject({
      type: 'user_task',
      payload: { task: 'Inspect the sample repo' }
    })
    expect(saved.events[1]).toMatchObject({
      type: 'tool_call',
      payload: {
        tool: 'read_file',
        input: { path: 'missing-file.txt' }
      }
    })
    expect(saved.events[2]).toMatchObject({
      type: 'tool_result',
      payload: {
        tool: 'read_file'
      }
    })
    expect(saved.events[3]).toMatchObject({
      type: 'delegation',
      payload: {
        delegatedAgent: 'research-agent'
      }
    })
    expect(saved.events[4]).toMatchObject({
      type: 'final_result',
      payload: {
        delegatedAgent: 'research-agent',
        summary: 'delegated summary'
      }
    })

    for (const event of saved.events) {
      expect(event.timestamp).toEqual(expect.any(String))
    }
  })

  it('marks the session as failed and logs final_result error payload when orchestration throws', async () => {
    const sessionDir = mkdtempSync(path.join(tmpdir(), 'agent-run-'))

    await expect(
      runTask({
        task: 'Inspect the sample repo',
        config: {
          provider: 'anthropic',
          model: 'claude-3-7',
          sessionDir
        },
        orchestratorRunner: vi.fn(async () => {
          throw new Error('boom')
        })
      })
    ).rejects.toThrow('boom')

    const store = createSessionStore(sessionDir)
    const sessions = await store.listSessions()
    expect(sessions).toHaveLength(1)

    const [saved] = sessions
    expect(saved.status).toBe('failed')
    expect(saved.events).toHaveLength(2)
    expect(saved.events[1]).toMatchObject({
      type: 'final_result',
      payload: { error: 'boom' }
    })
  })
})
