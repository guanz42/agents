import { Command } from 'commander'

export interface CommandHandlers {
  chat(): Promise<void> | void
  run(task: string): Promise<void> | void
  resume(sessionId: string): Promise<void> | void
  history(): Promise<void> | void
}

function createDefaultHandlers(): CommandHandlers {
  return {
    chat: () => undefined,
    run: () => undefined,
    resume: () => undefined,
    history: () => undefined
  }
}

export function buildProgram(handlers: CommandHandlers = createDefaultHandlers()): Command {
  const program = new Command().name('agent')

  program
    .command('chat')
    .description('Start an interactive agent session')
    .action(async () => {
      await handlers.chat()
    })

  program
    .command('run')
    .argument('<task>')
    .description('Run a coding-agent task')
    .action(async (task: string) => {
      await handlers.run(task)
    })

  program
    .command('resume')
    .argument('<sessionId>')
    .description('Resume a previous session')
    .action(async (sessionId: string) => {
      await handlers.resume(sessionId)
    })

  program
    .command('history')
    .description('List previous sessions')
    .action(async () => {
      await handlers.history()
    })

  return program
}
