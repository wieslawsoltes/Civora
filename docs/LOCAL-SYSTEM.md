# Local system support — Civora 0.6.0

Civora has three distinct local storage choices. They are not interchangeable authentication mechanisms.

| Mode | Where controlled data lives | Filesystem access | Identity |
|---|---|---|---|
| Browser-local | IndexedDB for this browser origin | Explicit imports/downloads; optionally approved working folders | Local profiles are a workflow sandbox |
| Browser folder workspace | `.civora/` inside a directory you choose | File System Access directory capability | The OS/browser grant controls access; profiles are not authentication |
| Authenticated localhost | SQLite, original blobs and operations files below the configured private data directory | Only explicitly configured roots and user IDs | Real member sign-in and existing document ACLs |

All modes retain original file bytes. Native CAD format equivalence is not added by local storage: an original DWG, DGN or RVT can be kept and opened with an explicitly configured installed application, but Civora does not include those native authoring engines.

## 1. Start the localhost edition

Install Node.js 22.13 or later. Extract the complete source package, enter its `civora` directory, then run:

```sh
npm run local
```

The default address is `http://127.0.0.1:8787`. Use that exact address, not an alternate hostname or LAN address. The initial administrator email is `admin@civora.local`; the new-install password is generated and printed once in the terminal unless `CIVORA_ADMIN_PASSWORD` was supplied. Existing credentials are not reset on restart. Sign in and open **Local system**.

The default private database directory is `data-local/`. The default filesystem root is `data-local/local-files/`, assigned only to the initial administrator. Create a project before importing controlled documents. The localhost workspace is initially empty; it does not import the browser demonstration automatically.

There is no npm dependency installation for the default SQLite/local build. Nothing needs OAuth or an internet account. External providers and databases remain optional.

```sh
# Select separate disk paths and optionally open the browser.
npm run local -- --data "/absolute/path/to/private-data" --files "/absolute/path/to/working-files" --open

# A different port and explicit root/application configuration.
npm run local -- --data "/absolute/path/to/private-data" --roots "/absolute/path/to/local-roots.json" --applications "/absolute/path/to/local-applications.json" --port 8788

# Display the supported arguments.
npm run local -- --help
```

Windows example (Command Prompt or PowerShell):

```text
npm run local -- --data "C:\Civora\PrivateData" --files "C:\Civora\WorkingFiles"
```

The included `start-local.cmd`, `start-local.command` and `start-local.sh` launch this same service and request a browser window. They require Node on PATH. They are launch scripts, not signed installers or OS services. Keep the terminal/process running; stop with Ctrl+C. Automatic OS startup and app-store packaging are not installed for you. Windows/macOS execution and OS browser launching have not been qualified in this environment.

## 2. Scope filesystem roots

Root configuration is read at startup from an administrator-owned JSON file. It is not writable through an application settings endpoint.

```json
{
  "version": 1,
  "roots": [
    {
      "id": "working",
      "label": "Engineering working files",
      "path": "/absolute/path/to/working-files",
      "userIds": ["u-admin"],
      "readOnly": false,
      "allowNativeOpen": false,
      "allowReveal": false
    },
    {
      "id": "reference",
      "label": "Reference library",
      "path": "/absolute/path/to/reference-library",
      "userIds": ["u-admin"],
      "readOnly": true,
      "allowNativeOpen": false,
      "allowReveal": false
    }
  ]
}
```

Replace paths and user IDs deliberately. Read-only roots must already exist. A new workspace member receives **no local roots**. Root grants do not implicitly follow the member's role or project membership. An administrator does not automatically gain a root omitted from their explicit grant. Use an individual working root per user where possible.

**A root grant exposes its contents to that user, not only files associated with currently readable documents.** Project/folder/document ACLs still govern controlled downloads and check-in. They cannot recall an already exported local copy. Do not share a working root with someone who should not have access to all of its files. Local workspace metadata inside a granted root is also just local data, not protected identity state.

The service rejects roots containing its private data directory (including resolved aliases). Do not expose system directories, the application installation, configuration/secrets, or unrelated user documents. Configuration files and executables are trusted administrator inputs. Protect them with OS ownership and permissions.

The service accepts only loopback peers, the exact Host/Origin, normal member sessions, and non-cross-site requests. It does not enable CORS access for arbitrary websites and will not bind local integration on a public/LAN interface. The ordinary team edition, `npm run server`, does not enable `/api/local` filesystem endpoints by default.

## 3. Browser-approved folders

Serve Civora with `npm start`, or use another appropriate localhost/HTTPS host. Open **Local system → Connect folder** or **Connect read-only**. Approve the browser prompt yourself. The app does not enumerate drives or discover folders silently.

