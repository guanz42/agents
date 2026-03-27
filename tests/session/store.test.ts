import { mkdtempSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSessionStore, SessionStoreError } from '../../src/session/store.js'

describe('session store', () => {
  it('writes a session event log to disk', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'agent-session-'))
    const store = createSessionStore(root)
    const session = await store.startSession({ task: 'demo task' })

    await store.appendEvent(session.id, { type: 'user_task', payload: { task: 'demo task' } })

    const saved = await store.readSession(session.id)

    expect(saved.id).toBe(session.id)
    expect(saved.task).toBe('demo task')
    expect(saved.status).toBe('running')
    expect(saved.createdAt).toEqual(expect.any(String))
    expect(saved.events).toHaveLength(1)
    expect(saved.events[0]).toMatchObject({
      type: 'user_task',
      payload: { task: 'demo task' }
    })
    expect(saved.events[0].timestamp).toEqual(expect.any(String))
  })

  it('keeps all events when append calls overlap', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'agent-session-'))
    const store = createSessionStore(root)
    const session = await store.startSession({ task: 'demo task' })

    await Promise.all([
      store.appendEvent(session.id, { type: 'user_task', payload: { step: 1 } }),
      store.appendEvent(session.id, { type: 'agent_message', payload: { step: 2 } })
    ])

    const saved = await store.readSession(session.id)
    expect(saved.events).toHaveLength(2)
    expect(saved.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['user_task', 'agent_message'])
    )
    expect(saved.events[0].timestamp).toEqual(expect.any(String))
    expect(saved.events[1].timestamp).toEqual(expect.any(String))
  })

  it('throws a typed error for invalid persisted JSON', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'agent-session-'))
    const store = createSessionStore(root)
    const badId = 'bad-session'

    await writeFile(path.join(root, `${badId}.json`), '{not-valid-json', 'utf8')

    await expect(store.readSession(badId)).rejects.toBeInstanceOf(SessionStoreError)
    await expect(store.readSession(badId)).rejects.toMatchObject({
      name: 'SessionStoreError',
      code: 'INVALID_SESSION_JSON'
    })
  })
})
