// @vitest-environment node

import { Hocuspocus, type Hocuspocus as HocuspocusServer } from '@hocuspocus/server'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

import {
  applyContentBinary,
  createTargetYdocFromBinary,
  restoreActiveDocument,
  serializeYdocToJsonString,
} from '../src/hocuspocus/restore.js'

const providers: HocuspocusProvider[] = []
const servers: HocuspocusServer[] = []

function waitFor(check: () => boolean, message: string, timeout = 4_000): Promise<void> {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (check()) return resolve()
      if (Date.now() - startedAt >= timeout) return reject(new Error(`Timed out: ${message}`))
      setTimeout(poll, 10)
    }
    poll()
  })
}

afterEach(async () => {
  while (providers.length > 0) providers.pop()?.destroy()
  while (servers.length > 0) await servers.pop()?.destroy()
})

function paragraphDoc(text: string): Y.Doc {
  const doc = new Y.Doc()
  const paragraph = new Y.XmlElement('paragraph')
  const content = new Y.XmlText()
  content.insert(0, text)
  paragraph.insert(0, [content])
  doc.getXmlFragment('default').insert(0, [paragraph])
  return doc
}

function paragraphText(doc: Y.Doc): Y.XmlText {
  const paragraph = doc.getXmlFragment('default').get(0)
  if (!(paragraph instanceof Y.XmlElement)) throw new Error('paragraph unavailable')
  const text = paragraph.get(0)
  if (!(text instanceof Y.XmlText)) throw new Error('paragraph text unavailable')
  return text
}

function createProvider(server: HocuspocusServer, name: string, document: Y.Doc): HocuspocusProvider {
  const provider = new HocuspocusProvider({
    url: server.webSocketURL,
    name,
    document,
    token: 'writer',
    broadcast: false,
    quiet: true,
  })
  providers.push(provider)
  return provider
}

