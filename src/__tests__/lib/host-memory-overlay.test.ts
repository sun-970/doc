import { describe, expect, it, vi } from 'vitest'
import {
  applyExportOmitSuggestion,
  applyVersionAttachSuggestion,
  assertMetadataOnlyAdvicePayload,
  documentCardOpenAdvice,
  exportOmitAdvice,
  filterAccessibleOverlayIds,
  hostDeliveryPreflight,
  HOST_MEMORY_ABSTAIN_COPY,
  hostMemoryLayaEnabled,
  omittedSliceAdvice,
  outboundHostPreflightJson,
  pinForgetAdvice,
  rankAccessibleDocuments,
  rememberCorrectAdvice,
  requestHostMemoryAdvice,
  shareHandoffAdvice,
  versionAttachAdvice,
} from '@/lib/host-memory-overlay'

describe('host memory overlay ranking (#86)', () => {
  it('filters NONE access out of overlay candidates', () => {
    expect(
      filterAccessibleOverlayIds([
        { id: 'doc-owner', access: 'OWNER' },
        { id: 'doc-none', access: 'NONE' },
        { id: 'doc-read', access: 'READ' },
      ])
    ).toEqual(['doc-owner', 'doc-read'])
  })

  it('abstains without a confirmed task intent and exposes list copy', () => {
    expect(rankAccessibleDocuments(null, [{ id: 'doc-a', access: 'OWNER' }])).toEqual({
      status: 'abstain',
      reason: 'missing_task_intent',
      copy: HOST_MEMORY_ABSTAIN_COPY.missing_task_intent,
      candidates: [],
    })
    expect(rankAccessibleDocuments('   ', [{ id: 'doc-a', access: 'OWNER' }])).toEqual({
      status: 'abstain',
      reason: 'missing_task_intent',
      copy: HOST_MEMORY_ABSTAIN_COPY.missing_task_intent,
      candidates: [],
    })
  })

  it('does not rank NONE ids even when a task summary is present', () => {
    expect(rankAccessibleDocuments('deploy notes', [{ id: 'doc-none', access: 'NONE' }])).toEqual({
      status: 'abstain',
      reason: 'no_accessible_candidates',
      copy: HOST_MEMORY_ABSTAIN_COPY.no_accessible_candidates,
      candidates: [],
    })
  })

  it('does not invent a ranking when intent exists; provider still required', () => {
    expect(
      rankAccessibleDocuments('deploy notes', [
        { id: 'doc-a', access: 'OWNER' },
        { id: 'doc-b', access: 'READ' },
        { id: 'doc-none', access: 'NONE' },
      ])
    ).toEqual({
      status: 'needs_provider',
      candidates: ['doc-a', 'doc-b'],
    })
  })

  it('rejects document bodies in the default advice payload', () => {
    expect(() => assertMetadataOnlyAdvicePayload({ id: 'doc-a' })).not.toThrow()
    expect(() => assertMetadataOnlyAdvicePayload({ id: 'doc-a', content: 'secret' })).toThrow(/forbidden keys/)
  })

  it('does not call Laya without a task summary even when the flag is on', async () => {
    const ask = vi.fn(async () => {
      throw new Error('laya must not run')
    })
    const result = await requestHostMemoryAdvice(null, [{ id: 'doc-a', access: 'OWNER' }], {
      env: { DOC_LAYA_ENABLED: '1' },
      ask,
    })
    expect(result.called).toBe(false)
    expect(result.ranking.status).toBe('abstain')
    expect(ask).not.toHaveBeenCalled()
  })

  it('does not call Laya when DOC_LAYA_ENABLED is off', async () => {
    expect(hostMemoryLayaEnabled({})).toBe(false)
    const ask = vi.fn(async () => null)
    const result = await requestHostMemoryAdvice('deploy notes', [{ id: 'doc-a', access: 'OWNER' }], {
      env: {},
      ask,
    })
    expect(result.called).toBe(false)
    expect(result.ranking).toEqual({ status: 'needs_provider', candidates: ['doc-a'] })
    expect(ask).not.toHaveBeenCalled()
  })
})

