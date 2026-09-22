// @vitest-environment node
// Reproductions for doc #83. Hocuspocus/Yjs are real; SQL is a deterministic
// CAS boundary model. These are not PostgreSQL integration tests.
import { Hocuspocus, type Hocuspocus as Server } from '@hocuspocus/server'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { applyContentBinary, liveDocumentFingerprint, serializeYdocToJsonString } from '../src/hocuspocus/restore.js'

const servers: Server[] = []
const providers: HocuspocusProvider[] = []
afterEach(async () => {
  while (providers.length) providers.pop()!.destroy()
  while (servers.length) await servers.pop()!.destroy()
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
function paragraphDoc(text: string) {
  const doc = new Y.Doc()
  const p = new Y.XmlElement('paragraph')
  const t = new Y.XmlText()
  t.insert(0, text)
  p.insert(0, [t])
  doc.getXmlFragment('default').insert(0, [p])
  return doc
}
function text(doc: Y.Doc) {
  return doc.getXmlFragment('default').toString()
}
function payload(value: string) {
  return Buffer.from(Y.encodeStateAsUpdate(paragraphDoc(value))).toString('base64')
}
function append(doc: Y.Doc, value: string) {
  const p = doc.getXmlFragment('default').get(0) as Y.XmlElement
  const t = p.get(0) as Y.XmlText
  t.insert(t.length, value)
}
async function until(predicate: () => boolean) {
  const end = Date.now() + 3000
  while (!predicate()) {
    if (Date.now() > end) throw new Error('sync timed out')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
async function connect(server: Server, name: string) {
  const doc = new Y.Doc()
  const provider = new HocuspocusProvider({
    url: server.webSocketURL,
    name,
    document: doc,
    token: 'test',
    broadcast: false,
    quiet: true,
  })
  providers.push(provider)
  await until(() => provider.synced)
  return doc
}

describe('independent CAS and live Y.Doc race regressions', () => {
  it('does not silently discard a WebSocket edit accepted during PUT persistence', async () => {
    const server = new Hocuspocus({
      port: 0,
      quiet: true,
      unloadImmediately: false,
      debounce: 2000,
      maxDebounce: 10000,
      onAuthenticate: async () => ({ userId: 'writer' }),
    })
    servers.push(server)
    await server.listen(0)
    const a = await connect(server, 'race')
    const b = await connect(server, 'race')
    Y.applyUpdate(a, Y.encodeStateAsUpdate(paragraphDoc('base')))
    await until(() => text(b).includes('base'))
    const live = server.documents.get('race')!
    const entered = deferred<void>()
    const release = deferred<void>()
    const baseVersion = '2026-01-01T00:00:00.000Z'
    let dbVersion = baseVersion
    let dbContent = serializeYdocToJsonString(live)
    const replacement = applyContentBinary(
      'race',
      payload('put-body'),
      {
        getActiveDocument: () => live,
        persistRestoredDocument: async (_id, _binary, content, expected, expectedLive) => {
          entered.resolve()
          await release.promise
          if (expected !== dbVersion) return 0
          if (expectedLive !== undefined && liveDocumentFingerprint(live) !== expectedLive) return 0
          dbVersion = '2026-01-01T00:00:00.001Z'
          dbContent = content
          return 1
        },
      },
      baseVersion
    )
    await entered.promise
    append(a, '-live-edit')
    await until(() => text(live).includes('-live-edit') && text(b).includes('-live-edit'))
    release.resolve()
    await expect(replacement).rejects.toThrow('version_conflict')
    expect(text(b)).toContain('-live-edit')
    expect(text(live)).toContain('-live-edit')
    expect(text(b)).not.toContain('put-body')
    expect(dbContent).not.toContain('put-body')
  })

  it('keeps the live room consistent with the last committed concurrent PUT', async () => {
    const live = paragraphDoc('base')
    const committedA = deferred<void>()
    const releaseA = deferred<void>()
    let dbVersion = '2026-01-01T00:00:00.000Z'
    let dbContent = serializeYdocToJsonString(live)
    const deps = {
      getActiveDocument: () => live,
      persistRestoredDocument: async (_id: string, _binary: Uint8Array, content: string, expected?: string) => {
        if (expected !== dbVersion) return 0
        dbContent = content
        if (content.includes('first-put')) {
          dbVersion = '2026-01-01T00:00:00.001Z'
          committedA.resolve()
          await releaseA.promise
        } else {
          dbVersion = '2026-01-01T00:00:00.002Z'
        }
        return 1
      },
    }
    const a = applyContentBinary('two-puts', payload('first-put'), deps, dbVersion)
    await committedA.promise
    const b = applyContentBinary('two-puts', payload('second-put'), deps, dbVersion)
    releaseA.resolve()
    await a
    await b
    expect(text(live)).toContain('second-put')
    expect(serializeYdocToJsonString(live)).toBe(dbContent)
  })
})
