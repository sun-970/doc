'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine'
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import {
  attachInstruction,
  extractInstruction,
  type Instruction,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/list-item'
import { post } from '@/lib/ajax'
import { compareDocsBySortOrder } from '@/lib/doc-sort-order'
import type { DocMoveIntent, DocMoveUpdate } from '@/lib/doc-move'
import { IDoc, useDocsStore } from '@/stores/docs-store'
import { isDescendant } from './util'
import { useToast } from '@/components/ui/use-toast'
import { useTranslations } from 'next-intl'

type DragData = { type: 'directory-doc'; id: string }

function isDragData(data: Record<string | symbol, unknown>): data is DragData {
  return data.type === 'directory-doc' && typeof data.id === 'string'
}

function getSiblings(docs: IDoc[], parentId: string | null, draggedId: string) {
  return docs
    .filter((doc) => doc.parentId === parentId && doc.id !== draggedId && !doc.isDeleted)
    .sort(compareDocsBySortOrder)
}

function getMoveIntent(docs: IDoc[], draggedId: string, targetId: string, operation: Instruction['operation']) {
  const target = docs.find((doc) => doc.id === targetId)
  if (!target) return null

  if (operation === 'combine') {
    const children = getSiblings(docs, target.id, draggedId)
    return {
      draggedId,
      parentId: target.id,
      previousSiblingId: children.at(-1)?.id ?? null,
      nextSiblingId: null,
    }
  }

  const siblings = getSiblings(docs, target.parentId, draggedId)
  const targetIndex = siblings.findIndex((doc) => doc.id === targetId)
  if (targetIndex < 0) return null
  const insertIndex = operation === 'reorder-before' ? targetIndex : targetIndex + 1
  return {
    draggedId,
    parentId: target.parentId,
    previousSiblingId: siblings[insertIndex - 1]?.id ?? null,
    nextSiblingId: siblings[insertIndex]?.id ?? null,
  }
}

function applyOptimisticMove(docs: IDoc[], intent: DocMoveIntent) {
  const siblings = getSiblings(docs, intent.parentId, intent.draggedId)
  const previous = siblings.find((doc) => doc.id === intent.previousSiblingId)
  const next = siblings.find((doc) => doc.id === intent.nextSiblingId)
  const sortOrder = previous
    ? next
      ? (previous.sortOrder ?? 0) + ((next.sortOrder ?? 0) - (previous.sortOrder ?? 0)) / 2
      : (previous.sortOrder ?? 0) + 1024
    : next
      ? (next.sortOrder ?? 0) - 1024
      : 1024
  return docs.map((doc) => (doc.id === intent.draggedId ? { ...doc, parentId: intent.parentId, sortOrder } : doc))
}

export function useMoveDirectoryDoc() {
  const docs = useDocsStore((state) => state.docs)
  const setDocs = useDocsStore((state) => state.setDocs)
  const applyMoveUpdates = useDocsStore((state) => state.applyMoveUpdates)
  const { toast } = useToast()
  const t = useTranslations('docItem')

  return useCallback(
    async (intent: DocMoveIntent) => {
      const snapshot = docs
      setDocs(applyOptimisticMove(snapshot, intent))
      try {
        const { errno, msg, data } = await post('/api/doc/move', intent)
        if (errno !== 0) throw new Error(msg || t('moveFailed'))
        applyMoveUpdates((data?.updates || []) as DocMoveUpdate[])
      } catch (error) {
        setDocs(snapshot)
        toast({
          variant: 'destructive',
          description: error instanceof Error ? error.message : t('moveFailed'),
        })
      }
    },
    [applyMoveUpdates, docs, setDocs, t, toast]
  )
}

export function useDirectoryDragItem(options: {
  id: string
  docs: IDoc[]
  enabled: boolean
  rowRef: RefObject<HTMLDivElement | null>
  handleRef: RefObject<HTMLDivElement | null>
  hasChildren: boolean
  expanded: boolean
  expand: () => void
}) {
  const { id, docs, enabled, rowRef, handleRef, hasChildren, expanded, expand } = options
  const moveDoc = useMoveDirectoryDoc()
  const [instruction, setInstruction] = useState<Instruction | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled || !rowRef.current || !handleRef.current) return
    const clearExpandTimer = () => {
      if (expandTimer.current) clearTimeout(expandTimer.current)
      expandTimer.current = null
    }
    const updateInstruction = (data: Record<string | symbol, unknown>) => {
      const nextInstruction = extractInstruction(data)
      setInstruction(nextInstruction)
      clearExpandTimer()
      if (nextInstruction?.operation === 'combine' && hasChildren && !expanded) {
        expandTimer.current = setTimeout(expand, 500)
      }
    }

    return combine(
      draggable({
        element: rowRef.current,
        dragHandle: handleRef.current,
        getInitialData: () => ({ type: 'directory-doc', id }) satisfies DragData,
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element: rowRef.current,
        canDrop: ({ source }) =>
          isDragData(source.data) && source.data.id !== id && !isDescendant(source.data.id, id, docs),
        getData: ({ input, element, source }) => {
          const blocked = !isDragData(source.data) || source.data.id === id || isDescendant(source.data.id, id, docs)
          return attachInstruction(
            { type: 'directory-doc', id },
            {
              input,
              element,
              operations: {
                'reorder-before': blocked ? 'not-available' : 'available',
                combine: blocked ? 'not-available' : 'available',
                'reorder-after': blocked ? 'not-available' : 'available',
              },
            }
          )
        },
        onDragEnter: ({ self }) => updateInstruction(self.data),
        onDrag: ({ self }) => updateInstruction(self.data),
        onDragLeave: () => {
          clearExpandTimer()
          setInstruction(null)
        },
        onDrop: ({ source, self }) => {
          clearExpandTimer()
          setInstruction(null)
          if (!isDragData(source.data)) return
          const dropInstruction = extractInstruction(self.data)
          if (!dropInstruction || dropInstruction.blocked) return
          const intent = getMoveIntent(docs, source.data.id, id, dropInstruction.operation)
          if (intent) void moveDoc(intent)
        },
      })
    )
  }, [docs, enabled, expand, expanded, handleRef, hasChildren, id, moveDoc, rowRef])

  return { instruction, isDragging }
}

export function RootDropZone({ position, children }: { position: 'first' | 'last'; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const docs = useDocsStore((state) => state.docs)
  const sortBy = useDocsStore((state) => state.sortBy)
  const moveDoc = useMoveDirectoryDoc()
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (sortBy !== 'default' || !ref.current) return
    return dropTargetForElements({
      element: ref.current,
      canDrop: ({ source }) => isDragData(source.data),
      getData: () => ({ type: 'directory-root', position }),
      onDragEnter: () => setActive(true),
      onDragLeave: () => setActive(false),
      onDrop: ({ source }) => {
        setActive(false)
        if (!isDragData(source.data)) return
        const roots = getSiblings(docs, null, source.data.id)
        void moveDoc({
          draggedId: source.data.id,
          parentId: null,
          previousSiblingId: position === 'last' ? (roots.at(-1)?.id ?? null) : null,
          nextSiblingId: position === 'first' ? (roots[0]?.id ?? null) : null,
        })
      },
    })
  }, [docs, moveDoc, position, sortBy])

  if (sortBy !== 'default') return <>{children}</>

  return (
    <div
      ref={ref}
      data-testid={`directory-root-drop-${position}`}
      className={active ? 'rounded-sm bg-primary-soft ring-1 ring-primary' : ''}
    >
      {children}
    </div>
  )
}
