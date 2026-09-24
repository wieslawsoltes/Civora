# Civora publishing handoff

The application source, local server, tests, standalone bundles and GitHub Pages build are included.
The connector-based source import was not completed; this package is not evidence of a remote deployment.

## Publish from an authenticated checkout

1. Clone https://github.com/wieslawsoltes/Civora into a new directory.
2. Copy the contents of this archive's `civora/` directory into that checkout, preserving its `.git` directory.
3. Use Node.js 22.13 or later. Run:

```sh
npm run build:pages
npm run check
npm test
npm run test:pages
node tests/static-http.mjs
git add -A
git commit -m "feat: import complete Civora 0.10 application and Pages build"
git push origin main
```

The push is non-forcing and preserves existing repository history. If it is rejected, fetch and reconcile remote changes before retrying.

In GitHub Settings > Pages, select **GitHub Actions** as the source. The included **Build, test and deploy Pages** workflow builds and tests the application and publishes only `_site/`.
The expected URL after a successful deployment is https://wieslawsoltes.github.io/Civora/ .

GitHub Pages is the browser-only edition: it cannot run the Node team server or the localhost filesystem service. Local demo profile switching is not authentication. Database credentials must never be added to the static site.
Do not clear browser site data; local documents may reside there. Data on a previous origin does not automatically migrate to the Pages origin.
