import { localAuthGuidance } from '@/lib/local-auth-guidance'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(localAuthGuidance())
}
