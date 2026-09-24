/** Local-only System One. Non-loopback destinations are rejected. */

export const LAYA_ENDPOINT = 'http://127.0.0.1:18081/v1/systemone'

export function isLoopbackEndpoint(raw: string): boolean {
  try {
    const url = new URL(raw)
    return (
      url.protocol === 'http:' &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]') &&
      url.pathname === '/v1/systemone' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
  } catch {
    return false
  }
}

export function layaRequestConfig(env: NodeJS.Dict<string> = process.env): {
  url: string
  model: string
  timeoutMs: number
} | null {
  const flag = env.DOC_LAYA_ENABLED?.trim().toLowerCase()
  if (flag !== '1' && flag !== 'true' && flag !== 'yes') return null
  const candidate = (env.DOC_LAYA_URL?.trim() || LAYA_ENDPOINT).replace(/\/$/u, '')
  const timeoutRaw = Number(env.DOC_LAYA_TIMEOUT_MS)
  return {
    url: isLoopbackEndpoint(candidate) ? candidate : LAYA_ENDPOINT,
    model: /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(env.DOC_LAYA_MODEL ?? '')
      ? env.DOC_LAYA_MODEL!
      : 'typed-decisions',
    timeoutMs: Math.max(100, Math.min(5_000, Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 2_000)),
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export type LayaAsk = (payload: Record<string, unknown>) => Promise<string[] | null>

/** Rank document ids. Payload must stay metadata-only. Never sends Authorization. */
export async function askLayaDocumentRanking(
  payload: Record<string, unknown>,
  deps: { env?: NodeJS.Dict<string>; fetchImpl?: typeof fetch } = {}
): Promise<string[] | null> {
  const ids = Array.isArray(payload.ids) ? payload.ids.filter((id): id is string => typeof id === 'string') : []
  if (ids.length === 0) return null
  const extra = Object.keys(payload).filter((key) => key !== 'ids')
  if (extra.length > 0) return null
  const config = layaRequestConfig(deps.env ?? process.env)
  if (!config) return null
  const criteria = Object.fromEntries(ids.map((id) => [id, `Accessible document ${id}`]))
  try {
    const response = await (deps.fetchImpl ?? fetch)(config.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        state: { ids },
        questions: {
          rank: {
            type: 'choice',
            instructions: 'Pick the best matching accessible document id. Advisory. Do not grant access.',
            criteria,
          },
        },
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
      redirect: 'error',
    })
    if (!response.ok) return null
    const body = asRecord(await response.json().catch(() => null))
    const answers = asRecord(body?.answers)
    const rank = asRecord(answers?.rank)
    const selected =
      typeof rank?.choice === 'string' ? rank.choice : typeof rank?.selected === 'string' ? rank.selected : null
    if (!selected || !ids.includes(selected)) return null
    return [selected, ...ids.filter((id) => id !== selected)]
  } catch {
    return null
  }
}
