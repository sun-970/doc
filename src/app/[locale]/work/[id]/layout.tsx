import TopBar from './top-bar'
import BottomBar from './bottom-bar'
import WorkSidebar from './work-sidebar'
import { getTranslations } from 'next-intl/server'
import ResponsiveWorkspace from '@/components/responsive-workspace'
import { resolveRouteParams, type RouteParams } from '@/lib/route-params'

export default async function Layout({
  params,
  children,
  directory, // parallel route
}: Readonly<{
  params: RouteParams<{ id: string }>
  children: React.ReactNode
  directory: React.ReactNode
}>) {
  await resolveRouteParams(params)
  const userInfoTrans = await getTranslations('userInfo')
  const commonTrans = await getTranslations('common')

  return (
    <ResponsiveWorkspace
      labels={{
        open: commonTrans('openDocumentNavigation'),
        close: commonTrans('closeDocumentNavigation'),
        navigation: commonTrans('documentNavigation'),
      }}
      navigation={
        <WorkSidebar
          navigationLabel={commonTrans('documentNavigation')}
          logoutLabel={userInfoTrans('logout')}
          directory={directory}
        />
      }
    >
      <div className="relative flex h-screen flex-col bg-canvas">
        {/* top bar */}
        <TopBar />
        {/* content */}
        <main id="workspace-main" className="min-h-0 flex-auto overflow-hidden">
          {children}
        </main>
        {/* bottom bar */}
        <BottomBar />
      </div>
    </ResponsiveWorkspace>
  )
}
