export type RouteParams<T> = T | Promise<T>

export async function resolveRouteParams<T>(params: RouteParams<T>): Promise<T> {
  return await params
}
