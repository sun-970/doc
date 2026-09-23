/** Host Memory list ranking (#86). Without a confirmed task intent, abstain. */

export type HostMemoryRankResult =
  | { status: 'abstain'; reason: 'missing_task_intent' | 'no_accessible_candidates' }
  | { status: 'needs_provider'; candidates: string[] }

export function rankAccessibleDocuments(
  taskSummary: string | null | undefined,
  accessibleIds: readonly string[],
): HostMemoryRankResult {
  if (accessibleIds.length === 0) {
    return { status: 'abstain', reason: 'no_accessible_candidates' }
  }
  if (typeof taskSummary !== 'string' || taskSummary.trim() === '') {
    return { status: 'abstain', reason: 'missing_task_intent' }
  }
  return { status: 'needs_provider', candidates: [...accessibleIds] }
}

export function assertMetadataOnlyAdvicePayload(payload: Record<string, unknown>): void {
  const forbidden = ['content', 'body', 'text', 'yDoc', 'tiptap']
  const extra = Object.keys(payload).filter((key) => forbidden.includes(key))
  if (extra.length > 0) {
    throw new Error(`host-memory advice payload has forbidden keys: ${extra.sort().join(',')}`)
  }
}
