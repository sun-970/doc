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

export type OverlayAbstain = { status: 'abstain'; reason: string }
export type OverlaySuggestion<T> = { status: 'suggest'; value: T }

/** #85: sibling attach suggestion. Overlay click is not PUT; persist owner unchanged. */
export function versionAttachAdvice(input: { flagOn: boolean; previousVersionId?: string | null }): (
  OverlayAbstain | OverlaySuggestion<'include_previous' | 'skip'>
) & {
  persistUnchanged: true
  clickIsPut: false
  canSkipCollabPersist: false
} {
  const gates = { persistUnchanged: true as const, clickIsPut: false as const, canSkipCollabPersist: false as const }
  if (!input.flagOn) return { status: 'abstain', reason: 'flag_off', ...gates }
  if (!input.previousVersionId) return { status: 'abstain', reason: 'no_previous', ...gates }
  return { status: 'suggest', value: 'include_previous', ...gates }
}

export function applyVersionAttachSuggestion(): { unsentFlag: 'include_previous'; putCalled: false } {
  return { unsentFlag: 'include_previous', putCalled: false }
}

/** #87: omitted slice vs versions/restore. omitted=0 never calls Laya. */
export function omittedSliceAdvice(input: {
  omittedBytes: number
  versionCount: number
  optInFragmentContract: boolean
}): (OverlayAbstain | OverlaySuggestion<'keep_slice' | 'open_versions' | 'restore'>) & {
  calledLaya: boolean
  canPatch: false
} {
  if (input.omittedBytes === 0) {
    return { status: 'abstain', reason: 'omitted_zero', calledLaya: false, canPatch: false }
  }
  if (!input.optInFragmentContract) {
    return { status: 'abstain', reason: 'no_stale_meaning_without_opt_in', calledLaya: false, canPatch: false }
  }
  void input.versionCount
  return { status: 'suggest', value: 'open_versions', calledLaya: true, canPatch: false }
}

/** #88: card open suggestion is GET only and never implies WRITE/OWNER. */
export function documentCardOpenAdvice(input: {
  selectedId: string
  candidateId: string
  candidateAccess: HostMemoryAccess
}): (OverlayAbstain | OverlaySuggestion<string>) & { clickAction: 'GET'; impliesWrite: false } {
  const gates = { clickAction: 'GET' as const, impliesWrite: false as const }
  if (input.candidateAccess === 'NONE') return { status: 'abstain', reason: 'not_readable', ...gates }
  if (input.candidateId === input.selectedId) return { status: 'abstain', reason: 'already_selected', ...gates }
  return { status: 'suggest', value: input.candidateId, ...gates }
}

/** #89: share/leave handoff cannot enlarge grants by itself. */
export function shareHandoffAdvice(input: {
  currentAccess: HostMemoryAccess
  suggestedAccess: HostMemoryAccess
}): (OverlayAbstain | OverlaySuggestion<HostMemoryAccess>) & { canGrantWriteWithoutShareApi: false } {
  const gates = { canGrantWriteWithoutShareApi: false as const }
  if (input.currentAccess === 'NONE') return { status: 'abstain', reason: 'illegal_none', ...gates }
  if (input.suggestedAccess === 'WRITE' && input.currentAccess === 'READ') {
    return { status: 'abstain', reason: 'cannot_enlarge_without_share_api', ...gates }
  }
  if (input.suggestedAccess === 'OWNER' && input.currentAccess !== 'OWNER') {
    return { status: 'abstain', reason: 'cannot_enlarge_without_share_api', ...gates }
  }
  return { status: 'suggest', value: input.suggestedAccess, ...gates }
}

/** #90: remember/correct opens a new version; never in-place rewrite. */
export function rememberCorrectAdvice(input: { taskSummary?: string | null }): (
  OverlayAbstain | OverlaySuggestion<'create_version_label' | 'restore_previous'>
) & {
  inPlaceRewrite: false
  restoreUsesExistingRoute: true
} {
  const gates = { inPlaceRewrite: false as const, restoreUsesExistingRoute: true as const }
  if (!input.taskSummary?.trim()) return { status: 'abstain', reason: 'missing_task_intent', ...gates }
  return { status: 'suggest', value: 'create_version_label', ...gates }
}

/** #91: pin/forget on metadata. Failed delete keeps the row. */
export function pinForgetAdvice(input: { deleteSucceeded: boolean }): {
  overlay: OverlaySuggestion<'pin' | 'request_delete'>
  rowRemains: boolean
  errorVisible: boolean
  accessUnchanged: true
} {
  return {
    overlay: { status: 'suggest', value: input.deleteSucceeded ? 'pin' : 'request_delete' },
    rowRemains: !input.deleteSucceeded,
    errorVisible: !input.deleteSucceeded,
    accessUnchanged: true,
  }
}

export type HostPreflightStatus = 'covered' | 'needs_more' | 'undetermined'

/** #92: conflicting or dangling selected docs stay undetermined; never overall pass. */
export function hostDeliveryPreflight(input: {
  selectedIds: string[]
  versions: Record<string, string[]>
  danglingIds: string[]
  access: Record<string, HostMemoryAccess>
}): { status: HostPreflightStatus; overallPass: false; canMarkAccepted: false } {
  const gates = { overallPass: false as const, canMarkAccepted: false as const }
  if (input.danglingIds.length > 0) return { status: 'undetermined', ...gates }
  for (const id of input.selectedIds) {
    if ((input.access[id] ?? 'NONE') === 'NONE') return { status: 'undetermined', ...gates }
    if ((input.versions[id] ?? []).length > 1) return { status: 'undetermined', ...gates }
  }
  if (input.selectedIds.length === 0) return { status: 'needs_more', ...gates }
  return { status: 'undetermined', ...gates }
}

export function outboundHostPreflightJson(
  selectedIds: readonly string[],
  materials: Record<string, unknown>
): Record<string, unknown> {
  const outbound: Record<string, unknown> = {}
  for (const id of selectedIds) {
    if (Object.prototype.hasOwnProperty.call(materials, id)) outbound[id] = materials[id]
  }
  return outbound
}

/** #93: known NONE omit is deterministic — do not call Laya; cannot mutate export bytes. */
export function exportOmitAdvice(input: {
  omitReason?: 'NONE' | 'unknown'
}): OverlayAbstain | OverlaySuggestion<'open_share' | 'get_other'> {
  if (input.omitReason === 'NONE') return { status: 'abstain', reason: 'known_none_no_jev' }
  return { status: 'suggest', value: 'open_share' }
}

export function applyExportOmitSuggestion(): { mutatesExportBytes: false; silentGrant: false } {
  return { mutatesExportBytes: false, silentGrant: false }
}
