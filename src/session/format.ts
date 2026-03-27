import type { SessionRecord } from './types.js'

export function formatSessionSummary(record: SessionRecord): string {
  return `${record.id} | ${record.status} | ${record.task}`
}
