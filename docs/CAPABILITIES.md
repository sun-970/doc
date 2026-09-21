# doc capability inventory

This inventory describes the current implementation. `available` means the repository contains the
end-to-end product path. `experimental` means the surface exists but still has an unstable contract
or incomplete regression coverage.

`doc capabilities --json` exposes a versioned, compact grouping of this expanded inventory for
automation.

## Document lifecycle

| Capability         | Status       | Current implementation                                                                                                  |
| ------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Document tree      | available    | Create, rename, duplicate, move, sort, favorite, search, trash, restore, and permanent cleanup                          |
| Rich-text editing  | available    | Tiptap headings, lists, tasks, tables, columns, images, links, code, Mermaid, slash commands, outline, and find/replace |
| Templates          | available    | Todo, résumé, and project-highlight starters                                                                            |
| Version history    | available    | JSON and Yjs snapshots, block-aware diff, current-state protection, and restore                                         |
| Sharing            | experimental | READ/WRITE relations enforce owner/recipient boundaries and revoke matching active WebSocket connections                |
| Publishing         | experimental | Public links, republish/unpublish, moderation, owner checks, public reading, and allowlist HTML sanitization exist      |
| Export and uploads | available    | Browser-side PDF export plus compressed image upload through the current OSS adapter                                    |

Primary implementation paths:

- `src/app/api/doc/`
- `src/components/editor/`
- `src/components/doc-version/`
- `src/app/api/doc-version/`
- `src/app/api/doc/share-relation/route.ts`
- `src/app/[locale]/pub/`

## Collaboration

| Capability       | Status       | Current implementation                                                                                              |
| ---------------- | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| Realtime editing | available    | Yjs/Hocuspocus rooms, presence, collaboration cursors, reconnection state, and browser IndexedDB cache              |
| Authorization    | experimental | Entry and established-message checks use persisted owner/READ/WRITE access; revocation also closes matching sockets |
| Persistence      | available    | Yjs binary state and JSON projection stored against the same document                                               |
| Recovery path    | experimental | Restore first protects the current snapshot; concurrent replicas and active-room restore have multi-client tests    |

Primary implementation paths:

- `src/components/editor/hooks/useCreateEditor.ts`
- `services/collaboration/src/hocuspocus/`
- `services/collaboration/src/http/collab-routes.ts`

An established client is authorized again before each collaboration message. Revocation first
marks the matching connection read-only and advances its authorization epoch before closing it; a
database lookup that began earlier cannot reuse a stale WRITE result after that epoch changes. A
persisted revocation, document soft-delete, or ownership change therefore fails closed even if the
advisory socket-close request is unavailable. The close request uses an internal key and targets
one exact document-user pair; access events contain identifiers, outcomes, and counts but no
document content.

Version restore is explicitly staged rather than described as atomic. The Web layer commits a
recoverable current-state snapshot, then the collaboration service persists the target body before
mutating or broadcasting the active Yjs room. A persistence failure leaves all connected replicas
unchanged. If body restore succeeds but the final title projection fails, the API returns a
structured partial result with a stable operation ID, a recovery snapshot ID, and `retryable: true`;
reapplying the same immutable target and title is state-idempotent.

While access is absent, a reconnect is rejected and locally retained offline updates do not enter
the active room. A client that is granted access later must create a fresh authenticated connection;
its browser-side IndexedDB state can then participate in normal Yjs reconciliation. The repository
tests server-side reconnect denial and convergence, but does not yet automate browser IndexedDB
lifecycle behavior.

## AI assistance

| Capability           | Status       | Current implementation                                                                                  |
| -------------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| Writing operations   | available    | Continue, summarize, outline, brainstorm, expand, shorten, change tone, translate, and explain          |
| Document-side chat   | available    | Streaming responses, Markdown/Mermaid rendering, insert/replace actions, and usage limits               |
| Provider integration | experimental | DeepSeek and DeepBricks use an OpenAI-compatible adapter; provider configuration is not yet generalized |

Primary implementation paths:

- `src/components/ai-panel/`
- `src/components/editor/ai-island/`
- `src/app/api/gpt/`
- `src/lib/ai-instances.ts`

## Identity, governance, and product surface

| Capability             | Status       | Current implementation                                                                                                                                                                                                                                                                        |
| ---------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication         | available    | GitHub OAuth, email sign-in, and scoped personal access tokens with expiry, revocation, and one-time secret display                                                                                                                                                                           |
| Document API v1        | available    | Bearer-only token inspection, owner listing with content search, time range filters, sort options, authorized reads, canonical creation, ETag-guarded metadata updates, collaboration-aware content replacement (live Yjs room or idle persist), and an in-process document-change SSE stream |
| Document authorization | experimental | Browser routes, API v1, publication, and collaboration entry points enforce persisted ownership and READ/WRITE relations                                                                                                                                                                      |
| User settings          | available    | User name and avatar                                                                                                                                                                                                                                                                          |
| Admin governance       | available    | Overview, user/admin management, document filtering, restore/delete, and publication moderation                                                                                                                                                                                               |
| Localization and theme | available    | Chinese/English plus dark, light, and system themes                                                                                                                                                                                                                                           |
| Object storage         | experimental | Uploads use the current Ali OSS client; a provider-neutral S3 interface is not implemented                                                                                                                                                                                                    |

Primary implementation paths:

- `src/auth.ts`
- `src/app/api/v1/`
- `src/app/api/personal-access-tokens/`
- `src/app/admin/`
- `src/lib/admin-data.ts`
- `src/i18n/`
- `src/lib/oss.ts`

## Operations

| Capability      | Status    | Current implementation                                                                                                |
| --------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| Container stack | available | PostgreSQL, Prisma schema application, collaboration, and Web services in Compose                                     |
| Health checks   | available | Database-aware Web and collaboration readiness endpoints                                                              |
| CLI             | available | Scoped PAT auth, document list/get/create/update, diagnostics, lifecycle, logs, development, and local database tasks |
| CI              | available | Clean install, Prisma generation, formatting, lint, tests, service syntax, CLI package checks, and production build   |

See [CLI.md](CLI.md) for the command contract.

## Deliberate gaps

The following capabilities are not claimed:

- API/CLI delete, restore, version restore, publish, import, or export as a complete remote contract
- Complete like/unlike persistence, user-level deduplication, and abuse controls
- Provider-neutral object storage
- Reviewed production Prisma migrations
- Closure of the current framework, authentication, mail, and CSS toolchain security audit findings
- Browser-level IndexedDB disconnect/reconnect and access-regrant recovery coverage
- Complete audit events, rate limits, metrics, tracing, and structured logs
- Cross-process document-change fan-out (SSE currently notifies subscribers on the instance that accepted the write)

The first remote CLI surface uses API v1 rather than direct Prisma writes. Content replacement
goes through the live Yjs room when one exists, and otherwise persists JSON plus Yjs binary on
the document row after taking a version snapshot.
