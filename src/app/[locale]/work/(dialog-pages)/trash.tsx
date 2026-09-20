'use client'

import { useState, useEffect, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/use-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { IDoc } from '@/stores/docs-store'
import { timeAgo } from '@/lib/dt'
import { getDescendantsIds } from '../[id]/@directory/util'
import { get, post, del as ajaxDelete } from '@/lib/ajax'
import { useTranslations } from 'next-intl'
import { useDialogStore } from '@/stores/dialog-store'

export default function Trash() {
  const t = useTranslations('trash')
  const { trashDialogOpen, setTrashDialogOpen } = useDialogStore()
  return (
    <Dialog open={trashDialogOpen} onOpenChange={setTrashDialogOpen}>
      <DialogTrigger asChild>
        <Button className="w-full justify-start px-2 h-9" variant="ghost">
          <Trash2 className="h-4 w-4 mr-1" />
          {t('title')}
        </Button>
      </DialogTrigger>
      <DialogContent className="">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('desc')}</DialogDescription>
        </DialogHeader>
        <TrashTable />
      </DialogContent>
    </Dialog>
  )
}

function TrashTable() {
  const { toast } = useToast()
  const t = useTranslations('trash')
  const timeAgoT = useTranslations('timeAgo')
  const emptyT = useTranslations('emptyStates')

  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [list, setList] = useState<IDoc[]>([])

  // 加载数据
  const load = useCallback(async () => {
    const url = `/api/doc?isDeleted=1`
    const response = await get(url)
    if (response.errno !== 0 || !Array.isArray(response.data)) throw new Error('Document list unavailable')
    return response.data as IDoc[]
  }, [])

  useEffect(() => {
    load()
      .then(setList)
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false))
  }, [load])

  // 搜索关键字
  const [keyword, setKeyword] = useState('')
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newKeyword = e.target.value
    setKeyword(newKeyword)
  }

  // 恢复
  async function restore(id: string) {
    // 所有下级文档
    const descendantsIds = getDescendantsIds(id, list)
    const ids = [...descendantsIds, id]

    const { errno, msg } = await post('/api/doc/restore', { id, ids })

    if (errno === 0) {
      location.href = `/work/${id}`
    } else {
      toast({
        variant: 'destructive',
        description: msg || t('failed'),
      })
    }
  }

  // 彻底删除
  function del(id: string) {
    const confirmText = t('confirm')
    if (!confirm(confirmText)) return
    const descendantsIds = getDescendantsIds(id, list)
    const ids = [...descendantsIds, id]

    // 异步删除
    ajaxDelete('/api/doc', { ids })

    // 更新列表
    setList(list.filter((d) => !ids.includes(d.id)))
  }

  const matchingDocs = list.filter((doc) => doc.title.includes(keyword))
  let content: React.ReactNode

  if (loading) {
    content = (
      <p role="status" className="mt-10 text-center text-sm text-muted-foreground">
        {emptyT('loading')}
      </p>
    )
  } else if (loadFailed) {
    content = (
      <p role="alert" className="mt-8 text-sm text-danger">
        {emptyT('loadFailed')}
      </p>
    )
  } else if (matchingDocs.length === 0) {
    content = (
      <EmptyState
        icon={<Trash2 />}
        title={emptyT(keyword.trim() ? 'noResultsTitle' : 'trashTitle')}
        description={emptyT(keyword.trim() ? 'noResultsDescription' : 'trashDescription')}
        action={
          keyword.trim() ? (
            <Button variant="outline" onClick={() => setKeyword('')}>
              {emptyT('clearSearch')}
            </Button>
          ) : undefined
        }
      />
    )
  } else {
    content = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-auto">{t('docTitle')}</TableHead>
            <TableHead className="w-24 text-right">{t('docDelTime')}</TableHead>
            <TableHead className="text-right w-24">{t('operation')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {matchingDocs.map((doc) => (
            <TableRow key={doc.id} className="group">
              <TableCell>
                <p className="overflow-hidden truncate">{doc.title || t('unTitled')}</p>
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                {timeAgo(doc.updatedAt?.toString() || '', timeAgoT)}
              </TableCell>
              <TableCell className="text-right">
                <div className="inline-flex space-x-1 invisible group-hover:visible">
                  <Button variant="outline" size="sm" className="px-2 h-7" onClick={() => restore(doc.id)}>
                    {t('restore')}
                  </Button>
                  <Button variant="destructive" size="sm" className="px-2 h-7" onClick={() => del(doc.id)}>
                    {t('delete')}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  return (
    <div className="h-96 flex flex-col">
      <div className="my-2">
        <Input
          value={keyword}
          onChange={handleChange}
          maxLength={20}
          placeholder={t('inputPlaceholder')}
          className="focus-visible:ring-transparent"
        />
      </div>
      {content}
    </div>
  )
}
