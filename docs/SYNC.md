# Session-bound cloud synchronization

Civora 0.2 adds a continuous **while-open-and-authorized** synchronization loop over immutable full-workspace snapshots. It does not keep running after the application closes, renew provider sessions silently, upload only changed file chunks or turn cloud-drive storage into a transactional multi-user database.

## Configure

Authorize your own Google Drive, Microsoft OneDrive/SharePoint or Dropbox registration under **Storage & connections**. Provider setup and permissions are in CONNECTORS.md. No account is connected automatically. Choose **Cloud synchronization**, select the provider, a 3–48 character lowercase channel (`letters`, `digits`, `_`, `-`) and mode, then start. Default interval is 30 seconds; retry backs off after errors.

Browser-local repositories permit two-way synchronization. Team HTTP repositories permit **outgoing backup only**. Only an administrator-visible complete workspace may be synchronized; filtered member projections cannot become authoritative backups. A server is never overwritten by incoming browser synchronization.

Tokens are held in memory. Reload, token expiry or lost consent requires authorization again. Checkpoints contain channel/history information, not OAuth tokens. Google app-data storage is tied to the account/application; other providers enforce their destination sharing policies. Use an approved account and channel for the data classification.

## What a cycle does

The engine lists immutable snapshots named `civora-sync-<channel>-<id>.json`, validates the history graph and computes canonical workspace fingerprints. Each commit contains protocol version, commit ID, parent IDs, writer ID and fingerprint. File bytes and backup relationships are verified before import.

An unchanged local workspace can fast-forward from a single remote descendant; a local change can append a new snapshot after the known head. Concurrent remote heads, unrelated history or simultaneous local/remote changes stop automatic application. The UI requires an explicit choice to retain local content or a named remote version. Resolution retains previous snapshots and joins parent history rather than silently deleting the losing copy.

This is **whole-snapshot selection, not field-level merge**. A chosen replacement can discard the current local changes from the active workspace even though old remote snapshots remain. Review/export before resolving. Revision compare-and-swap rejects a replacement if another local command committed meanwhile.

Missing parents, duplicate commit IDs, cycles, tampered checksums, missing synchronized bases and listing safety caps stop processing. Pause prevents subsequent guarded side effects; it cannot undo an upload already accepted by a provider or a local transaction already committed. History checksums detect corruption, not malicious rewriting by an authorized provider/storage administrator. Snapshots are not signed or end-to-end encrypted.

## Limits and verification

At most 500 snapshots per channel and fewer than 2,000 listed provider files; rotate/archive channels before hitting safety caps. Full snapshots have 90 MiB unique source-content and 120 MiB serialized limits. There is no remote pruning/retention daemon, resumable multi-GB transfer or incremental object replication.

Twelve algorithm tests exercise immutable publication/deduplication, verified pull, divergence, explicit conflict resolution, tampering, missing/cyclic history, backup-only mode, pause, reauthorization and incoming-team protection with deterministic fixture providers. **No live registered provider account was exercised.** OAuth consent, CORS, tenant restrictions, quota, expiry, concurrent real-account devices and recovery must be qualified before use with important content.
