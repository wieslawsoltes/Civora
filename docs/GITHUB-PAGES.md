# GitHub Pages deployment

The browser-local Civora demo is published at https://wieslawsoltes.github.io/Civora/.
The authoritative deployment status is the repository's **Build, test and deploy Pages** workflow.
Source code, authenticated server and local filesystem tools are in https://github.com/wieslawsoltes/Civora.

## What the public demo does

The demo uses browser-local storage and synthetic demonstration records. Documents uploaded in the demo are stored in that browser, not committed to this repository. Use explicit backup/export before clearing site data. Workspace data and browser permissions are specific to the browser and origin; an older localhost or standalone workspace is not automatically migrated.

GitHub Pages serves static files only. It does not run Civora's Node/SQLite server, local filesystem service, recipient authentication, password accounts, rendition workers or unattended scheduling. Use `npm run local` from a trusted checkout for those capabilities, or deploy the team server on your own HTTPS origin. Local profile switching is a sandbox, not authentication. Live OAuth integrations need separately configured client applications and matching callback URLs; they are not preconfigured or qualified by this deployment.

## Build

Use Node.js 22.13 or later. No npm install is needed for the default browser/SQLite build:

```sh
npm run build:pages
npm run check
npm test
node tests/static-http.mjs
node tests/pages-static.mjs
```

`_site/` is an explicit public-asset allowlist. It contains the generated application, scoped offline shell, manifest, OAuth callback, independently bundled libraries, selected guides and browser examples. It excludes the server source, tests, credentials, databases, local workspaces and root configuration. Never deploy `data/` or `data-local/`.

The application uses relative asset URLs and stable fragment-based document addresses, so `/Civora/` does not require history rewrites. The service worker is scoped to this path and caches only its verified application shell, not uploaded documents. Do not clear browser site data as an upgrade step.

## Publishing

The workflow validates the build and runs the Node tests, direct HTTP tests and eight library examples before uploading `_site/` and deploying it using GitHub's Pages actions. Deployment is restricted to `main`; pull requests build/test without deploying. GitHub Pages must be enabled with **Source: GitHub Actions** in repository Settings → Pages. The workflow uses `contents: read`, with `pages: write` and `id-token: write` only for deployment. No third-party hosting, application secrets or production data are included.

This static host does not reproduce the Node server's HTTP response security headers. Do not treat a public demo deployment as production security or identity-provider qualification. UI fixture results and past device-testing limits are documented separately in `docs/TESTING.md`.
