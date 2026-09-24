/** Host Memory list ranking (#86). Without a confirmed task intent, abstain. */

export type HostMemoryAccess = 'OWNER' | 'WRITE' | 'READ' | 'NONE'

export type HostMemoryCandidate = {
  id: string
  access: HostMemoryAccess
}

export type HostMemoryRankResult =
  | {
      status: 'abstain'
      reason: 'missing_task_intent' | 'no_accessible_candidates'
      copy: string
      candidates: string[]
    }
  | { status: 'needs_provider'; candidates: string[] }

export const HOST_MEMORY_ABSTAIN_COPY = {
  missing_task_intent: 'No confirmed task intent; document ranking abstains.',
  no_accessible_candidates: 'No accessible documents to rank.',
} as const

/** Program filter: NONE must never enter overlay candidates. */
export function filterAccessibleOverlayIds(candidates: readonly HostMemoryCandidate[]): string[] {
  return candidates.filter((candidate) => candidate.access !== 'NONE').map((candidate) => candidate.id)
}

export function rankAccessibleDocuments(
  taskSummary: string | null | undefined,
  candidates: readonly HostMemoryCandidate[]
): HostMemoryRankResult {
  const accessibleIds = filterAccessibleOverlayIds(candidates)
  if (accessibleIds.length === 0) {
    return {
      status: 'abstain',
      reason: 'no_accessible_candidates',
      copy: HOST_MEMORY_ABSTAIN_COPY.no_accessible_candidates,
      candidates: [],
    }
  }
  if (typeof taskSummary !== 'string' || taskSummary.trim() === '') {
    return {
      status: 'abstain',
      reason: 'missing_task_intent',
      copy: HOST_MEMORY_ABSTAIN_COPY.missing_task_intent,
      candidates: [],
    }
  }
  const payload = accessibleIds.map((id) => ({ id }))
  for (const item of payload) assertMetadataOnlyAdvicePayload(item)
  return { status: 'needs_provider', candidates: accessibleIds }
}

export function assertMetadataOnlyAdvicePayload(payload: Record<string, unknown>): void {
  const forbidden = ['content', 'body', 'text', 'yDoc', 'tiptap']
  const extra = Object.keys(payload).filter((key) => forbidden.includes(key))
  if (extra.length > 0) {
    throw new Error(`host-memory advice payload has forbidden keys: ${extra.sort().join(',')}`)
  }
}

/** Default off. Empty / missing / "0" / "false" stay off. Prefers DOC_LAYA_ENABLED. */
export function hostMemoryLayaEnabled(env: NodeJS.Dict<string> = process.env): boolean {
  const raw = Object.prototype.hasOwnProperty.call(env, 'DOC_LAYA_ENABLED') ? env.DOC_LAYA_ENABLED : env.DOC_JEV_ENABLED
  const value = raw?.trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}

/** @deprecated Use hostMemoryLayaEnabled. */
export const hostMemoryJevEnabled = hostMemoryLayaEnabled

export type HostMemoryAsk = (payload: Record<string, unknown>) => Promise<unknown>

/** Live path: missing taskSummary or flag-off never calls Laya. */
export async function requestHostMemoryAdvice(
  taskSummary: string | null | undefined,
  candidates: readonly HostMemoryCandidate[],
  deps: { env?: NodeJS.Dict<string>; ask?: HostMemoryAsk } = {}
): Promise<{ ranking: HostMemoryRankResult; called: boolean }> {
  const ranking = rankAccessibleDocuments(taskSummary, candidates)
  if (ranking.status === 'abstain') return { ranking, called: false }
  if (!hostMemoryLayaEnabled(deps.env ?? process.env)) return { ranking, called: false }
  const payload: Record<string, unknown> = { ids: ranking.candidates }
  assertMetadataOnlyAdvicePayload(payload)
  if (!deps.ask) return { ranking, called: false }
  await deps.ask(payload)
  return { ranking, called: true }
}
