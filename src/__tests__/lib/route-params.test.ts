import { describe, expect, test } from 'vitest'
import { resolveRouteParams } from '@/lib/route-params'

describe('route params', () => {
  test('accepts both sync objects and promises', async () => {
    await expect(resolveRouteParams({ id: 'doc-1' })).resolves.toEqual({ id: 'doc-1' })
    await expect(resolveRouteParams(Promise.resolve({ id: 'doc-2' }))).resolves.toEqual({ id: 'doc-2' })
  })
})
