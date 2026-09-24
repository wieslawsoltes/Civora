# Team databases and organizational sign-in

## Default SQLite

Requirements: Node.js >=22.13 (tested here on 22.16). The built-in `node:sqlite` API may print an experimental warning on that runtime. No npm packages are needed for SQLite.

```sh
CIVORA_ADMIN_PASSWORD='your-unique-strong-password' npm run server
```

On PowerShell:

```powershell
$env:CIVORA_ADMIN_PASSWORD = 'your-unique-strong-password'
npm run server
```

The default listener is `127.0.0.1:8787`. The data directory is `./data`. An empty workspace is initialized. Use `CIVORA_SEED_DEMO=1` only to seed a **new** evaluation database. It does not reset an existing database.

| Environment variable | Meaning |
|---|---|
| `HOST` | Bind interface, default 127.0.0.1 |
| `PORT` | Listener port, default 8787 |
| `CIVORA_PUBLIC_ORIGIN` | Exact user-facing origin, e.g. `https://documents.example.org`, no trailing slash |
| `CIVORA_DATA_DIR` | Private credentials, operations SQLite, rendition files and default workspace SQLite storage |
| `CIVORA_DB` | sqlite, postgres, mysql, mssql, or mongodb |
| `DATABASE_URL` | Server-only external database connection string |
| `CIVORA_MONGO_DATABASE` | MongoDB database name, default civora |
| `CIVORA_ADMIN_PASSWORD` | First bootstrap password only; does not reset existing credentials |
| `CIVORA_WORKSPACE_NAME` | Name for a new empty server workspace |
| `CIVORA_SEED_DEMO` | `1` seeds synthetic data and broad evaluation ACLs in a new server workspace; never use as a production access template |
| `CIVORA_AUTO_RENDITIONS` | Default on for supported uploads/check-ins; `0` disables automatic enqueue |
| `CIVORA_CONVERTERS_FILE` | Private absolute/relative path to administrator-controlled native converter registrations; see NATIVE-CAD.md |

Opening the app at `localhost` while its configured origin is `127.0.0.1` will fail the exact-origin write check. Use the printed origin or configure the actual public origin explicitly. Do not infer origin or trust forwarded headers from arbitrary requests.

## External SQL providers

Drivers are loaded only when selected. There is no hidden vendor account, shared service, or bundled password.

```sh
npm install --no-save pg
CIVORA_DB=postgres DATABASE_URL='postgresql://user:password@host:5432/civora' npm run server

npm install --no-save mysql2
CIVORA_DB=mysql DATABASE_URL='mysql://user:password@host:3306/civora' npm run server

npm install --no-save mssql
CIVORA_DB=mssql DATABASE_URL='Server=host;Database=civora;User Id=user;Password=password;Encrypt=true;TrustServerCertificate=false' npm run server
```

These sample credentials are placeholders, not valid accounts. For production, inject secrets through your deployment secret manager rather than committing them or placing them in shell history. Configure TLS and certificate verification using your driver/provider's supported connection parameters. This app does not turn off certificate verification to work around connectivity failures.

A compatible PostgreSQL endpoint can be supplied by a managed PostgreSQL service such as Supabase or Neon. The integration here uses the PostgreSQL protocol, **not** their full proprietary identity, RLS, realtime, storage, or administration APIs. Azure SQL uses the SQL Server adapter. No hosted provider was contacted in the verification run.

Each SQL backend creates `civora_state` and `civora_blobs`. A database user initially needs table creation permissions; use a dedicated database and account, not a shared production schema. Back up metadata and blob tables consistently. The singleton state model serializes writes and has a 32 MiB metadata limit. MySQL `max_allowed_packet` and provider gateway limits may require configuration before larger uploads work.

## MongoDB / Atlas

```sh
npm install --no-save mongodb
CIVORA_DB=mongodb DATABASE_URL='mongodb://user:password@host:27017' CIVORA_MONGO_DATABASE=civora npm run server
```

Atlas connection strings can be passed instead, with provider-recommended TLS options. GridFS stores files; a SHA-256 index maps content to GridFS IDs. Root metadata is a CAS-replaced document limited to 12 MiB serialized. Content is staged before publishing the metadata snapshot. A process interruption may leave an orphan; there is no automatic garbage collector. Standalone and managed MongoDB deployments were not live tested.

## Organizational OAuth/OIDC login

```sh
npm install --no-save jose
OIDC_ISSUER='https://identity.example.org/realms/engineering' \
OIDC_CLIENT_ID='registered-client-id' \
OIDC_CLIENT_SECRET='server-only-secret-when-required' \
CIVORA_PUBLIC_ORIGIN='https://documents.example.org' \
npm run server
```

Register the exact callback:

```text
https://documents.example.org/auth/oidc/callback
```

This flow uses discovery, authorization code + PKCE, state, browser binding, nonce, remote JWKS verification, issuer/audience/expiry validation, and an algorithm allowlist. The server requires a **verified email claim** matching an existing active member; it never auto-provisions an administrator from an external identity. Your provider must include `email_verified: true`. Providers that omit it or use a different claim mapping need a reviewed integration change; no unverified-email fallback exists.

The client secret, when required, stays on the server. An optional `jose` driver is not included in the zero-dependency default. The server sign-in dialog displays organization sign-in only when configured. An inactive or unknown member cannot sign in. There is no SAML, SCIM, tenant discovery, account recovery, MFA management, or automated invitation system here. MFA may be enforced by the configured identity provider, but was not tested in this run.

The OIDC flow, database drivers, and cloud backup flows are different integrations. Cloud-drive authorization does not grant an authenticated team workspace identity.

## Operational limitations

Use one application process. Sessions, login limits, and pending OIDC requests are in memory. Passwords are stored in the configured private data directory rather than in the external database. Back up that credential file separately and protect its filesystem permissions. A server restart intentionally requires team members to sign in again. Recipient sessions are separately persisted with expiry. Do not deploy active-active replicas without implementing shared session, credential, rate-limit, and identity-binding infrastructure.

There is no server-side whole-workspace JSON restore endpoint: replacing active membership and audit state through an ordinary client would cross security boundaries. Stop the service and use an administrator-controlled, consistent database restore. Local JSON backups can be restored into the separate local workspace, not merged into a team database automatically.

## 0.2 authorization and sidecar migration

Opening the same-origin team UI now presents a real sign-in gate. New members have no implicit document access. Configure user/group policies in People & access; an existing 0.1 database with no policies intentionally becomes default-deny for nonadministrators. Administrators retain recovery access. See UPGRADE.md before deployment.

`operations.sqlite` and `renditions/` in the private data directory are required even when using an external main database. They store jobs, recipient identities/sessions, deliveries, receipts and security evidence. Back them up consistently with `accounts.json`, main metadata and original blobs. This remains a single-node service, not active-active infrastructure. The process reads environment variables; `.env.example` is reference documentation, not an automatically loaded secret file.
