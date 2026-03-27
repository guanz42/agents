import crypto from 'node:crypto'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SessionEvent, SessionRecord } from './types.js'

const SESSION_EVENT_TYPES = new Set<SessionEvent['type']>([
  'user_task',
  'user_message',
  'agent_message',
  'tool_call',
  'tool_result',
  'delegation',
  'final_result'
])

type SessionStoreErrorCode = 'INVALID_SESSION_JSON' | 'INVALID_SESSION_RECORD'

export class SessionStoreError extends Error {
  code: SessionStoreErrorCode

  constructor(code: SessionStoreErrorCode, message: string) {
    super(message)
    this.name = 'SessionStoreError'
    this.code = code
  }
}

function getSessionPath(rootDir: string, sessionId: string): string {
  return path.join(rootDir, `${sessionId}.json`)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isValidStatus(value: unknown): value is SessionRecord['status'] {
  return value === 'running' || value === 'completed' || value === 'failed'
}

function assertValidEvent(value: unknown, context: string): asserts value is SessionEvent {
  if (!isObject(value)) {
    throw new SessionStoreError('INVALID_SESSION_RECORD', `${context} must be an object`)
  }

  if (!SESSION_EVENT_TYPES.has(value.type as SessionEvent['type'])) {
    throw new SessionStoreError('INVALID_SESSION_RECORD', `${context}.type is invalid`)
  }

  if (!isObject(value.payload)) {
    throw new SessionStoreError('INVALID_SESSION_RECORD', `${context}.payload must be an object`)
  }

  if (value.timestamp !== undefined && typeof value.timestamp !== 'string') {
    throw new SessionStoreError('INVALID_SESSION_RECORD', `${context}.timestamp must be a string when present`)
  }
}

function assertValidSessionRecord(value: unknown): asserts value is SessionRecord {
  if (!isObject(value)) {
    throw new SessionStoreError('INVALID_SESSION_RECORD', 'Session record must be an object')
  }

  if (typeof value.id !== 'string') {
    throw new SessionStoreError('INVALID_SESSION_RECORD', 'Session record id must be a string')
  }

  if (typeof value.task !== 'string') {
    throw new SessionStoreError('INVALID_SESSION_RECORD', 'Session record task must be a string')
  }

  if (!isValidStatus(value.status)) {
    throw new SessionStoreError('INVALID_SESSION_RECORD', 'Session record status is invalid')
  }

  if (typeof value.createdAt !== 'string') {
    throw new SessionStoreError('INVALID_SESSION_RECORD', 'Session record createdAt must be a string')
  }

  if (!Array.isArray(value.events)) {
    throw new SessionStoreError('INVALID_SESSION_RECORD', 'Session record events must be an array')
  }

  for (const [index, event] of value.events.entries()) {
    assertValidEvent(event, `Session record events[${index}]`)
  }
}

export function createSessionStore(rootDir: string) {
  const sessionWriteQueue = new Map<string, Promise<void>>()

  function queueBySession<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    const previous = sessionWriteQueue.get(sessionId) ?? Promise.resolve()
    const run = previous.then(operation)
    const completion = run.then(
      () => undefined,
      () => undefined
    )

    sessionWriteQueue.set(sessionId, completion)

    return run.finally(() => {
      if (sessionWriteQueue.get(sessionId) === completion) {
        sessionWriteQueue.delete(sessionId)
      }
    })
  }

  async function persist(record: SessionRecord): Promise<void> {
    await mkdir(rootDir, { recursive: true })
    const filePath = getSessionPath(rootDir, record.id)
    const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`
    await writeFile(tempPath, JSON.stringify(record, null, 2), 'utf8')
    await rename(tempPath, filePath)
  }

  async function readSession(sessionId: string): Promise<SessionRecord> {
    const content = await readFile(getSessionPath(rootDir, sessionId), 'utf8')
    let parsed: unknown

    try {
      parsed = JSON.parse(content)
    } catch {
      throw new SessionStoreError('INVALID_SESSION_JSON', `Session file for ${sessionId} is not valid JSON`)
    }

    assertValidSessionRecord(parsed)
    return parsed
  }

  async function startSession(input: { task: string }): Promise<SessionRecord> {
    const record: SessionRecord = {
      id: crypto.randomUUID(),
      task: input.task,
      status: 'running',
      createdAt: new Date().toISOString(),
      events: []
    }

    await persist(record)
    return record
  }

  async function appendEvent(sessionId: string, event: SessionEvent): Promise<void> {
    await queueBySession(sessionId, async () => {
      const record = await readSession(sessionId)
      record.events.push({
        ...event,
        timestamp: new Date().toISOString()
      })
      await persist(record)
    })
  }

  async function updateStatus(sessionId: string, status: SessionRecord['status']): Promise<void> {
    await queueBySession(sessionId, async () => {
      const record = await readSession(sessionId)
      record.status = status
      await persist(record)
    })
  }

  async function listSessions(): Promise<SessionRecord[]> {
    try {
      const entries = await readdir(rootDir, { withFileTypes: true })
      const records = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
          .map(async (entry) => {
            const sessionId = entry.name.slice(0, -'.json'.length)

            try {
              return await readSession(sessionId)
            } catch {
              return null
            }
          })
      )

      return records
        .filter((record): record is SessionRecord => record !== null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    } catch (error) {
      const isMissingDirectory =
        error instanceof Error && 'code' in error && (error as { code?: string }).code === 'ENOENT'

      if (isMissingDirectory) {
        return []
      }

      throw error
    }
  }

  async function getConversationHistory(sessionId: string, maxTurns?: number): Promise<SessionEvent[]> {
    const session = await readSession(sessionId)
    const events = session.events.filter((e) => e.type === 'user_message' || e.type === 'agent_message')

    if (maxTurns !== undefined) {
      return events.slice(-maxTurns * 2)
    }

    return events
  }

  return {
    startSession,
    appendEvent,
    readSession,
    updateStatus,
    listSessions,
    getConversationHistory
  }
}
