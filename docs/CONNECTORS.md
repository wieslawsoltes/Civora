# OAuth cloud snapshot adapters

## What connection means

These adapters store and retrieve **full immutable workspace snapshots**. Explicit backup/restore remains available. Civora 0.2 also provides an opt-in repeated synchronization loop under **Cloud synchronization**, implemented by `packages/sync`: verified history, checksums, conflict detection and explicit resolution. See [SYNC.md](SYNC.md) for the algorithm and limits.

The active editor continues to use its local or team repository. Two-way synchronization can replace a browser-local workspace after conflict review; team workspaces allow outgoing backup only. This is not a shared transactional database, CRDT, incremental file sync or a daemon that works after the app closes. Tokens remain in memory and expiry requires reconnecting.

Each save uses a unique name; previous snapshots are not silently overwritten. Listings are bounded to approximately 2,000 matching files, and sync channels have an additional 500-snapshot safety cap. The app does not delete remote history. Provider failures are surfaced, not converted to successful cloud writes. Account/tenant-specific live qualification remains outstanding.

## Before authorizing

Serve the app on HTTPS or localhost. Configure your own provider registration, tenant/account policy, consent screen, allowed origin, and callback. Public `clientId`, tenant, redirect, and destination IDs may be stored in local preferences. **Do not enter a client secret into browser code.** Tokens and PKCE verifiers remain in memory; tokens are discarded on reload. Use a data-classification-approved account before sending confidential documents.

The modular app callback is `oauth-callback.html` in the deployment root. A one-file deployment uses its own URL as callback. Exact redirect registration matters, including path, protocol, host, and port. The callback must have the same origin as the opener.

## Google Drive

1. Create a Google OAuth web application client and configure the authorized JavaScript origin for your deployment.
2. Enable the Google Drive API and configure the consent screen/test users as required by your project.
3. Enter the public web client ID under Storage & connections → Google Drive.

The Google Identity Services token client is loaded only when you explicitly connect. The requested scope is:

```text
https://www.googleapis.com/auth/drive.appdata
```

Snapshots are written to `appDataFolder`, not the user's normal visible document tree. GIS manages the browser consent/token request. Tokens are not saved in localStorage. Disconnect requests Google token revocation. Account/consent restrictions may prevent a connection; this must be qualified with your app registration.

## Microsoft OneDrive / SharePoint

1. Register an application in Microsoft Entra.
2. Configure the browser callback under the **Single-page application** platform.
3. Choose the tenant ID/domain or `common`, public application ID, and exact callback.
4. For ordinary OneDrive, leave drive/folder item IDs blank. For a configured SharePoint/document-library destination, supply **both** its drive ID and folder item ID.

The app-folder flow requests delegated `Files.ReadWrite.AppFolder` and uses Graph's `special/approot`. An explicit drive destination requests `Files.ReadWrite`; tenant policy, user access, and admin consent can still limit the operation. IDs are item IDs, not arbitrary SharePoint page URLs. Folder discovery and administration are not implemented.

Authorization uses a public-client code + PKCE exchange; no secret is sent by the browser. Popup messages check exact origin, window source, and state. Refresh tokens are not retained. Microsoft content download uses the returned `@microsoft.graph.downloadUrl`, then retrieves it **without forwarding the OAuth token**, avoiding the documented browser preflight/302 problem.

OneDrive/SharePoint disconnection clears the in-memory access token. It does not revoke every consent on the user's Microsoft account; manage provider grants through the provider account/tenant UI.

## Dropbox

Create a scoped Dropbox API application with **App folder** access. Enable:

```text
files.metadata.read
files.content.read
files.content.write
```

Register the exact redirect URI. Enter its public app key in Civora. The public-client code flow uses S256 PKCE, state, a same-origin callback, and online access tokens. Files are uploaded to the app folder as complete JSON snapshots. In-memory disconnect is not a general revocation of the user's provider grant.

## Limits and failures

Maximum uploaded snapshot: 120 MiB serialized. The browser exporter separately caps unique source content at 90 MiB; metadata/base64 overhead can make the serialized limit fail earlier. Individual managed files are limited to 50 MiB. These are full-buffer operations, not resumable or after-close background transfers. Access-token expiry requires reconnecting explicitly.

No live provider account or app registration was supplied during implementation. Provider code and configuration paths are included; **live login, consent, CORS, permissions, uploads, downloads, revocation, and cross-tenant behavior remain unqualified**. The core backup integrity and known PKCE cryptographic vector are tested separately; that is not equivalent to testing these provider integrations.

## Public primary references

- Google token model: https://developers.google.com/identity/oauth2/web/guides/use-token-model
- Google app-data folder: https://developers.google.com/workspace/drive/api/guides/appdata
- Google uploads: https://developers.google.com/workspace/drive/api/guides/manage-uploads
- Microsoft authorization code flow: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- Microsoft app folders: https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder
- Microsoft JavaScript download guidance: https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0
- Microsoft simple upload: https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0
- Dropbox OAuth: https://docs.dropboxapi.com/dropbox-api/docs/oauth
- PKCE standard: https://datatracker.ietf.org/doc/html/rfc7636

References were consulted as public documentation, not as evidence that this particular application has passed provider certification.
