# Authenticated recipient delivery

The member workspace and recipient portal are separate authentication domains in the same application server. The recipient UI is `/portal.html`; `dist/portal.html` is a self-contained UI build but still requires the same-origin team backend. A local-only HTML file does not create a secure portal service.

## Issue a package

A member first creates and issues a transmittal with a frozen list of source revision IDs and hashes and named recipient emails. In **Recipient portal**, create a delivery for one of those recipients and choose its lifetime (1–90 days). The member must have project share permission and share/download rights to every included document.

The server returns a private one-time invitation URL. **No email is sent.** Distribute the link through your approved secure channel. The secret is in the URL fragment, not stored as plaintext by the server, and cleared from the recipient address bar when read. Treat it as a bearer enrollment credential; do not paste it into public tickets or analytics.

A new recipient chooses a password; an existing recipient must provide the current account password when accepting an invitation. Enrollment consumes the invitation transactionally and prevents reuse. Recipient cookies are separate from member cookies, HttpOnly, SameSite=Strict and scoped to `/api/portal`; Secure is added for configured HTTPS.

## Recipient workflow

After authentication, the portal lists only that account's nonexpired, nonrevoked deliveries and their pinned file manifests. Downloads return the original frozen bytes even after the member workspace checks in a new current revision. Cross-package/foreign document IDs are rejected. There is no project browser, member directory, workspace audit or arbitrary original-blob endpoint for recipients.

Acknowledgment records account email, time, source hashes and a note. Repeated acknowledgment returns the same receipt rather than rewriting it. Members can inspect the receipt and revoke further access. Expiry and revocation are checked on every recipient request; they cannot recall a file already downloaded.

## Identity and evidence limits

The account authenticates a password set by a holder of the invitation. This is **not independent email verification or proof of the recipient's real-world identity**. No email sending, MFA, recovery, qualified electronic signature, certified delivery service or regulatory receipt claim is made. Access is to the frozen issued package, not a live inherited project membership; revoke the delivery explicitly when withdrawing it.

Credentials, delivery state and hashed four-hour recipient sessions reside in `operations.sqlite` and survive restart until expiry. The private database is required in backups. Protect the member administrator because authorized sharing creates external access independently of local profile simulation.

## Tested versus untested

Real HTTP tests exercised named-recipient matching, single-use enrollment, separate cookies, workspace/portal isolation, original pinned downloads after check-in, idempotent receipts, origin enforcement, restart persistence and revocation. The separate browser component harness uses an explicitly labeled fixture transport for four UI checks. Normal navigated-browser cookie flows, live email/identity proofing, accessibility, attack testing and deployment TLS remain unqualified.
