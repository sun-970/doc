# Changelog

All notable changes to `doc` are documented here.

## [Unreleased]

### Added

- #86: Host Memory ranking abstains without a confirmed task intent. Overlay candidates drop `NONE` access via `resolveDocumentAccess`. `GET /api/v1/documents` returns list abstain copy in `meta.hostMemory`. Default advice payload never includes document bodies. Overlay does not change `shareRelations`. Refs #82.

- #85 #87 #88 #89 #90 #91 #92 #93: Host Memory product overlays for per-save previous-version attach, omitted-slice vs versions/restore, document-card open, share/leave handoff, remember/correct as a new version, pin/forget with visible forget failure, delivery preflight on conflicting docs, and export omit-reason next step. Default off. Overlay cannot skip collab persist, PATCH content, imply WRITE/OWNER, enlarge grants without the share API, rewrite a past version in place, mark a document accepted, or mutate export bytes. Known `NONE` omit and omittedBytes=0 never call Laya. Default advice payload stays metadata-only. Decision model is Laya (`DOC_LAYA_ENABLED`, `DOC_JEV_ENABLED` alias). Refs #82.

- Migrate the app to Next.js 16.3.5 / React 19.1.2: async `params` via
  `resolveRouteParams`, ESLint 9 flat config, and `serverExternalPackages`.
  No feature re-ships (search, likes, nav, Mailpit stay as on main).

- Add `docs/DISTRIBUTION.md`: the three distribution doors (local single-player, gated
  ByteFolk-hosted SaaS, guided self-hosting), their identity, cost, and compliance
  boundaries, the authentication consistency principle across deployments, and the
  guidance surfaces in `doc init`, README, and `doc doctor`.
- Local-only Mailpit guidance after email sign-in: outside production the
  verify-request page links to loopback Mailpit and can open the newest magic
  link. The emailed link remains the authority; production and
  `DOC_LOCAL_AUTH_HINT=0` never enable this path.

### Fixed

- Persist like identity per viewer using a server-side `PubDocLike` table and cookie-based
  anonymous viewer token. Duplicate likes from the same viewer are now idempotent, cancel
  only succeeds if that viewer holds a like, and counts survive reload across devices.