describe('multi-client collaboration recovery', () => {
  it('converges concurrent WebSocket clients and broadcasts one restored active-room result', async () => {
    const server = new Hocuspocus({
      port: 0,
      quiet: true,
      unloadImmediately: false,
      onAuthenticate: async () => ({ userId: 'writer' }),
    })
    await server.listen(0)
    servers.push(server)
    const clientOne = new Y.Doc()
    const clientTwo = new Y.Doc()
    const providerOne = createProvider(server, 'doc-1', clientOne)
    const providerTwo = createProvider(server, 'doc-1', clientTwo)

    await waitFor(() => providerOne.synced && providerTwo.synced, 'both clients to sync')
    const initial = paragraphDoc('current')
    Y.applyUpdate(clientOne, Y.encodeStateAsUpdate(initial))
    await waitFor(() => clientTwo.getXmlFragment('default').toString().includes('current'), 'initial state to sync')

    paragraphText(clientOne).insert(7, '-one')
    paragraphText(clientTwo).insert(7, '-two')
    await waitFor(
      () =>
        clientOne.getXmlFragment('default').toString() === clientTwo.getXmlFragment('default').toString() &&
        clientOne.getXmlFragment('default').toString().includes('one') &&
        clientOne.getXmlFragment('default').toString().includes('two'),
      'concurrent edits to converge'
    )
    expect(clientOne.getXmlFragment('default').toString()).toBe(clientTwo.getXmlFragment('default').toString())

    const active = server.documents.get('doc-1')
    if (active == null) throw new Error('active document unavailable')
    const restoreEvents: string[] = []
    active.on('update', () => restoreEvents.push('broadcast'))
    const target = paragraphDoc('restored')
    await restoreActiveDocument('doc-1', Buffer.from(Y.encodeStateAsUpdate(target)).toString('base64'), {
      getActiveDocument: () => active,
      persistRestoredDocument: async () => {
        restoreEvents.push('persist')
        return 1
      },
    })

    await waitFor(
      () =>
        clientOne.getXmlFragment('default').toString() === active.getXmlFragment('default').toString() &&
        clientTwo.getXmlFragment('default').toString() === active.getXmlFragment('default').toString(),
      'restored active-room state to reach both clients'
    )
    expect(active.getXmlFragment('default').toString()).toContain('restored')
    expect(restoreEvents[0]).toBe('persist')
    expect(clientOne.getXmlFragment('default').toString()).toBe(active.getXmlFragment('default').toString())
    expect(clientTwo.getXmlFragment('default').toString()).toBe(active.getXmlFragment('default').toString())
  })

  it('persists the exact restored state exposed to all replicas', async () => {
    const active = paragraphDoc('current')
    const client = new Y.Doc()
    Y.applyUpdate(client, Y.encodeStateAsUpdate(active))
    active.on('update', (update: Uint8Array) => Y.applyUpdate(client, update, 'server'))
    const target = paragraphDoc('restored')
    const targetBinary = Y.encodeStateAsUpdate(target)
    const persistRestoredDocument = vi.fn(async () => 1)

    const result = await restoreActiveDocument('doc-1', Buffer.from(targetBinary).toString('base64'), {
      getActiveDocument: () => active,
      persistRestoredDocument,
    })

    expect(client.getXmlFragment('default').toString()).toBe(active.getXmlFragment('default').toString())
    expect(Buffer.from(result.contentBinary)).toEqual(Buffer.from(targetBinary))
    expect(persistRestoredDocument).toHaveBeenCalledWith(
      'doc-1',
      result.contentBinary,
      result.content,
      undefined,
      expect.any(String)
    )
    const reloadedPersistedTarget = createTargetYdocFromBinary(result.contentBinary)
    expect(reloadedPersistedTarget.getXmlFragment('default').toString()).toBe(
      active.getXmlFragment('default').toString()
    )
    expect(result.content).toBe(serializeYdocToJsonString(reloadedPersistedTarget))
  })

  it('leaves the active room and connected replica unchanged when target persistence fails', async () => {
    const active = paragraphDoc('current')
    const client = new Y.Doc()
    Y.applyUpdate(client, Y.encodeStateAsUpdate(active))
    const activeBefore = Y.encodeStateAsUpdate(active)
    const clientBefore = Y.encodeStateAsUpdate(client)
    const updateObserver = vi.fn()
    active.on('update', updateObserver)
    active.on('update', (update: Uint8Array) => Y.applyUpdate(client, update, 'server'))
    const target = paragraphDoc('restored')

    await expect(
      restoreActiveDocument('doc-1', Buffer.from(Y.encodeStateAsUpdate(target)).toString('base64'), {
        getActiveDocument: () => active,
        persistRestoredDocument: async () => {
          throw new Error('database unavailable')
        },
      })
    ).rejects.toThrow('database unavailable')

    expect(Buffer.from(Y.encodeStateAsUpdate(active))).toEqual(Buffer.from(activeBefore))
    expect(Buffer.from(Y.encodeStateAsUpdate(client))).toEqual(Buffer.from(clientBefore))
    expect(active.getXmlFragment('default').toString()).toContain('current')
    expect(updateObserver).not.toHaveBeenCalled()
  })

  it('idle apply persists through the collab kernel without requiring a live room', async () => {
    const target = paragraphDoc('idle-body')
    const persistRestoredDocument = vi.fn(async () => 1)
    const result = await applyContentBinary('doc-idle', Buffer.from(Y.encodeStateAsUpdate(target)).toString('base64'), {
      getActiveDocument: () => null,
      persistRestoredDocument,
    })
    expect(result.appliedToRoom).toBe(false)
    expect(persistRestoredDocument).toHaveBeenCalledWith(
      'doc-idle',
      result.contentBinary,
      result.content,
      undefined,
      ''
    )
  })

  it('idle apply also replaces a room that appears after persist', async () => {
    const active = paragraphDoc('stale')
    const target = paragraphDoc('fresh')
    let persistDone = false
    const result = await applyContentBinary('doc-race', Buffer.from(Y.encodeStateAsUpdate(target)).toString('base64'), {
      getActiveDocument: () => (persistDone ? active : null),
      persistRestoredDocument: async () => {
        persistDone = true
        return 1
      },
    })
    expect(result.appliedToRoom).toBe(true)
    expect(active.getXmlFragment('default').toString()).toContain('fresh')
  })

  it('refuses persist when expectedUpdatedAt no longer matches the row', async () => {
    const target = paragraphDoc('lost-race')
    await expect(
      applyContentBinary(
        'doc-cas',
        Buffer.from(Y.encodeStateAsUpdate(target)).toString('base64'),
        {
          getActiveDocument: () => null,
          persistRestoredDocument: async () => 0,
        },
        '2026-01-01T00:00:00.000Z'
      )
    ).rejects.toThrow('version_conflict')
  })
})
