import { extractMagicLink, localAuthGuidance } from '@/lib/local-auth-guidance'

export const dynamic = 'force-dynamic'

type MailpitMessageSummary = {
  ID?: string
  To?: Array<{ Address?: string }>
}

async function readMailpitMessage(base: string, id: string) {
  const response = await fetch(`${base}/api/v1/message/${id}`)
  if (!response.ok) return null
  const body = (await response.json()) as { HTML?: string; Text?: string }
  return extractMagicLink(body.HTML || body.Text || '')
}

export async function GET(request: Request) {
  const guidance = localAuthGuidance()
  if (!guidance.enabled || !guidance.mailpitUrl) {
    return Response.json({ enabled: false, url: null })
  }

  const email = new URL(request.url).searchParams.get('email')?.trim().toLowerCase()
  if (!email) {
    return Response.json({ enabled: true, url: null })
  }

  try {
    const listResponse = await fetch(`${guidance.mailpitUrl.replace(/\/$/, '')}/api/v1/messages`)
    if (!listResponse.ok) {
      return Response.json({ enabled: true, url: null })
    }
    const payload = (await listResponse.json()) as { messages?: MailpitMessageSummary[] }
    const match = (payload.messages || []).find((message) =>
      (message.To || []).some((recipient) => recipient.Address?.toLowerCase() === email)
    )
    if (!match?.ID) {
      return Response.json({ enabled: true, url: null })
    }
    const url = await readMailpitMessage(guidance.mailpitUrl.replace(/\/$/, ''), match.ID)
    return Response.json({ enabled: true, url })
  } catch {
    return Response.json({ enabled: true, url: null })
  }
}
