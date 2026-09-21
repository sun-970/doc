import { TiptapTransformer } from '@hocuspocus/transformer'
import * as Y from 'yjs'

import { updateDocBinaryAndJson } from '../db/doc.js'
import { getActiveDocument } from './active-docs.js'

type XmlChild = Y.XmlElement | Y.XmlText | Y.XmlHook
type XmlContainer = Y.XmlElement | Y.XmlFragment

function insertXmlChildren(container: XmlContainer, children: XmlChild[]): void {
  // Yjs exposes XmlHook through `toArray()` and supports it at runtime, while the current insert
  // declaration only lists XmlElement and XmlText. Keep the compatibility boundary local.
  const insert = container.insert as unknown as (index: number, content: XmlChild[]) => void
  insert.call(container, 0, children)
}

export interface RestoreActiveDocumentDeps {
  getActiveDocument?: (docId: string) => Y.Doc | null
  persistRestoredDocument?: (docId: string, binary: Uint8Array, jsonStr: string) => Promise<number>
}

export interface RestoredDocument {
  docId: string
  contentBinary: Uint8Array
  content: string
}

// 将 Base64 编码的正文状态还原成 Yjs 二进制数据。
export function decodeBinaryFromBase64(base64: string): Uint8Array {
  if (typeof base64 !== 'string' || base64.trim() === '') {
    throw new Error('contentBinaryBase64 is required')
  }

  return Uint8Array.from(Buffer.from(base64, 'base64'))
}

// 基于二进制状态创建目标版本对应的临时 Y.Doc。
export function createTargetYdocFromBinary(binary: Uint8Array): Y.Doc {
  const ydoc = new Y.Doc()
  Y.applyUpdate(ydoc, binary)
  return ydoc
}

// 将恢复后的 Y.Doc 转成数据库可存储的 JSON 字符串。
export function serializeYdocToJsonString(ydoc: Y.Doc): string {
  const json = TiptapTransformer.fromYdoc(ydoc, 'default')
  return JSON.stringify(json)
}

// 深拷贝 Yjs XML 节点，显式保留 attrs，避免 clone() 丢失 heading/taskItem 等属性。
export function cloneXmlNode(node: XmlChild): XmlChild {
  if (node instanceof Y.XmlElement) {
    const cloned = new Y.XmlElement(node.nodeName)
    Object.entries(node.getAttributes()).forEach(([key, value]) => {
      if (value !== undefined) cloned.setAttribute(key, value)
    })

    const children = node.toArray().map((child) => cloneXmlNode(child))
    if (children.length > 0) {
      insertXmlChildren(cloned, children)
    }

    return cloned
  }

  if (node instanceof Y.XmlText) {
    const cloned = new Y.XmlText()
    Object.entries(node.getAttributes()).forEach(([key, value]) => {
      cloned.setAttribute(key, value)
    })

    const delta = node.toDelta()
    if (delta.length > 0) {
      cloned.applyDelta(delta)
    }

    return cloned
  }
  return node.clone()
}

// 用目标版本正文完整替换当前活动文档的正文内容。
export function replaceDocumentContent(activeDoc: Y.Doc, targetDoc: Y.Doc): void {
  const activeFragment = activeDoc.getXmlFragment('default')
  const targetFragment = targetDoc.getXmlFragment('default')

  activeDoc.transact(() => {
    activeFragment.delete(0, activeFragment.length)
    const clonedNodes = targetFragment.toArray().map((node) => cloneXmlNode(node))
    if (clonedNodes.length > 0) {
      insertXmlChildren(activeFragment, clonedNodes)
    }
  })
}

// 将恢复后的正文二进制和 JSON 镜像一次性持久化到主库。
export async function persistRestoredDocument(docId: string, binary: Uint8Array, jsonStr: string): Promise<number> {
  const rowCount = await updateDocBinaryAndJson(docId, binary, jsonStr)
  if (rowCount <= 0) {
    throw new Error('Document not found')
  }

  return rowCount
}

// 先持久化目标状态，再修改活动房间。持久化失败时不能向任何客户端广播恢复结果。
export async function restoreActiveDocument(
  docId: string,
  contentBinaryBase64: string,
  deps: RestoreActiveDocumentDeps = {}
): Promise<RestoredDocument> {
  const getDocument = deps.getActiveDocument || getActiveDocument
  const activeDoc = getDocument(docId)

  if (!activeDoc) {
    throw new Error('Active document not found')
  }

  return applyContentBinary(docId, contentBinaryBase64, deps)
}

/**
 * Persist JSON+Yjs through the collab kernel (`updateDocBinaryAndJson`).
 * If a live room exists (or appears after persist), also replace the in-memory Y.Doc
 * so an open editor is not left beside a silently overwritten row.
 */
export async function applyContentBinary(
  docId: string,
  contentBinaryBase64: string,
  deps: RestoreActiveDocumentDeps = {}
): Promise<RestoredDocument & { appliedToRoom: boolean }> {
  const getDocument = deps.getActiveDocument || getActiveDocument
  const persistDocument = deps.persistRestoredDocument || persistRestoredDocument

  const binary = decodeBinaryFromBase64(contentBinaryBase64)
  const targetDoc = createTargetYdocFromBinary(binary)
  const targetJsonStr = serializeYdocToJsonString(targetDoc)

  await persistDocument(docId, binary, targetJsonStr)

  const activeDoc = getDocument(docId)
  if (activeDoc) {
    replaceDocumentContent(activeDoc, targetDoc)
  }

  return {
    docId,
    contentBinary: binary,
    content: targetJsonStr,
    appliedToRoom: Boolean(activeDoc),
  }
}
