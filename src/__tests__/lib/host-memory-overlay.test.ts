import { describe, expect, it } from 'vitest'
import { assertMetadataOnlyAdvicePayload, rankAccessibleDocuments } from '@/lib/host-memory-overlay'

describe('host memory overlay ranking (#86)', () => {
  it('abstains without a confirmed task intent', () => {
    expect(rankAccessibleDocuments(null, ['doc-a'])).toEqual({
      status: 'abstain',
      reason: 'missing_task_intent',
    })
    expect(rankAccessibleDocuments('   ', ['doc-a'])).toEqual({
      status: 'abstain',
      reason: 'missing_task_intent',
    })
  })

  it('abstains when no accessible candidates remain', () => {
    expect(rankAccessibleDocuments('deploy notes', [])).toEqual({
      status: 'abstain',
      reason: 'no_accessible_candidates',
    })
  })

  it('does not invent a ranking when intent exists; provider still required', () => {
    expect(rankAccessibleDocuments('deploy notes', ['doc-a', 'doc-b'])).toEqual({
      status: 'needs_provider',
      candidates: ['doc-a', 'doc-b'],
    })
  })

  it('rejects document bodies in the default advice payload', () => {
    expect(() => assertMetadataOnlyAdvicePayload({ id: 'doc-a' })).not.toThrow()
    expect(() => assertMetadataOnlyAdvicePayload({ id: 'doc-a', content: 'secret' })).toThrow(/forbidden keys/)
  })
})
