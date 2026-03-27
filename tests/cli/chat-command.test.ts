import { describe, expect, it, vi } from 'vitest'
import { buildProgram } from '../../src/cli/program.js'

describe('agent chat command', () => {
  it('invokes the chat action handler via parseAsync', async () => {
    const handlers = {
      chat: vi.fn(),
      run: vi.fn(),
      resume: vi.fn(),
      history: vi.fn()
    }

    const program = buildProgram(handlers)
    await program.parseAsync(['node', 'agent', 'chat'])

    expect(handlers.chat).toHaveBeenCalledTimes(1)
    expect(handlers.run).not.toHaveBeenCalled()
    expect(handlers.resume).not.toHaveBeenCalled()
    expect(handlers.history).not.toHaveBeenCalled()
  })

  it('keeps the approved command surface limited to four commands', () => {
    const program = buildProgram()
    const commandNames = program.commands.map((command) => command.name()).sort()

    expect(commandNames).toEqual(['chat', 'history', 'resume', 'run'])
  })
})
