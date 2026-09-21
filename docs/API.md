# Document API v1

`doc` exposes a Bearer-only API for document automation. The browser session API and the public
document API are separate: scripts use `/api/v1`, while personal access tokens are created and
revoked from the signed-in user settings page.

The current v1 surface supports token inspection, owner document listing, document reads,
document creation, concurrency-safe metadata updates, collaboration-aware content replacement,
and a document-change SSE stream. It does not yet expose delete, publish, or workspace
import/export as documented CLI commands.

## Authentication

Create a personal access token in `/user-info`. A token:

- starts with `doc_pat_`;
- is shown only once;
- is stored by the server as a SHA-256 digest;
- has an explicit expiry between 1 and 365 days;
- can be revoked without changing the account password; and
- carries one or both of `documents:read` and `documents:write`.

Pass the raw token in the request header:

```http
Authorization: Bearer doc_pat_...
```

`documents:read` is required for list, get, and the document-change stream. `documents:write` is
required for create, metadata update, and content replacement. Token-management routes require an
authenticated browser session and are not part of the Bearer API.

Do not put tokens in command arguments, URLs, repository files, or shell history. The CLI accepts
tokens through a hidden terminal prompt, standard input, or `DOC_API_TOKEN`.

The CLI binds a saved token to its saved origin and rejects API base URLs with a path. On Windows,
use `DOC_API_TOKEN` from a protected credential source instead of plaintext CLI persistence.

## Response contract

Successful responses use:

```json
{
  "data": {},
  "requestId": "request-id"
}
```

Collection responses may also include `meta`. Errors use the real HTTP status and a stable code:

```json
{
  "error": {
    "code": "document_not_found",
    "message": "Document not found"
  },
  "requestId": "request-id"
}
```

Every response is private and non-cacheable and includes `X-Request-Id`. A valid incoming
`X-Request-Id` is echoed; otherwise the server creates one.

## Endpoints

### Inspect the token

```http
GET /api/v1/me
```

The response contains `authenticated`, `userId`, and the token's `scopes`.

### List documents

```http
GET /api/v1/documents?limit=50&cursor=...&query=...&starred=true&trash=false&after=...&before=...&sort=...
```

The list contains documents owned by the token's user. `limit` defaults to `50` and must be from
`1` to `100`. Follow `meta.nextCursor` until it is `null`; cursors are opaque. `starred` and
`trash` accept only `true` or `false`. `query` is limited to 200 characters.

#### Search

`query` searches both document **title** and **content** (case-insensitive). A document matches
when either field contains the keyword. The search uses `OR` semantics — a match in the title,
the body, or both all return the document.

#### Time range filters

- `after` — return documents updated strictly after this ISO 8601 date (e.g. `2026-09-01` or
  `2026-09-01T00:00:00.000Z`).
- `before` — return documents updated strictly before this ISO 8601 date.

Both are optional and can be combined. Invalid dates return `400 invalid_query`.

#### Sort

`sort` controls result ordering. Accepted values:

| Value          | Order                                 |
| -------------- | ------------------------------------- |
| `updated_desc` | Most recently updated first (default) |
| `updated_asc`  | Least recently updated first          |
| `created_desc` | Newest created first                  |
| `created_asc`  | Oldest created first                  |

Invalid values return `400 invalid_query`. Cursor pagination (`cursor` param) is only compatible
with `updated_*` sort orders; combining `cursor` with `created_*` returns `400 invalid_cursor`.

#### Examples

```http
# Search content and title for "runbook", updated in September 2026
GET /api/v1/documents?query=runbook&after=2026-09-01&before=2026-09-30

# Oldest documents first
GET /api/v1/documents?sort=created_asc

# Recently updated documents matching "deployment"
GET /api/v1/documents?query=deployment&sort=updated_desc
```

```json
{
  "data": [
    {
      "id": "document-id",
      "title": "Runbook",
      "icon": null,
      "parentId": null,
      "starred": false,
      "deleted": false,
      "access": "owner",
      "createdAt": "2026-07-30T00:00:00.000Z",
      "updatedAt": "2026-07-30T00:00:00.000Z"
    }
  ],
  "meta": {
    "nextCursor": null
  },
  "requestId": "request-id"
}
```

### Read a document

```http
GET /api/v1/documents/{id}
```

Owners and explicit READ/WRITE recipients can read an active document. The response adds the
TipTap JSON `content` field and returns an `ETag` header. Inaccessible and missing documents both
return `404`, so the endpoint does not reveal another user's document IDs.

