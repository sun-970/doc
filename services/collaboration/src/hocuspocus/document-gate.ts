const tails = new Map<string, Promise<unknown>>()

/** Serialize replacement (and callers that opt in) per document. Errors do not break the queue. */
export function withDocumentMutation<T>(docId: string, work: () => Promise<T>): Promise<T> {
  const previous = tails.get(docId) ?? Promise.resolve()
  const run = previous.then(work, work)
  tails.set(
    docId,
    run.then(
      () => undefined,
      () => undefined
    )
  )
  return run
}
