import { describe, expect, it, vi } from 'vitest'
import { buildProgram } from '../../src/cli/program.js'

describe('agent resume command', () => {
  it('passes the parsed <sessionId> value to the resume action handler', async () => {
    const handlers = {
      chat: vi.fn(),
      run: vi.fn(),
      resume: vi.fn(),
      history: vi.fn()
    }

    const program = buildProgram(handlers)
    await program.parseAsync(['node', 'agent', 'resume', 'session-123'])

    expect(handlers.resume).toHaveBeenCalledTimes(1)
    expect(handlers.resume).toHaveBeenCalledWith('session-123')
    expect(handlers.chat).not.toHaveBeenCalled()
    expect(handlers.run).not.toHaveBeenCalled()
    expect(handlers.history).not.toHaveBeenCalled()
  })
})
