export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string
  description: string
  schema: unknown
  execute(input: TInput): Promise<TOutput>
}

export function createToolRegistry(tools: ToolDefinition[]) {
  const entries = new Map<string, ToolDefinition>()

  for (const tool of tools) {
    if (entries.has(tool.name)) {
      throw new Error(`Duplicate tool name: ${tool.name}`)
    }

    entries.set(tool.name, tool)
  }

  return {
    get(name: string): ToolDefinition | undefined {
      return entries.get(name)
    },
    list(): ToolDefinition[] {
      return Array.from(entries.values())
    }
  }
}
