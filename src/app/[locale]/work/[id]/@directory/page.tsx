import { getDocList, getShareRelations, getMyShareRelations, getPubDocs } from './action'
import List from './list'
import OtherList from './other-list'
import { resolveRouteParams, type RouteParams } from '@/lib/route-params'

export default async function Directory({ params }: { params: RouteParams<{ id: string }> }) {
  const { id } = await resolveRouteParams(params)
  const list = await getDocList()
  const shareRelations = await getShareRelations()
  const myShareRelations = await getMyShareRelations()
  const pubDocs = await getPubDocs()

  return (
    <>
      <OtherList defaultShareRelations={shareRelations} defaultMyShareRelations={myShareRelations} />
      <List defaultList={list} defaultParamId={id} defaultPubDocs={pubDocs} />
    </>
  )
}
