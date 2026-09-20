# Run doc locally

## Prerequisites

- Node.js 24
- npm 11+
- Docker with Compose, and the Docker daemon running (Docker Desktop started, or WSL
  integration enabled)

`doc doctor` reports Docker daemon readiness with a stable code and guidance before any image
pull or build, and `doc up` refuses to start the stack until that verdict passes. See
[Docker readiness](#docker-readiness) for the two known Windows/WSL traps.

## 1. Configure

```bash
npm ci
npm run doc -- init
npm run doc -- doctor
```

`doc init` generates `AUTH_SECRET`, two different collaboration keys, and safe local SMTP settings
for Mailpit. Re-running it safely merges newly introduced non-secret defaults into existing local
environment files without replacing configured values. Do not edit the root and collaboration key
copies independently:

- `COLLABORATE_API_AUTH_KEY` encrypts short-lived user WebSocket tokens.
- `COLLABORATE_INTERNAL_API_KEY` authenticates server-to-server restore calls.

To rotate all three values while preserving non-secret settings, run
`npm run doc -- init --force --yes`.

No external identity, mail, or AI credential is required for the local path. GitHub, Resend,
external SMTP, object storage, and AI values stay optional until the related feature is used.

## 2. Install and start dependencies

```bash
npm run doc -- dev
```

This starts PostgreSQL, Mailpit, and collaboration in containers, applies the local Prisma schema,
and runs the Web app in development mode. Schema application includes a compatibility preflight that
deduplicates legacy document grants before enforcing their database uniqueness constraint.
The Web development server reads `DOC_WEB_PORT` and defaults to `3100`.

## Run the full container stack

```bash
npm run doc -- up --build
npm run doc -- doctor --live
```

This Compose file is a loopback-only development topology. It always starts Mailpit so a fresh
checkout has a zero-credential authentication path; do not treat it as a production deployment
template. Production deployments should define their own topology and use an external SMTP or
identity provider instead of Mailpit.

Outside production, the verify-request page (after submitting an email) shows a
loopback Mailpit hint (default `http://localhost:8025`, overridable with
`DOC_MAILPIT_URL`) and can surface the newest magic link from Mailpit. This is
guidance only: the emailed link remains the authority. The hint is disabled in
production and when `DOC_LOCAL_AUTH_HINT=0`.

Complete the first-document loop:

1. Open <http://localhost:3100> and enter any valid email address.
2. Open Mailpit at <http://localhost:8025> and follow the magic link in the newest message.
3. Create a document, edit its content, and wait for the saved state.
4. Refresh the page and verify that the content remains.
5. Run `npm run doc -- doctor --live`; Web, collaboration, authentication, SMTP, and local Mailpit
   checks must pass.

The same workflow has a repeatable verifier. With the stack running, it submits an email sign-in,
opens the new Mailpit link, verifies the session, creates and updates a uniquely named document,
re-reads it, and removes it:

```bash
npm run verify:local-loop
```

Override `DOC_VERIFY_APP_URL`, `DOC_VERIFY_MAILPIT_URL`, or `DOC_VERIFY_EMAIL` when testing
non-default local endpoints. Set `DOC_VERIFY_KEEP_DOCUMENT=1` only when the generated document
should remain for visual inspection. The verifier never prints the magic link, cookies, or tokens.

The collaboration health endpoint is <http://localhost:1234>, and its database-aware readiness
endpoint is <http://localhost:1234/ready>. Mailpit binds only to loopback and is for local
development, not production mail delivery.

## Change local ports

All host bindings are configured in `.env`; Compose does not need to be edited:

| Variable                 | Default | Service        |
| ------------------------ | ------- | -------------- |
| `DOC_WEB_PORT`           | `3100`  | Web            |
| `DOC_COLLABORATION_PORT` | `1234`  | collaboration  |
| `DOC_POSTGRES_PORT`      | `5432`  | PostgreSQL     |
| `DOC_MAILPIT_SMTP_PORT`  | `1025`  | Mailpit SMTP   |
| `DOC_MAILPIT_UI_PORT`    | `8025`  | Mailpit Web UI |

When changing a port, update its public endpoint too: `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` for
Web, `NEXT_PUBLIC_COLLABORATE_EDIT_URL` and `COLLABORATE_EDIT_HTTP_URL` for collaboration, or
`DATABASE_URL` for PostgreSQL. Update `DOC_MAILPIT_URL` when changing the Mailpit UI port.
Mailpit's host SMTP port is consumed by host development through `EMAIL_HOST` and `EMAIL_PORT`;
the generated local environment explicitly uses the internal `EMAIL_CONTAINER_HOST=mailpit` and
`EMAIL_CONTAINER_PORT=1025` values for Compose.

## Configure production authentication

Providers are exposed only when their complete configuration exists:

- GitHub requires both `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`.
- SMTP requires `EMAIL_FROM`, `EMAIL_HOST`, and a valid `EMAIL_PORT`. Set `EMAIL_USERNAME` and
  `EMAIL_PASSWORD` together when the server requires authentication. Compose inherits
  `EMAIL_HOST` and `EMAIL_PORT` when `EMAIL_CONTAINER_HOST` and `EMAIL_CONTAINER_PORT` are unset;
  set the container-specific pair only when that service needs different network coordinates.
- Resend requires both `EMAIL_FROM` and `RESEND_API_KEY`. When SMTP and Resend are both available,
  the sign-in page prefers Resend for email links.

`NODE_ENV` does not enable a provider. `doc doctor` fails when no usable authentication path is
configured, and `doc doctor --live` verifies that the running Web service exposes at least one.
For SMTP authentication it also probes the configured SMTP endpoint. A loopback SMTP configuration
additionally requires `DOC_MAILPIT_URL` and a healthy Mailpit readiness endpoint.

## Run the collaboration service outside Docker

```bash
npm run dev:collaboration
```

The command reuses the private `services/collaboration/.env` generated by `doc init`. When the
service runs on the host, use `localhost` in its `DATABASE_URL`. Compose injects its own
service-network database URL.

## Stop local infrastructure

```bash
npm run doc -- down
```

The CLI never deletes the PostgreSQL volume.

## Docker readiness

`doc doctor` and `doc up` decide Docker readiness before the first image pull or build, so a
broken Docker environment fails with an actionable message instead of dying mid-`up`. Two known
Windows/WSL traps are detected with stable codes:

- `docker_daemon_unreachable` — the Docker daemon is not running. Start Docker Desktop (or enable
  Docker Desktop WSL integration), then re-run.
- `docker_credsstore_desktop_exe` — `~/.docker/config.json` sets `"credsStore": "desktop.exe"`
  while running under WSL. The Docker Desktop credential helper is a Windows executable and cannot
  execute under WSL, so even public image pulls fail with
  `fork/exec docker-credential-desktop.exe: exec format error`. Remove the `credsStore` entry from
  `~/.docker/config.json`, then re-run:

  ```bash
  # remove the credsStore line (or set it to an empty value), e.g.
  #   "credsStore": "desktop.exe"   ->   delete this line
  ```

Neither check starts Docker or pulls anything; they only read Docker state and the local Docker
client configuration.
