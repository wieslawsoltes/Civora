/** OAuth tokens stay in memory. Connectors only run after an explicit user action. */
const LIMIT = 120 * 1024 * 1024;
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
export function randomSecret() { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
export async function pkceChallenge(verifier) { return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))); }
export async function providerRequest(url, token, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } }); }
  catch { throw new Error('Provider request failed. Check the network, registered browser origin, and provider CORS policy.'); }
  if (!response.ok) {
    let message = ''; try { const body = await response.json(); message = body.error?.message || body.error_description || body.error_summary || (typeof body.error === 'string' ? body.error : ''); } catch {}
    throw new Error(response.status === 401 ? 'Your provider session expired. Connect again; the local workspace is unchanged.' : `Provider returned ${response.status}${message ? `: ${String(message).slice(0, 300)}` : ''}`);
  }
  return response;
}
export class OAuthPKCE {
  constructor({ clientId, authorizeUrl, tokenUrl, scope = '', redirectUri, extra = {} }) { Object.assign(this, { clientId, authorizeUrl, tokenUrl, scope, redirectUri, extra }); }
  async connect() {
    if (!this.clientId?.trim()) throw new Error('Enter the public OAuth client ID from your provider app registration. Never enter a client secret.');
    if (!['https:', 'http:'].includes(location.protocol)) throw new Error('OAuth requires the hosted app on HTTPS or localhost, not a file:// URL.');
    const redirect = new URL(this.redirectUri || new URL('oauth-callback.html', location.href).href);
    if (redirect.origin !== location.origin || redirect.hash || redirect.search) throw new Error('The callback must be on this app’s origin, without a query or fragment.');
    const popup = window.open('about:blank', 'civora-oauth', 'popup,width=560,height=730');
    if (!popup) throw new Error('Allow popups for this site, then connect again.');
    const verifier = randomSecret(), state = randomSecret(), challenge = await pkceChallenge(verifier);
    const auth = new URL(this.authorizeUrl);
    for (const [k, v] of Object.entries({ client_id: this.clientId.trim(), response_type: 'code', redirect_uri: redirect.href, state, code_challenge: challenge, code_challenge_method: 'S256', ...(this.scope ? { scope: this.scope } : {}), ...this.extra })) auth.searchParams.set(k, v);
    const codePromise = new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timeout); clearInterval(interval); window.removeEventListener('message', receive); try { popup.close(); } catch {} };
      const receive = event => {
        if (event.origin !== location.origin || event.source !== popup || event.data?.type !== 'civora-oauth' || event.data.state !== state) return;
        cleanup(); if (event.data.error) reject(new Error(String(event.data.error).slice(0, 300))); else if (typeof event.data.code === 'string') resolve(event.data.code); else reject(new Error('Missing OAuth authorization code.'));
      };
      const timeout = setTimeout(() => { cleanup(); reject(new Error('Authorization timed out. Please connect again.')); }, 180000);
      const interval = setInterval(() => { if (popup.closed) { cleanup(); reject(new Error('Authorization window was closed.')); } }, 500);
      window.addEventListener('message', receive);
    });
    popup.location.replace(auth.href);
    const code = await codePromise;
    const response = await fetch(this.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: this.clientId.trim(), code, redirect_uri: redirect.href, code_verifier: verifier, ...(this.scope ? { scope: this.scope } : {}) }) });
    const data = await response.json(); if (!response.ok || !data.access_token) throw new Error(data.error_description || 'Token exchange failed. Verify the client ID, callback, and public-client / SPA configuration.');
    this.token = data.access_token; this.expiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    // No refresh token is retained. Reconnect explicitly when the access token expires.
    return this.token;
  }
  disconnect() { this.token = null; this.expiresAt = 0; }
}
function assertToken(connector) { if (!connector.token || Date.now() >= connector.expiresAt) throw new Error('Connect this provider first. Tokens are not retained after reload.'); }
const snapshotName = backup => backup?.sync ? (()=>{if(!/^[a-z0-9_-]{3,48}$/.test(backup.sync.channel)||!/^[a-f0-9-]{36}$/.test(backup.sync.commitId))throw new Error('Invalid sync filename.');return `civora-sync-${backup.sync.channel}-${backup.sync.commitId}.json`;})() : `civora-${new Date().toISOString().replaceAll(':', '-')}-${crypto.randomUUID().slice(0, 8)}.json`;
async function readSnapshot(response) {
  if (!response.ok) throw new Error(`Snapshot download failed (${response.status}).`);
  if (Number(response.headers.get('Content-Length')) > LIMIT) throw new Error('Snapshot exceeds the 120 MiB download limit.');
  const chunks = []; let length = 0;
  if (response.body) {
    const reader = response.body.getReader();
    try { while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > LIMIT) { await reader.cancel(); throw new Error('Snapshot exceeds the 120 MiB download limit.'); } chunks.push(part.value); } }
    finally { reader.releaseLock(); }
  } else { const bytes = new Uint8Array(await response.arrayBuffer()); length = bytes.length; if (length > LIMIT) throw new Error('Snapshot is too large.'); chunks.push(bytes); }
  const text = await new Blob(chunks).text();
  try { return JSON.parse(text); } catch { throw new Error('The selected cloud file is not valid snapshot JSON.'); }
}
function snapshotBody(backup) { const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' }); if (blob.size > LIMIT) throw new Error('Cloud snapshots are limited to 120 MiB.'); return blob; }
export class MicrosoftStorage {
  constructor(config = {}) { this.config = config; this.name = config.driveId ? 'SharePoint / Microsoft drive' : 'OneDrive'; this.kind = 'microsoft'; }
  async connect() {
    const tenant = this.config.tenant || 'common'; if (!/^[a-zA-Z0-9.-]+$/.test(tenant)) throw new Error('Invalid Microsoft tenant.');
    this.auth = new OAuthPKCE({ clientId: this.config.clientId, authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`, tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, scope: this.config.driveId ? 'Files.ReadWrite' : 'Files.ReadWrite.AppFolder', redirectUri: this.config.redirectUri, extra: { response_mode: 'query' } });
    this.token = await this.auth.connect(); this.expiresAt = this.auth.expiresAt;
    this.base = this.config.driveId ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(this.config.driveId)}` : 'https://graph.microsoft.com/v1.0/me/drive';
    if (this.config.driveId) { if (!this.config.folderId) throw new Error('SharePoint mode requires a destination folder item ID.'); this.folderId = this.config.folderId; }
    else this.folderId = (await (await providerRequest(`${this.base}/special/approot`, this.token)).json()).id;
    await this.list(); return this;
  }
  async list() {
    assertToken(this); const items = []; let url = `${this.base}/items/${encodeURIComponent(this.folderId)}/children?$top=200&$select=id,name,size,lastModifiedDateTime`;
    while (url && items.length < 2000) { if (new URL(url).origin !== 'https://graph.microsoft.com') throw new Error('Unexpected pagination origin.'); const data = await (await providerRequest(url, this.token)).json(); items.push(...(data.value || []).filter(x => /^civora-.*\.json$/.test(x.name)).map(x => ({ id: x.id, name: x.name, size: x.size, date: x.lastModifiedDateTime }))); url = data['@odata.nextLink']; }
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }
  async save(backup) { assertToken(this); const name = snapshotName(backup); const data = await (await providerRequest(`${this.base}/items/${encodeURIComponent(this.folderId)}:/${encodeURIComponent(name)}:/content`, this.token, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-None-Match': '*' }, body: snapshotBody(backup) })).json(); return { id: data.id, name: data.name }; }
  async load(id) {
    assertToken(this);
    const item = await (await providerRequest(`${this.base}/items/${encodeURIComponent(id)}?$select=id,@microsoft.graph.downloadUrl`, this.token)).json();
    const url = new URL(item['@microsoft.graph.downloadUrl']);
    if (url.protocol !== 'https:') throw new Error('Invalid Microsoft download URL.');
    // Do not forward the OAuth token to the preauthenticated content URL.
    const response = await fetch(url.href, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(`Snapshot download failed (${response.status}).`);
    return readSnapshot(response);
  }
  disconnect() { this.auth?.disconnect(); this.token = null; }
}
let googleSDKPromise;
async function loadGoogleSDK() {
  if (globalThis.google?.accounts?.oauth2) return;
  if (!googleSDKPromise) googleSDKPromise = new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.onload = resolve; script.onerror = () => { googleSDKPromise = null; script.remove(); reject(new Error('Could not load Google Identity Services. Check your network or content blocker.')); }; document.head.append(script); });
  await googleSDKPromise;
}
export class GoogleDriveStorage {
  constructor(config = {}) { this.config = config; this.name = 'Google Drive'; this.kind = 'google'; }
  async connect() {
    if (!this.config.clientId) throw new Error('Enter your Google web application OAuth client ID.');
    await loadGoogleSDK();
    const data = await new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({ client_id: this.config.clientId, scope: 'https://www.googleapis.com/auth/drive.appdata', callback: result => result.error ? reject(new Error(result.error_description || result.error)) : resolve(result), error_callback: result => reject(new Error(result.type || 'Google authorization failed.')) });
      client.requestAccessToken({ prompt: 'consent' });
    });
    this.token = data.access_token; this.expiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000; await this.list(); return this;
  }
  async list() {
    assertToken(this); const items = []; let pageToken = '';
    do { const params = new URLSearchParams({ spaces: 'appDataFolder', q: 'trashed = false', fields: 'nextPageToken,files(id,name,size,modifiedTime)', pageSize: '100', ...(pageToken ? { pageToken } : {}) }); const data = await (await providerRequest(`https://www.googleapis.com/drive/v3/files?${params}`, this.token)).json(); items.push(...(data.files || []).filter(x => /^civora-.*\.json$/.test(x.name)).map(x => ({ id: x.id, name: x.name, size: Number(x.size), date: x.modifiedTime }))); pageToken = data.nextPageToken; } while (pageToken && items.length < 2000);
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }
  async save(backup) {
    assertToken(this); const name = snapshotName(backup), boundary = `civora_${randomSecret()}`;
    const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, JSON.stringify({ name, parents: ['appDataFolder'] }), `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`, snapshotBody(backup), `\r\n--${boundary}--\r\n`]);
    const data = await (await providerRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', this.token, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })).json(); return data;
  }
  async load(id) { assertToken(this); return readSnapshot(await providerRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, this.token)); }
  disconnect() { if (this.token && globalThis.google?.accounts?.oauth2) google.accounts.oauth2.revoke(this.token, () => {}); this.token = null; }
}
export class DropboxStorage {
  constructor(config = {}) { this.config = config; this.name = 'Dropbox'; this.kind = 'dropbox'; }
  async connect() {
    this.auth = new OAuthPKCE({ clientId: this.config.clientId, authorizeUrl: 'https://www.dropbox.com/oauth2/authorize', tokenUrl: 'https://api.dropboxapi.com/oauth2/token', redirectUri: this.config.redirectUri, extra: { token_access_type: 'online' } });
    this.token = await this.auth.connect(); this.expiresAt = this.auth.expiresAt; await this.list(); return this;
  }
  async rpc(method, args) { assertToken(this); return (await providerRequest(`https://api.dropboxapi.com/2/${method}`, this.token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) })).json(); }
  async list() {
    let data = await this.rpc('files/list_folder', { path: '', recursive: false, limit: 200 }), items = [...data.entries];
    while (data.has_more && items.length < 2000) { data = await this.rpc('files/list_folder/continue', { cursor: data.cursor }); items.push(...data.entries); }
    return items.filter(x => x['.tag'] === 'file' && /^civora-.*\.json$/.test(x.name)).map(x => ({ id: x.id, name: x.name, size: x.size, date: x.server_modified })).sort((a, b) => b.date.localeCompare(a.date));
  }
  async save(backup) { assertToken(this); const name = snapshotName(backup); const data = await (await providerRequest('https://content.dropboxapi.com/2/files/upload', this.token, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({ path: '/' + name, mode: 'add', autorename: false, mute: true }) }, body: snapshotBody(backup) })).json(); return { id: data.id, name: data.name }; }
  async load(id) { assertToken(this); return readSnapshot(await providerRequest('https://content.dropboxapi.com/2/files/download', this.token, { method: 'POST', headers: { 'Dropbox-API-Arg': JSON.stringify({ path: id }) } })); }
  disconnect() { this.auth?.disconnect(); this.token = null; }
}
export const CONNECTORS = { microsoft: MicrosoftStorage, google: GoogleDriveStorage, dropbox: DropboxStorage };
