import HomeNav from '@/components/home-nav'
import { getPubDoc, getPubDocTitle } from './action'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { User } from 'next-auth'
import { getLocale } from 'next-intl/server'
import ThumbUpButton from '@/components/thumb-up-button'
import Footer from '@/components/footer'
import PubDocContent from '@/components/pub-doc-content'
import { PUB_DOC_STATUS } from '@/lib/pub-doc-status'
import { resolveRouteParams, type RouteParams } from '@/lib/route-params'

export async function generateMetadata({ params }: { params: RouteParams<{ publishId: string }> }) {
  const { publishId } = await resolveRouteParams(params)

  const pubDocTitle = await getPubDocTitle(publishId)
  if (pubDocTitle == null) {
    return {
      title: '404 Document not found',
    }
  }
  return {
    title: pubDocTitle,
  }
}

export default async function PubDocPage({ params }: { params: RouteParams<{ publishId: string }> }) {
  const { publishId } = await resolveRouteParams(params)

  const pubDoc = await getPubDoc(publishId)
  const user = pubDoc?.user
  if (pubDoc == null || user == null) {
    return (
      <>
        <HomeNav />
        <main className="min-h-screen flex flex-col justify-center">
          <p className="text-center text-muted-foreground">404 Document not found</p>
        </main>
      </>
    )
  }

  if (pubDoc.status === PUB_DOC_STATUS.FROZEN) {
    return (
      <>
        <HomeNav />
        <main className="min-h-screen flex flex-col items-center justify-center px-6">
          <div className="max-w-xl rounded-lg border border-border bg-card p-8 text-center text-card-foreground shadow-sm">
            <h1 className="text-balance text-2xl font-semibold">该文档已暂停公开访问</h1>
            <p className="mt-3 text-sm text-muted-foreground">管理员已暂时冻结该发布内容，请稍后再试。</p>
          </div>
        </main>
      </>
    )
  }

  const { title, htmlContent, updatedAt } = pubDoc
  const locale = await getLocale()

  return (
    <>
      <HomeNav />
      <main className="min-h-screen flex flex-col items-center justify-between">
        <div className="xl:w-[800px] lg:w-[800px] mx-auto my-24 text-base/8">
          {/* title */}
          <h1 className="text-3xl font-bold mb-4 mx-10">{title}</h1>
          <div className="flex items-center justify-between mx-10 mb-4">
            <div className="flex items-center">
              <UserAvatar user={user} />
              <span className="text-sm text-muted-foreground">{user.name}</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {new Date(updatedAt).toLocaleDateString(locale)}
              {', '}
              {new Date(updatedAt).toLocaleTimeString(locale)}
            </span>
          </div>
          {/* content */}
          <PubDocContent htmlContent={htmlContent} />
          {/* thumbUp */}
          <ThumbUpButton initialCount={pubDoc.thumbUpCount} publishId={publishId} />
        </div>
        <Footer />
      </main>
    </>
  )
}

function UserAvatar({ user }: { user: User | null }) {
  let { name, image, email } = user || {}
  if (!name) name = email

  return (
    <Avatar className="h-7 w-7 border mr-1">
      <AvatarImage src={image || ''} alt={name || ''} />
      <AvatarFallback>{name?.slice(0, 1)}</AvatarFallback>
    </Avatar>
  )
}