- Add an in-app back button to the TopBar that appears only after the first in-app navigation,
  and scope the entry-document flag to `sessionStorage` so it survives SPA navigation but resets
  on full page reload (#66).
- Replace hardcoded `timeAgo` strings with `next-intl` translation keys and return ISO-8601
  `createdAt` from the version API so clients can format timestamps with `Intl.DateTimeFormat`.
  Remove unused `useTimeAgo` hook export and use real `messages/zh-cn.json` in `dt.test.ts`
  to prevent test/translation drift.
- Use a consistent empty-state composition for workspace, search, favorites, shared/published
  documents, trash, personal tokens, and admin lists. Distinguish first use from filtered results
  and loading, with concise guidance and existing actions.
- Match sign-in guidance to the configured providers and restore the native input ref contract
  for workspace search and editor focus/selection.

- Keep shared controls synchronized with the selected light or dark theme, restore the missing
  button appearance on sign-in and pagination links, and pair published-page and admin surfaces
  with semantic foreground colors. Align navigation, menus, form labels, and interface headings
  with their content; keep action labels centered and comparable numeric columns right-aligned.
- Keep publication status labels and Mermaid diagrams readable in both themes, and fit editor
  toolbars, popovers, and version history within narrow viewports. Correct the nested Prisma mock
  typing so the production build validates the existing mutation tests.
- Restore server rendering of the landing page and admin console after the shared design system
  migration: the client-only `buttonVariants` helper is no longer called from server components,
  the admin layout provides the translation context required by shared UI components, and the
  i18n request configuration falls back to the default locale on routes outside the locale
  middleware instead of returning a 404.
- Pin both application and collaboration mailers to Nodemailer 9.1.1 to address
  GHSA-2x7j-588g-ccc2 and GHSA-8m3c-c648-2xjj, using a verified canonical npm registry lock entry. Override
  Auth.js's older Nodemailer peer range so its runtime also uses the patched copy;
  cover application notifications and verification emails with loopback SMTP tests.

### Changed

- Replace the remaining user-visible organization copy in the security policy, localized landing
  page, and footers with ByteFolk while retaining the established npm package scopes.
- Migrate public GitHub repository, issue, documentation, and CI badge links
  to the canonical `bytefolk` organization while retaining the existing npm
  package scopes.

### Added

- PostgreSQL full-text search with tsvector/GIN index and `matchField` provenance (#71): both
  `GET /api/doc?keyword=` and `GET /api/v1/documents?query=` now report `matchField`
  (`title` | `content` | `both`) so host UIs can highlight where a hit was found. A plain-text
  extraction of TipTap `content` is persisted in `contentSearch` and indexed via a trigger-maintained
  `search_vector` tsvector column with `websearch_to_tsquery()`. The existing `contains` fallback
  remains active for SQLite and unmigrated environments.
- Extend document search to content body and add time-range and sort filters (#68): both
  `GET /api/doc?keyword=` and `GET /api/v1/documents?query=` now match title OR content
  (case-insensitive). New `after` / `before` (ISO 8601) filter by `updatedAt`; `sort` accepts
  `updated_desc` (default), `updated_asc`, `created_desc`, `created_asc`. Shared query parser
  (`src/lib/doc-query.ts`) keeps the two routes consistent; invalid dates/sort return 400.
- Document host-app integration guide for search, time range, and sort params (#73).

- Adoption of the shared `@fullstack-ai-infra/ui` design system for the first document
  workflow: workspace shell (responsive sidebar with compact mode), editor chrome, and
  landing/sign-in surfaces consume shared tokens and components; adds a Playwright
  end-to-end baseline for the sign-in flow and component coverage for the new shell.
- Shared design system adoption for the first document workflow: the web app consumes
  `@fullstack-ai-infra/ui` tokens and components (supplied via the vendored tarball), with a
  responsive workspace and compact-mode navigation, accessibility labels, theme bootstrap,
  editor legacy fallback and parsed-content helpers, and a Playwright end-to-end baseline for
  the sign-in flow.
- New `doc` product identity and mem-aligned dark-first design system.
- Next.js document product and integrated Yjs/Hocuspocus collaboration service.
- Document version history, diff, and restore capability.
- Local PostgreSQL and collaboration Docker Compose services.
- Product goal, current specification, development and local-run documentation.
- `doc` operations CLI with capability inventory, secure initialization, diagnostics, full-stack
  lifecycle, status, logs, development, and guarded local database commands.
- Docker environment readiness pre-checks (doc#28): `doc doctor` reports Docker daemon readiness
  with a stable code and actionable guidance, and `doc up` refuses to start the stack before that
  verdict passes. Detects the two known Windows/WSL traps — daemon not running
  (`docker_daemon_unreachable`) and `credsStore: desktop.exe` under WSL
  (`docker_credsstore_desktop_exe`) — before any image pull or build.
- Database-aware Web and collaboration health endpoints.
- Full Docker Compose stack for PostgreSQL, schema application, collaboration, and Web.
- Loopback-only Mailpit service and a zero-credential email sign-in path for local deployments.
- Repeatable local-loop verification through Mailpit authentication and persisted document
  create/update/read behavior.
- Bearer-only `/api/v1` document endpoints for token inspection, listing, reading, canonical
  creation, and ETag-guarded metadata updates.
- Remote `doc auth`, `doc ls`, `doc get`, `doc create`, and `doc update` commands with private
  credential storage, bounded requests, machine-readable output, and no checkout requirement.
- Continuous integration `docker-build` job that validates the Compose configuration and builds
  every image from a clean checkout, so a broken container build can no longer reach `main`.

### Changed

- Migrated the collaboration service to strict TypeScript with native ESM build output, compiled
  local/production start commands, and a multi-stage production image.
- Regenerated the workspace lock with npm 11.8 so clean root and collaboration-only production
  installs resolve the same native and SWC helper dependency graph.
- Revalidated persisted document access before each established WebSocket message, eagerly closed
  exact document-user connections after share revocation, invalidated raced authorization epochs,
  and added content-free access events.
- Preserved the current document snapshot before active-room version restore and added concurrent
  multi-client convergence, persist-before-broadcast restore, observable partial-title recovery,
  revoked-writer, unaffected-collaborator, and reconnect tests.
- Replaced legacy product names, icons, domains, deployment workflows, and hosted marketing assets.
- Parameterized collaboration database reads and protected internal restore calls.
- Replaced private editor packages with reproducible public Tiptap extensions and refreshed the
  authentication, mail, Next.js 14, collaboration, storage, and Markdown dependency lines.
- Bound local Compose ports to loopback, removed fallback collaboration keys, isolated Compose
  projects per checkout, and made the collaboration image install from the root lockfile.
- Parameterized every local host port, moved the default Web endpoint to port 3100, selected
  authentication providers from complete configuration, and made diagnostics reject stacks with
  no usable sign-in path.
- Made local initialization merge missing safe defaults without replacing configuration, added
  independent SMTP and Mailpit live probes, redacted optional authentication credentials from
  diagnostic failures, and preserved external SMTP host/port fallback in Compose.
- Hardened legacy document reads, duplication, sharing, publishing, and collaboration monitoring
  against cross-user access and soft-deleted document access.
- Added scoped, expiring, and revocable personal access tokens with a session-protected bilingual
  management interface that reveals new token values only once.
- Sanitized new and existing published document HTML through a server-side allowlist before public
  rendering.
- Restricted collaboration-rendered TipTap attributes to safe values and stopped locale redirects
  from trusting forwarded origin headers.
- Bounded token, sharing, and publishing mutation bodies, kept internal-key checks constant-time,
  and stopped publication storage errors from reaching clients.
- Made document-share creation concurrency-safe and ensured revocation removes legacy duplicate
  grants before enforcing their database uniqueness constraint.
- Bounded and validated the legacy document-create route, storing canonical TipTap JSON together
  with matching Yjs state for new content.
- Restricted published HTML classes and data attributes to the product's explicit TipTap feature
  set, and neutralized terminal control sequences in CLI errors before PAT redaction.
