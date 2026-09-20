import { redirect } from '@/i18n/routing'
import ContentWrapper from './(content)/wrapper'
import { getUserInfo } from '@/lib/session'
import CryptoJS from 'crypto-js'
import { resolveRouteParams, type RouteParams } from '@/lib/route-params'

const AUTH_KEY = process.env.COLLABORATE_API_AUTH_KEY || ''

export default async function OneWork({ params }: { params: RouteParams<{ id: string; locale: string }> }) {
  const { id, locale } = await resolveRouteParams(params)
  const userInfo = await getUserInfo()
  if (userInfo == null) {
    redirect({ href: '/user-info', locale })
  }

  // 加密 userId 用于 collab-server API auth
  if (!AUTH_KEY) {
    return <div>Not Found COLLABORATE_API_AUTH_KEY</div>
  }
  const dt = Date.now()
  const content = { dt, userId: userInfo?.id }
  const collabAPIToken = CryptoJS.AES.encrypt(JSON.stringify(content), AUTH_KEY).toString()

  return <ContentWrapper id={id} userInfo={userInfo} collabAPIToken={collabAPIToken} />
}