describe('host memory product overlays (#85, #87-#93)', () => {
  it('#85 overlay click is not PUT and cannot skip collab persist', () => {
    const off = versionAttachAdvice({ flagOn: false, previousVersionId: 'v1' })
    expect(off.status).toBe('abstain')
    expect(off.clickIsPut).toBe(false)
    expect(off.canSkipCollabPersist).toBe(false)
    const on = versionAttachAdvice({ flagOn: true, previousVersionId: 'v1' })
    expect(on.status).toBe('suggest')
    expect(applyVersionAttachSuggestion().putCalled).toBe(false)
    expect(() => assertMetadataOnlyAdvicePayload({ id: 'doc-a', previousVersionId: 'v1' })).not.toThrow()
  })

  it('#87 omitted=0 does not call Laya and cannot PATCH', () => {
    const zero = omittedSliceAdvice({ omittedBytes: 0, versionCount: 3, optInFragmentContract: true })
    expect(zero.calledLaya).toBe(false)
    expect(zero.canPatch).toBe(false)
    const noContract = omittedSliceAdvice({ omittedBytes: 12, versionCount: 3, optInFragmentContract: false })
    expect(noContract.status).toBe('abstain')
    expect(noContract.calledLaya).toBe(false)
  })

  it('#88 card suggestion is GET and does not imply WRITE', () => {
    const result = documentCardOpenAdvice({
      selectedId: 'a',
      candidateId: 'b',
      candidateAccess: 'READ',
    })
    expect(result.status).toBe('suggest')
    expect(result.clickAction).toBe('GET')
    expect(result.impliesWrite).toBe(false)
    expect(documentCardOpenAdvice({ selectedId: 'a', candidateId: 'x', candidateAccess: 'NONE' }).status).toBe(
      'abstain'
    )
  })

  it('#89 cannot grant WRITE if only READ exists without the share API', () => {
    const enlarged = shareHandoffAdvice({ currentAccess: 'READ', suggestedAccess: 'WRITE' })
    expect(enlarged.status).toBe('abstain')
    expect(enlarged.canGrantWriteWithoutShareApi).toBe(false)
  })

  it('#90 abstains without summary and never in-place rewrites', () => {
    const missing = rememberCorrectAdvice({})
    expect(missing.status).toBe('abstain')
    expect(missing.inPlaceRewrite).toBe(false)
    const labeled = rememberCorrectAdvice({ taskSummary: 'keep the deploy notes' })
    expect(labeled.status).toBe('suggest')
    expect(labeled.restoreUsesExistingRoute).toBe(true)
  })

  it('#91 failed delete keeps the row and does not change access', () => {
    const failed = pinForgetAdvice({ deleteSucceeded: false })
    expect(failed.rowRemains).toBe(true)
    expect(failed.errorVisible).toBe(true)
    expect(failed.accessUnchanged).toBe(true)
    expect(() => assertMetadataOnlyAdvicePayload({ id: 'doc-a', action: 'pin' })).not.toThrow()
  })

  it('#92 conflict or dangling id is undetermined; unselected ids stay off the wire', () => {
    const conflict = hostDeliveryPreflight({
      selectedIds: ['m1'],
      versions: { m1: ['v1', 'v2'] },
      danglingIds: [],
      access: { m1: 'OWNER' },
    })
    expect(conflict.status).toBe('undetermined')
    expect(conflict.overallPass).toBe(false)
    expect(conflict.canMarkAccepted).toBe(false)
    const outbound = outboundHostPreflightJson(['chosen'], {
      chosen: 'ok',
      UNIQUE_UNSELECTED_MARKER: 'nope',
    })
    expect(outbound).toEqual({ chosen: 'ok' })
  })

  it('#93 known NONE omit does not call Laya and cannot mutate export bytes', () => {
    expect(exportOmitAdvice({ omitReason: 'NONE' }).status).toBe('abstain')
    expect(applyExportOmitSuggestion()).toEqual({ mutatesExportBytes: false, silentGrant: false })
  })
})