### Create a document

```http
POST /api/v1/documents
Content-Type: application/json
```

```json
{
  "title": "Runbook",
  "icon": "📘",
  "parentId": null,
  "content": {
    "type": "doc",
    "content": [
      {
        "type": "paragraph",
        "content": [{ "type": "text", "text": "First response steps" }]
      }
    ]
  }
}
```

`title` is required. `icon`, `parentId`, and `content` are optional. The current server-side
codec accepts the basic TipTap nodes supported by StarterKit plus underline, text alignment,
subscript, superscript, highlight, task lists, and safe links. Unsupported custom editor nodes are
rejected with `422` instead of being silently discarded.

Requests are limited to 1 MiB. Titles are limited to 100 characters, icons to 32 characters, and
TipTap content to 10,000 nodes, 64 levels, and 50,000 text characters. A user may have at most 100
active documents. Limit violations return `413 payload_too_large`, `422 validation_error` or
`invalid_content`, and `429 document_limit_reached` as appropriate.

The server creates matching JSON and Yjs state. A successful response is `201`, includes the
created document, and returns `Location` and `ETag`.

### Update document metadata

```http
PATCH /api/v1/documents/{id}
Content-Type: application/json
If-Match: "etag-from-get"
```

```json
{
  "title": "Production runbook",
  "icon": null,
  "isStar": true
}
```

At least one of `title`, `icon`, or `isStar` is required. Only the owner can update a document.
The response contains metadata only, so a write-only token cannot use this endpoint to read
document content.
`If-Match` prevents lost updates:

- omit it: `428 precondition_required`;
- send a stale value: `412 document_conflict`;
- send the current document `ETag`: update atomically; or
- send `*`: deliberately force a metadata update.

Content replacement is not accepted by this endpoint. Use `PUT /api/v1/documents/{id}/content`.

### Replace document content

```http
PUT /api/v1/documents/{id}/content
Content-Type: application/json
```

```json
{
  "content": {
    "type": "doc",
    "content": [
      {
        "type": "paragraph",
        "content": [{ "type": "text", "text": "Updated runbook" }]
      }
    ]
  },
  "baseVersion": "etag-from-get",
  "idempotencyKey": "optional-retry-key"
}
```

`content` is TipTap JSON with a `doc` root (same codec as create). `baseVersion` is required:

- the current document `ETag` from `GET /api/v1/documents/{id}`: apply if unchanged;
- `*`: force the write;
- any other value: `409 version_conflict`.

If a Hocuspocus room is live, the write goes through
`POST /collab/documents/{id}/restore` so connected Web editors receive the replace. If no room is
active (`Active document not found`), the same JSON and Yjs binary are persisted on the document
row so a later editor load sees the new body. Other collaboration failures return
`503 collaboration_unavailable` and do not leave an orphan version snapshot.

A successful response is `200` with `documentId`, `versionId`, `etag`, and `operationId`, and an
`ETag` header. Optional `idempotencyKey` (max 128 characters) replays the same result for a short
window without applying the mutation twice.

### Watch document changes

```http
GET /api/v1/documents/{id}/events
```

Requires `documents:read`. The response is `text/event-stream`. The first event is
`document.snapshot` with the current `etag` and `updatedAt`. Later `document.updated` events fire
when this process applies a content replacement. Heartbeats are comment lines.

```
event: document.snapshot
data: {"documentId":"document-id","etag":"\"doc:document-id:revision\"","updatedAt":"2026-01-01T00:00:00.000Z"}

event: document.updated
data: {"documentId":"document-id","etag":"\"doc:document-id:next\"","updatedAt":"2026-01-01T00:00:05.000Z"}
```

Hosts should treat a new `etag` as the signal to refresh preview content (`GET /api/v1/documents/{id}`
or the payload they already hold). Cross-process watchers still need to poll `GET` if they are not
on the instance that accepted the `PUT`.

## CLI mapping

```bash
doc auth login --url https://docs.example.com
doc auth status
doc ls
doc get <document-id>
doc create --title "Runbook" --content-file runbook.json
doc update <document-id> --title "Production runbook" --if-match '"etag"'
doc update <document-id> --star --force
doc auth logout
```

The CLI rejects plain HTTP for non-loopback hosts. See [CLI.md](CLI.md) for configuration
precedence, output modes, exit codes, and local operations commands.
