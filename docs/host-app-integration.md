# Host app integration guide

Host applications that embed `doc` (e.g. RoleWeave Memory & Collaboration panel) consume
documents through API v1. This guide covers list/search plus content replace and the change
stream so a host preview can edit and stay live.

## Base endpoint

```http
GET /api/v1/documents
Authorization: Bearer doc_pat_...
```

A token with `documents:read` scope is required. See [API.md](API.md) for authentication details.

## Search across title and content

The `query` parameter searches both document title and body content with OR semantics. A document
is returned if the keyword appears in either field.

```http
GET /api/v1/documents?query=deployment%20procedure
```

`query` is a **single substring**, not a list of OR terms. `deployment%20procedure` (a space)
matches documents whose title or body contains the 21-character string `deployment procedure`.
It does not match a document that has `deployment` in the title and `procedure` only in the
body as two separate words. `+` in the query string is a space, not a boolean operator.

The search is case-insensitive and uses substring matching (`ILIKE`-style). For host apps that
need to show where the match was found, there is currently no `matchField` indicator in the API
response — the host app should fetch individual documents (`GET /api/v1/documents/{id}`) and
inspect the content if highlight positioning is needed.

## Filter by time range

Use `after` and `before` to narrow results to a specific update window. Both filter on
`updatedAt`.

```http
# Documents updated in the last 7 days
GET /api/v1/documents?after=2026-09-11T00:00:00.000Z

# Documents updated in September 2026
GET /api/v1/documents?after=2026-09-01&before=2026-09-30
```

Dates accept any ISO 8601 format. Invalid dates return `400 invalid_query`.

## Sort results

Control ordering with the `sort` parameter:

```http
# Most recently created first
GET /api/v1/documents?sort=created_desc

# Least recently updated first
GET /api/v1/documents?sort=updated_asc
```

Default is `updated_desc`. When using cursor-based pagination (`cursor` param), only `updated_*`
sort orders are supported — `created_*` sorts with a cursor return `400 invalid_cursor`.

## Pagination

The endpoint uses cursor-based pagination. Always follow `meta.nextCursor` until it is `null`:

```
Page 1: GET /api/v1/documents?limit=50&query=runbook
         → meta.nextCursor = "eyJ1cGRhdGVkQXQi..."

Page 2: GET /api/v1/documents?limit=50&query=runbook&cursor=eyJ1cGRhdGVkQXQi...
         → meta.nextCursor = null  (done)
```

Cursor pagination is tied to `(updatedAt, id)`. If you need `created_*` ordering, you must fetch
all results (no cursor) and sort client-side, or use offset-based logic with `after`/`before`.

## Combining parameters

All parameters can be combined:

```http
GET /api/v1/documents?query=onboarding&after=2026-08-01&sort=created_desc&limit=20
```

This returns documents matching "onboarding" in title or content, updated after August 1 2026,
ordered by creation date descending, 20 per page.

## Internal API (browser session)

The internal `GET /api/doc` endpoint used by the doc web UI also supports the same search and
filter parameters, using `keyword` instead of `query`:

```http
GET /api/doc?keyword=runbook&after=2026-09-01&sort=updated_desc
```

This endpoint uses the browser session cookie for authentication and is not intended for host app
integration — use API v1 with a PAT instead.

## Editing existing documents

The Memory & Collaboration panel (and any other host) can replace an existing body without joining
the Web workbench:

```http
PUT /api/v1/documents/{id}/content
Authorization: Bearer doc_pat_...
Content-Type: application/json
```

```json
{
  "content": { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "…" }] }] },
  "baseVersion": "etag-from-get"
}
```

`documents:write` is required. Send the `ETag` from `GET /api/v1/documents/{id}` as `baseVersion`
(or `*` to force). A live collaboration room is updated in place; if nobody is editing in the
browser, the write still persists. Stale `baseVersion` returns `409 version_conflict`.

To refresh an open preview without polling in a loop, open:

```http
GET /api/v1/documents/{id}/events
Authorization: Bearer doc_pat_...
```

The stream is `text/event-stream`. Handle `document.snapshot` then `document.updated`. On
`document.updated`, re-fetch `GET /api/v1/documents/{id}` (or apply the new etag you already
hold) so **更新于** is not a static snapshot. Requires `documents:read`.

## Error handling

| Status | Code                        | Meaning                                               |
| ------ | --------------------------- | ----------------------------------------------------- |
| 400    | `invalid_query`             | Invalid `after`/`before` date or `sort` value         |
| 400    | `invalid_cursor`            | Cursor used with `created_*` sort                     |
| 401    | `unauthorized`              | Missing or invalid PAT                                |
| 403    | `insufficient_scope`        | Token lacks `documents:read`                          |
| 409    | `version_conflict`          | `baseVersion` does not match the current ETag         |
| 503    | `collaboration_unavailable` | Live-room replace failed for a reason other than idle |

## Testing the date range filter

Host apps should verify that `after` and `before` filter on `updatedAt`, not `createdAt`. A
document edited today but created last month will appear in an `after=last-week` query.

```typescript
const res = await fetch(
  `${DOC_ORIGIN}/api/v1/documents?after=2026-09-11T00:00:00.000Z&before=2026-09-18T00:00:00.000Z`,
  { headers: { Authorization: `Bearer ${token}` } }
)

const { data, requestId } = await res.json()

// Every returned document must have updatedAt within the range
for (const doc of data) {
  const updated = new Date(doc.updatedAt)
  console.assert(updated > new Date('2026-09-11T00:00:00.000Z'), `${doc.id} updatedAt out of range`)
  console.assert(updated < new Date('2026-09-18T00:00:00.000Z'), `${doc.id} updatedAt out of range`)
}

// Invalid date returns 400
const bad = await fetch(`${DOC_ORIGIN}/api/v1/documents?after=not-a-date`, {
  headers: { Authorization: `Bearer ${token}` },
})
console.assert(bad.status === 400)
const body = await bad.json()
console.assert(body.error.code === 'invalid_query')
```
