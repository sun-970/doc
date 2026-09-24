import { describe, expect, it, vi } from 'vitest'
import {
  assertMetadataOnlyAdvicePayload,
  filterAccessibleOverlayIds,
  HOST_MEMORY_ABSTAIN_COPY,
  hostMemoryLayaEnabled,
  rankAccessibleDocuments,
  requestHostMemoryAdvice,
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

  it('calls Laya with metadata ids only and keeps the list candidates unchanged', async () => {
    const ask = vi.fn(async (payload: Record<string, unknown>) => {
      expect(payload).toEqual({ ids: ['doc-a', 'doc-b'] })
      return ['doc-b', 'doc-a']
    })
    const result = await requestHostMemoryAdvice(
      'deploy notes',
      [
        { id: 'doc-a', access: 'OWNER' },
        { id: 'doc-b', access: 'READ' },
      ],
      { env: { DOC_LAYA_ENABLED: '1' }, ask }
    )
    expect(result.called).toBe(true)
    expect(result.ranking).toEqual({
      status: 'suggest',
      candidates: ['doc-a', 'doc-b'],
      overlayOrder: ['doc-b', 'doc-a'],
    })
  })
})