Compatible browsers can remember the directory handle in a separate IndexedDB bookmark store; no absolute browser filesystem path or directory contents are stored in the bookmark. Reconnect from **Recent browser folders** after restarting. The browser may require renewed permission. **Forget** removes the stored handle; browser site permissions can additionally be revoked in browser settings. **Disconnect** stops Civora's use of that mount; an active folder repository must first be switched to another storage mode.

Direct directory pickers are not available in every browser. **Import folder**, file drag-and-drop, and ZIP/download export are explicit fallbacks, not an emulated writable disk mount. An opaque/file origin can also disable secure APIs or durable storage; the UI identifies temporary-memory mode. Use localhost/HTTPS instead of relying on opening an HTML file directly.

### Put the whole workspace on disk

Select a browser folder, then open **Workspace on disk**:

- **Create empty on disk** initializes a new workspace without overwriting an existing one.
- **Copy current workspace to disk** copies the current local workspace and all referenced original revisions. The original browser workspace remains intact. This operation is blocked for a team repository; explicitly export authorized documents instead.
- **Open folder workspace** loads an existing workspace in the selected folder. An already remembered folder is not silently reopened at startup.

The format is documented, inspectable JSON plus immutable original bytes:

```text
.civora/
  format.json              format version and repository identity
  HEAD.json                hash pointer to the active metadata checkpoint
  commits/<sha256>.json     immutable metadata checkpoints
  blobs/<sha256>            immutable original content
.civora-work/<key>.json     per-workspace, per-user working-copy links
.civora-trash/<id>/         recoverable replaced or removed local bytes
```

Writes first persist and verify content, then a checkpoint, then the guarded HEAD pointer. A corrupted/missing original or damaged checkpoint is an error, not a reason to reseed or silently reset data. **Verify all originals** checks hashes and revision sizes. **Checkpoint recovery** explicitly chooses a valid checkpoint, checks original content, and creates a new monotonic workspace revision. A staged checkpoint may exist without ever having been committed; the recovery view does not silently choose one.

Writable browser folder repositories require Web Locks. Those locks coordinate cooperating tabs on the same browser origin, not another browser profile, another origin, native applications or another machine. Do not edit `.civora/` manually or operate multiple independent writers on the same workspace folder. The localhost SQLite edition is the appropriate shared-session mode.

## 4. Native working-copy workflow

1. Connect a folder or select an authorized localhost root. Choose **Working copies → Check out to disk**, or **Work on disk** in a document inspector. Select a document, relative path and checkout/copy mode. The original hash is verified, an exclusive application checkout is acquired when requested, and an existing destination is never silently replaced.
2. Edit the displayed working file with your own installed tool. The local file inspector can copy its path and edit bounded text. Use **Watch changes** or **Scan now** to compare bytes with the recorded baseline. Watching polls while the application remains open; it is not a daemon or an auto-check-in service.
3. **Check in** asks for a new revision and note. It checks the current document revision, your lock, live permissions and the exact local hash reviewed in the dialog. Successful check-in creates a controlled revision and releases the lock. Original MIME metadata is retained instead of adopting an HTTP octet-stream type.

Changed local and remote versions are a conflict, not an automatic winner. **Refresh** explicitly retains changed local bytes in a separate `.local-<timestamp>` file before replacing the working copy with the selected controlled original. **Unlink** retains disk bytes and does not implicitly release a document checkout.

A downloaded copy is not remotely revocable. A revoked user may still have previously exported files. Access revocation blocks future controlled downloads/check-in; it does not make an OS copy disappear.

### Native application launching

Opening an installed application is disabled by default and unavailable from an ordinary browser-only folder connection. For the localhost mode, supply an explicit application configuration and enable `allowNativeOpen` on the relevant root:

```json
{
  "version": 1,
  "applications": [
    {
      "extensions": [".txt", ".csv"],
      "executable": "/absolute/path/to/your/approved/editor",
      "args": ["{file}"]
    }
  ]
}
```

The executable must exist. Exactly one argument must equal `{file}`. The service selects the extension allowlist, verifies the reviewed file hash, and starts the executable with separate arguments and **no shell**. The user confirms each launch. No executable or arbitrary command is supplied by the browser. Configuration changes require a restart.

This is a launch contract, not a native editor plug-in, macro detector or sandbox. Opening a hostile CAD/Office file can expose vulnerabilities or active content in that application. Avoid shell/interpreter associations and use trusted, appropriately configured native tools. `allowReveal` separately permits revealing the containing folder through the OS. Read-only roots cannot launch a native editor.

## 5. Transfers, editing and recovery

The explorer lists and searches the selected folder, creates folders/files, adds original files, inspects/downloads files, and renames/moves files using copy/verify/delete. Existing targets are not overwritten. Folder-wide rename, recursive directory deletion and OS trash integration are not implemented. Trash here is Civora's own recovery directory, not the Windows Recycle Bin or macOS Trash.

