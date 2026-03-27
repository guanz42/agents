export interface CliRenderers {
  info(message: string): void
  error(message: string): void
}

export interface CliOutput {
  log(message: string): void
  error(message: string): void
}

export function createCliRenderers(output: CliOutput = console): CliRenderers {
  return {
    info(message: string) {
      output.log(message)
    },
    error(message: string) {
      output.error(message)
    }
  }
}
