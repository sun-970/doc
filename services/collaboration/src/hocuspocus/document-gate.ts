import { AsyncLocalStorage } from 'node:async_hooks'

const tails = new Map<string, Promise<unknown>>()
const holding = new AsyncLocalStorage<string>()

/** Serialize replacement and admitted live updates per document. Errors do not break the queue. */
export function withDocumentMutation<T>(docId: string, work: () => Promise<T> | T): Promise<T> {
  if (holding.getStore() === docId) {
    return Promise.resolve().then(work)
  }
  const previous = tails.get(docId) ?? Promise.resolve()
  const run = previous.then(
    () => holding.run(docId, () => Promise.resolve().then(work)),
    () => holding.run(docId, () => Promise.resolve().then(work))
  ) as Promise<T>
  tails.set(
    docId,
    run.then(
      () => undefined,
      () => undefined
    )
  )
  return run
}

/**
 * Hold the per-document boundary across the synchronous Hocuspocus message apply
 * that runs after `beforeHandleMessage` resolves.
 */
export async function withDocumentMessageBoundary(docId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    void withDocumentMutation(docId, () => {
      resolve()
      return new Promise<void>((release) => {
        setImmediate(release)
      })
    }).catch(reject)
  })
}
