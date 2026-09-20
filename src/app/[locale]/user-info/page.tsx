import { Link } from '@/i18n/routing'
import HomeNav from '@/components/home-nav'
import SignOutButton from '@/components/sign-out-button'
import PersonalAccessTokenManager from '@/components/personal-access-token-manager'
import { UserProfileForm } from '@/components/user-profile-form'
import { getUserInfo } from '@/lib/session'
import { getTranslations } from 'next-intl/server'
import { resolveRouteParams, type RouteParams } from '@/lib/route-params'

export default async function UserTestPage({ params }: { params: RouteParams<{ locale: string }> }) {
  const { locale } = await resolveRouteParams(params)
  const user = await getUserInfo()
  const t = await getTranslations('userInfo')

  if (user == null)
    return (
      <Wrapper>
        {/* <SignInButton /> */}
        <Link href="/" className="underline text-xl">
          {t('goBackHome')}, {t('login')}
        </Link>
      </Wrapper>
    )

  return (
    <Wrapper>
      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-24">
        <div className="flex flex-col gap-4 rounded-lg border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {t('haveLogin')},
            <Link href="/" className="ml-1 underline">
              {t('goBackHome')}
            </Link>
          </p>
          <SignOutButton>{t('logout')}</SignOutButton>
        </div>
        <section className="overflow-hidden rounded-lg border bg-card" aria-labelledby="profile-heading">
          <div className="space-y-1 border-b px-6 py-5">
            <h1 id="profile-heading" className="text-lg font-semibold">
              {t('profileTitle')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('profileDescription')}</p>
          </div>
          <UserProfileForm
            name={user.name || ''}
            avatar={user.image || ''}
            email={user.email || ''}
            redirectTo={`/${locale}/work`}
          />
        </section>
        <PersonalAccessTokenManager />
      </main>
    </Wrapper>
  )
}

// 容器
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <HomeNav />
      {children}
    </div>
  )
}
