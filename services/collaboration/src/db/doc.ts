import type { QueryResultRow } from 'pg'

import { pgClient, reconnect } from './client.js'
import { errorMessage } from '../lib/error.js'
import { sendEmail } from '../lib/mailer.js'
import { extractPlainTextFromJson } from '../lib/tiptap-text-extractor.js'

export interface StoredDocumentRow extends QueryResultRow {
  content: string | null
  contentBinary: Buffer | null
}

export interface MonitorDocumentRow extends QueryResultRow {
  id: string
}

/**
 * Update doc json content
 * @param {string} id doc id
 * @param {string} jsonStr json string
 * @returns {number} updated rowCount
 */
export async function updateDocJsonStr(id: string, jsonStr: string): Promise<number> {
  try {
    const contentSearch = extractPlainTextFromJson(jsonStr)
    const sql = `update "Doc" set content = $1, "contentSearch" = $2, "updatedAt" = $3 where id = $4`
    const values = [jsonStr, contentSearch || null, new Date(), id]
    const result = await pgClient.query(sql, values)
    return result.rowCount ?? 0
  } catch (error) {
    console.error('hocuspocus db updateDocJsonStr error')
    void sendEmail({
      subject: 'hocuspocus db updateDocJsonStr error',
      text: errorMessage(error),
    })
    void reconnect()
    return 0
  }
}

/**
 * Update doc binary content
 * @param {string} id doc id
 * @param {binary} binary doc binary content
 * @returns {number} updated rowCount
 */
export async function updateDocBinary(id: string, binary: Uint8Array): Promise<number> {
  try {
    const sql = `update "Doc" set "contentBinary" = $1 where id = $2`
    const values = [binary, id]
    const result = await pgClient.query(sql, values)
    return result.rowCount ?? 0
  } catch (error) {
    console.error('hocuspocus db updateDocBinary error')
    void sendEmail({
      subject: 'hocuspocus db updateDocBinary error',
      text: errorMessage(error),
    })
    void reconnect()
    return 0
  }
}

/**
 * Update doc binary and json content together
 * @param {string} id doc id
 * @param {binary} binary doc binary content
 * @param {string} jsonStr json string
 * @returns {number} updated rowCount
 */
// 同时更新正文二进制和 JSON 镜像，保证恢复后的状态一致。
export async function updateDocBinaryAndJson(
  id: string,
  binary: Uint8Array,
  jsonStr: string,
  expectedUpdatedAt?: Date
): Promise<number> {
  try {
    const contentSearch = extractPlainTextFromJson(jsonStr)
    const nextUpdatedAt = new Date()
    const sql = expectedUpdatedAt
      ? `update "Doc" set "contentBinary" = $1, content = $2, "contentSearch" = $3, "updatedAt" = $4 where id = $5 and "updatedAt" = $6`
      : `update "Doc" set "contentBinary" = $1, content = $2, "contentSearch" = $3, "updatedAt" = $4 where id = $5`
    const values = expectedUpdatedAt
      ? [binary, jsonStr, contentSearch || null, nextUpdatedAt, id, expectedUpdatedAt]
      : [binary, jsonStr, contentSearch || null, nextUpdatedAt, id]
    const result = await pgClient.query(sql, values)
    return result.rowCount ?? 0
  } catch (error) {
    console.error('hocuspocus db updateDocBinaryAndJson error')
    void sendEmail({
      subject: 'hocuspocus db updateDocBinaryAndJson error',
      text: errorMessage(error),
    })
    void reconnect()
    return 0
  }
}

/**
 * Get doc object by id
 * @param {string} id doc id
 * @returns {object | null} doc object or null
 */
export async function getDocById(id: string): Promise<StoredDocumentRow | null> {
  try {
    const sql = 'select content, "contentBinary" from "Doc" where id = $1'
    const result = await pgClient.query<StoredDocumentRow>(sql, [id])
    return result.rows[0] || null
  } catch (error) {
    console.error('hocuspocus db getDocById error')
    void sendEmail({
      subject: 'hocuspocus db getDocById error',
      text: errorMessage(error),
    })
    void reconnect()
    return null
  }
}

/**
 * select one doc for monitor
 * @returns {object | null} doc object or null
 */
export async function selectOneDocForMonitor(): Promise<MonitorDocumentRow | null> {
  try {
    const sql = `select id from "Doc" limit 1`
    const result = await pgClient.query<MonitorDocumentRow>(sql)
    return result.rows[0] || null
  } catch {
    console.error('hocuspocus db selectOneDocForMonitor error')
    void reconnect()
    return null
  }
}
