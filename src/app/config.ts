import path from 'node:path'
import type { ProviderName } from '../providers/types.js'

export interface AppConfig {
  provider: ProviderName
  model: string
  sessionDir: string
}

export function loadConfig(input: Partial<AppConfig>): AppConfig {
  return {
    provider: input.provider ?? 'openai',
    model: input.model ?? 'gpt-4.1',
    sessionDir: input.sessionDir ?? path.resolve(process.cwd(), 'sessions')
  }
}
