import { Database } from '@hocuspocus/extension-database'
import { Logger } from '@hocuspocus/extension-logger'
import {
  Server,
  type afterLoadDocumentPayload,
  type beforeHandleMessagePayload,
  type fetchPayload,
  type onAuthenticatePayload,
  type onDisconnectPayload,
  type onStoreDocumentPayload,
  type storePayload,
} from '@hocuspocus/server'
import { TiptapTransformer } from '@hocuspocus/transformer'
import * as Y from 'yjs'

import { getDocById, updateDocBinary, updateDocJsonStr } from '../db/doc.js'
import { getShareRelationAccess, updateShareRelationNoticeType, type DocumentAccess } from '../db/share-relation.js'
import { decryptToken } from '../lib/token.js'
import { notifyWebDocumentChangeBestEffort } from '../lib/notify-web-document-change.js'
import { removeActiveDocument, setActiveDocument } from './active-docs.js'
import {
  adaptHocuspocusMessage,
  closeUserConnections,
  emitCollaborationAccessEvent,
  enforceActiveConnectionAccess,
} from './access-control.js'
import { basicExts } from './exts.js'

export interface CollaborationContext {
  userId: string
}

export interface AuthenticationDeps {
  decryptToken: typeof decryptToken
  getShareRelationAccess: typeof getShareRelationAccess
}

export interface PersistenceDeps {
  getDocById: typeof getDocById
  updateDocBinary: typeof updateDocBinary
}

type AuthenticateData = Pick<onAuthenticatePayload, 'connection' | 'documentName' | 'token'>
type FetchData = Pick<fetchPayload, 'documentName'>
type StoreData = Pick<storePayload, 'documentName' | 'state'>

function contextUserId(context: unknown): string {
  if (context == null || typeof context !== 'object') return ''
  const userId = (context as Record<string, unknown>).userId
  return typeof userId === 'string' ? userId : ''
}

// on store document
export async function onStoreDocument(data: onStoreDocumentPayload): Promise<void> {
  const documentName = data.documentName

  // update doc json content
  const json = TiptapTransformer.fromYdoc(data.document, 'default')
  // console.log('hocuspocus onStoreDocument .... ', data.documentName, json)
  const jsonStr = JSON.stringify(json)
  const rowCount = await updateDocJsonStr(documentName, jsonStr)
  console.log('hocuspocus onStoreDocument updated rowCount: ', rowCount)

  // update share relation notice type to 'UPDATE'
  await updateShareRelationNoticeType(documentName, contextUserId(data.context))
  if (rowCount > 0) await notifyWebDocumentChangeBestEffort(documentName)
}

// on db fetch doc
export async function dbFetch(
  { documentName }: FetchData,
  deps: Pick<PersistenceDeps, 'getDocById'> = { getDocById }
): Promise<Uint8Array | null> {
  // console.log('Fetch db fetch ... ', documentName)
  const res = await deps.getDocById(documentName)
  if (res == null) return null
  if (res.contentBinary) return res.contentBinary // return binary content if exists
  if (res.content == null) return null
  try {
    // console.log('hocuspocus db fetch res.content ...', res.content)
    // console.log('basicExts....', basicExts)
    const bytes = TiptapTransformer.toYdoc(JSON.parse(res.content), 'default', basicExts) // JSON to Yjs doc
    // console.log('hocuspocus db fetch bytes ...', bytes)
    const state = Y.encodeStateAsUpdate(bytes) // Yjs doc to binary
    // console.log('hocuspocus db fetch state ...... ', state)
    return state
  } catch (err) {
    console.log('hocuspocus transform toYdoc error ...', err)
  }
  return null
}

// on db store doc
export async function dbStore(
  { documentName, state }: StoreData,
  deps: Pick<PersistenceDeps, 'updateDocBinary'> = { updateDocBinary }
): Promise<void> {
  // console.log('hocuspocus db store ... ', documentName, state)
  const rowContent = await deps.updateDocBinary(documentName, state)
  console.log('hocuspocus db store updated rowCount: ', rowContent)
}

// on authenticate
export async function onAuthenticate(
  data: AuthenticateData,
  deps: AuthenticationDeps = { decryptToken, getShareRelationAccess }
): Promise<CollaborationContext> {
  const { documentName, token } = data
  if (token == null || !token) throw new Error('Token is required')

  const info = deps.decryptToken(token)
  if (info == null) throw new Error('Token is invalid or expired')
  // console.log('hocuspocus onAuthenticate info ... ', info)

  const access = await deps.getShareRelationAccess(documentName, info.userId)
  console.log('hocuspocus onAuthenticate access ... ', access)
  if (access == null) throw new Error('You do not have access to this document')
  if (access === 'READ') {
    data.connection.readOnly = true
  }

  return {
    userId: info.userId,
  }
}

// Recheck persisted authorization before every message from an established connection. This
// closes the notification-failure window after a share is revoked or a document is deleted.
export async function beforeHandleMessage(data: beforeHandleMessagePayload): Promise<DocumentAccess> {
  return enforceActiveConnectionAccess(adaptHocuspocusMessage(data), {
    getShareRelationAccess,
    emitAccessEvent: emitCollaborationAccessEvent,
  })
}

// 在文档加载完成后登记当前活动房间的 Y.Doc。
export async function afterLoadDocument(data: afterLoadDocumentPayload): Promise<void> {
  setActiveDocument(data.documentName, data.document)
}

// 在最后一个连接断开后清理对应的活动房间映射。
export async function onDisconnect(data: onDisconnectPayload): Promise<void> {
  if (data.clientsCount === 0) {
    removeActiveDocument(data.documentName)
  }
}

export const hocuspocusServer = Server.configure({
  onAuthenticate,
  beforeHandleMessage,
  onStoreDocument,
  afterLoadDocument,
  onDisconnect,
  extensions: [
    new Logger(),
    new Database({
      fetch: dbFetch, // fetch doc content from db
      store: dbStore, // store doc contentBinary to db
    }),
  ],
})

export function revokeActiveAccess(docId: string, userId: string): number {
  return closeUserConnections(hocuspocusServer, docId, userId, {
    emitAccessEvent: emitCollaborationAccessEvent,
  })
}