Folder input and modern/legacy directory drops preserve file paths. Legacy dropped-directory readers drain every batch. Imports detect portable case/Unicode-normalization collisions and produce per-file results. An import is a sequence of audited commands, not a whole-tree transaction; empty directories without files are not materialized. Cancellation retains successful work and records partial results.

Project exports pin each original revision at the start and write a manifest into a new destination. ZIP is also available without a writable folder API. Uncontrolled working edits are not substituted for the pinned revision. Ordinary workspace/cloud backups do not include arbitrary working folders, recovery files or native editor sidecars.

The local text editor recognizes UTF-8 (optional BOM), UTF-16LE/BE with BOM, and CRLF/LF/CR. It rejects unsupported/binary content and retains encoding/BOM/newline conventions. Mixed newline files are explicitly normalized to their predominant convention on editing. Other formats remain byte-exact and use native applications.

Overwritten/trashed file content is retained with a checksum. Restore verifies that content and requires a new/nonexisting destination. Native replacement failures do not use a destructive unlink fallback. A failed copy/move can leave a recoverable duplicate; inspect the reported paths before retrying.

## 6. Persistence, mounted drives and backup

The native adapter uses bounded reads, symlink/hardlink/special-file rejection, temporary files, file synchronization, no-clobber creation, checksum guards and directory synchronization where available. A configured root is pinned by canonical path and filesystem identity. These protections target HTTP clients, not a malicious process with the same OS account racing filesystem calls.

Writable native roots have a process/host lock. After an unclean exit, stop all Civora instances and verify the recorded process is absent before using `--recover-locks`. Automatic recovery refuses another/unknown host's lock or a live PID. Do not run two services against one private SQLite data directory, even with separate working roots.

Mounted local/removable/network paths can be configured where the OS exposes them as normal directories. **They have not been qualified here.** No-clobber native creation uses hard links; filesystems without that operation fail safely rather than falling back to destructive replacement. FAT/exFAT, SMB/NFS, removable media and Windows busy-file behavior need platform-specific testing. Do not treat this as a multi-host shared-folder database; keep SQLite on suitable local storage.

For a complete offline backup, close browser writers and native editors, stop the server cleanly, and copy the entire private data directory **plus each working/folder-workspace root**, root/application configuration and any external database backup. Preserve `.civora/`, `.civora-work/`, `.civora-trash/` and native sidecars. Do not copy only a live SQLite file and assume its WAL was captured. Test a restore to an isolated directory before replacing live data. Use OS encryption and backup access controls; this release adds no application-layer disk encryption or key management.

## Limits and qualification

50 MiB per file; 2 MiB text editing; 5,000 files per import; 10,000 scan entries; 48 relative path segments; 200 characters per segment; 1,800 characters per relative path; 32 MiB checkpoint metadata; 1,000 entries in the recovery checkpoint view; 1,000 visible trash records; 180 MiB original content for project ZIP export. Individual folder transfers avoid the existing 90 MiB whole-workspace browser-backup limit, but this is not a streamed multi-GB document implementation. Whole-workspace metadata, sequential operations and global revision checks remain scalability boundaries.

Real Linux filesystem/HTTP tests and isolated browser-adapter/UI fixtures pass. Actual browser permission prompts, IndexedDB handle persistence, Web Locks across real tabs/origins, service-worker behavior, native Windows/macOS execution, mounted drives, OS app UI interaction, disk-full/power-failure durability and independent security qualification remain unverified. See TESTING.md and SECURITY-REVIEW.md.

## Primary API references

- https://developer.chrome.com/docs/capabilities/web-apis/file-system-access
- https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker
- https://nodejs.org/api/fs.html

These document APIs and platform caveats; they are not a qualification of this implementation.

## Working-copy repository identity

New workspaces have unique IDs. Old 0.1/0.2 workspaces can retain the legacy `civora-workspace` ID without a destructive migration. Working-copy indexes additionally include the repository identity and account: a folder repository's persistent format ID, a server's canonical endpoint, or the browser origin plus IndexedDB name. Thus separate repositories copied from the same backup do not share a tracking ledger. Memory repositories are session-scoped. Reopening the same persistent repository restores the same ledger; opening the same database at another endpoint deliberately uses a different namespace. Disk copies remain present in either case and are not silently adopted or deleted.

Third-party repositories may pass a stable, nonsecret `namespace` option to `WorkingCopyManager`. An application must not reuse a namespace for unrelated repositories. A damaged ledger or a changed repository/account fails closed without deleting working files. Exported documents are still usable outside Civora independently of their ledger.
