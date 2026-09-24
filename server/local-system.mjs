import { hostname } from 'node:os';
import { readFile, open, unlink, realpath, lstat } from 'node:fs/promises';
import { join, isAbsolute, extname, dirname, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { NodeDirectoryFS } from './local-filesystem.mjs';
import { localError, relativePath } from '../packages/filesystem/index.js';
import { fromBase64 } from '../packages/storage/index.js';
const loopback = address => address === '::1' || address === '127.0.0.1' || address === '::ffff:127.0.0.1';
async function launch(executable, args) {
  return new Promise((resolve,reject) => { const child = spawn(executable, args, { shell: false, stdio: 'ignore', detached: true, windowsHide: false }); child.once('error', reject); child.once('spawn', () => { child.unref(); resolve({ launched: true }); }); });
}
export async function createLocalSystem({ enabled, dataDir, origin, adminId, readJSON, json, ops, configFile, applicationsFile, recoverLocks = false }) {
  if (!enabled) return { enabled: false, handle: async () => false, close: async () => {} };
  const host = new URL(origin).hostname;
  if (!['127.0.0.1','localhost','[::1]'].includes(host)) throw new Error('Local system integration must be served on loopback, not a LAN or public interface.');
  const config = configFile ? JSON.parse(await readFile(configFile,'utf8')) : { version: 1, roots: [{ id: 'working', label: 'My local working files', path: join(dataDir, 'local-files'), userIds: [adminId] }] };
  if (config.version !== 1 || !Array.isArray(config.roots) || !config.roots.length || config.roots.length > 20) throw new Error('Local roots config requires version 1 and 1–20 roots.');
  const apps = applicationsFile ? JSON.parse(await readFile(applicationsFile,'utf8')) : { version: 1, applications: [] };
  if (apps.version !== 1 || !Array.isArray(apps.applications) || apps.applications.length > 50) throw new Error('Invalid local applications configuration.');
  for (const app of apps.applications) {
    if (!isAbsolute(app.executable || '') || !Array.isArray(app.extensions) || app.extensions.some(e => !/^\.[a-z0-9]{1,12}$/.test(e)) || !Array.isArray(app.args) || app.args.length > 20 || app.args.some(a => typeof a !== 'string' || a.length > 1000) || app.args.filter(a => a === '{file}').length !== 1) throw new Error('Native applications require an absolute executable, extension allowlist, and exactly one {file} argument.');
    app.executable = await realpath(app.executable); if (!(await lstat(app.executable)).isFile()) throw new Error('Native executable must be a file.');
  }
  const roots = new Map(), locks = [];
  try {
    for (const input of config.roots) {
      if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(input.id || '') || roots.has(input.id) || !isAbsolute(input.path || '') || !Array.isArray(input.userIds) || !input.userIds.length || input.userIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(id))) throw new Error('Every root needs a unique portable ID, absolute path, and explicit userIds.');
      const protectedData = resolve(dataDir), rootPath = resolve(input.path); if(protectedData === rootPath || protectedData.startsWith(rootPath + sep)) throw new Error('A local root must not contain the protected server data directory.');
      const fs = await new NodeDirectoryFS(input.path, { readOnly: !!input.readOnly, label: String(input.label || input.id).slice(0,120) }).open();
      const realData=await realpath(dataDir);if(fs.root===realData||realData.startsWith(fs.root+sep))throw new Error('A local root must not contain the protected server data directory through aliases.');
      if (!fs.readOnly) {
        const lockPath = join(fs.root, '.civora-local.lock'), token = randomUUID();
        let fd; try { fd = await open(lockPath,'wx',0o600); } catch (error) {
          if (error.code !== 'EEXIST') throw error;
          const info = await lstat(lockPath); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error('Unsafe local root lock. Review the directory manually.');
          const old = JSON.parse(await readFile(lockPath, 'utf8')); if(old.hostname!==hostname())throw new Error('The root lock belongs to another or unknown host. Review it manually; automatic recovery is refused.'); let alive = true;
          if (!Number.isSafeInteger(old.pid) || old.pid <= 0) throw new Error('Invalid root lock. Review it manually.');
          try { process.kill(old.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
          if (alive || !recoverLocks) throw new Error(`Local root ${input.id} is locked. Stop the other instance, or use --recover-locks after a crash and verifying the old process is absent.`);
          await unlink(lockPath); fd = await open(lockPath,'wx',0o600);
        }
        try { await fd.writeFile(JSON.stringify({ pid: process.pid, hostname:hostname(), token, startedAt: new Date().toISOString() })); await fd.sync(); } finally { await fd.close(); }
        locks.push({ path: lockPath, token });
      }
      roots.set(input.id, { ...input, fs, native: !!input.allowNativeOpen && apps.applications.length > 0, reveal: input.allowReveal === true });
    }
  } catch (error) { for (const lock of locks) await unlink(lock.path).catch(() => {}); throw error; }
  const allowed = (root, user) => root && root.userIds.includes(user.id);
  function safeRequest(req) { return loopback(req.socket.remoteAddress) && req.headers.host === new URL(origin).host && (!req.headers.origin || req.headers.origin === origin) && req.headers['sec-fetch-site'] !== 'cross-site'; }
  async function handle(req,res,url,who) {
    if (!url.pathname.startsWith('/api/local')) return false;
    if (!safeRequest(req)) throw localError('Local system access requires this exact loopback origin.', 'FORBIDDEN');
    if (req.method === 'GET' && url.pathname === '/api/local/status') {
      return json(res,200,{ enabled: true, platform: process.platform, node: process.version, auth: 'server-session', limitBytes: 50 * 1024 * 1024, roots: [...roots.values()].filter(r => allowed(r,who.user)).map(r => ({ id: r.id, label: r.fs.label, readOnly: r.fs.readOnly, native: r.native, reveal: r.reveal, location:r.fs.root })), watch: 'client reconciliation polling', version: '0.3.0' }), true;
    }
    const match = url.pathname.match(/^\/api\/local\/roots\/([a-z0-9_-]+)\/(list|stat|file|write|mkdir|move|trash|restore|open|reveal|disk)$/);
    if (!match) throw localError('Unknown local system endpoint.', 'NOT_FOUND');
    const root = roots.get(match[1]), action = match[2]; if (!allowed(root,who.user)) throw localError('Local root not found or not granted to this account.', 'NOT_FOUND');
    const fs = root.fs;
    const publicPath = value => { relativePath(value || '',{empty:true}); if(String(value).split('/').some(p => /^\.civora-(?:local\.lock|tmp-)/i.test(p))) throw localError('Local service control files are reserved.', 'FORBIDDEN'); return value; };
    if (req.method === 'GET') {
      const path = publicPath(url.searchParams.get('path') || '');
      if (action === 'list') json(res,200,{ entries: await fs.list(path,{ recursive: url.searchParams.get('recursive') === '1', includeInternal: url.searchParams.get('internal') === '1' }) });
      else if (action === 'stat') json(res,200,await fs.stat(path));
      else if (action === 'disk') json(res,200,await fs.diskInfo());
      else if (action === 'trash') json(res,200,{ items: await fs.trashList() });
      else if (action === 'file') { const blob = await fs.read(path); res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':blob.size,'Content-Disposition':'attachment','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}); res.end(Buffer.from(await blob.arrayBuffer())); ops.event('local.read',who.user.id,{ rootId: root.id, path }); }
      else throw localError('Method not allowed.', '405'); return true;
    }
    if (req.method !== 'POST') throw localError('Method not allowed.', '405');
    const body = await readJSON(req, action === 'write' ? 72 * 1024 * 1024 : 16384); if(body.path!==undefined)publicPath(body.path);if(body.destination!==undefined)publicPath(body.destination); let result;
    if (action === 'write') { let bytes;try{bytes=fromBase64(body.data);}catch{throw localError('File data must be valid base64.');} result = await fs.write(body.path, new Blob([bytes]), { createOnly: body.createOnly === true, expectedHash: body.expectedHash }); }
    else if (action === 'mkdir') result = await fs.mkdir(body.path);
    else if (action === 'move') result = await fs.move(body.path,body.destination,{ expectedHash: body.expectedHash });
    else if (action === 'trash') result = await fs.trash(body.path,{ expectedHash: body.expectedHash });
    else if (action === 'restore') result = await fs.restoreTrash(body.id,body.destination);
    else if (action === 'open') {
      if (!root.native || fs.readOnly || body.confirm !== true) throw localError('Native opening is not explicitly enabled for this root.', 'FORBIDDEN');
      const path = relativePath(body.path); const info = await fs.stat(path); if (info.hash !== body.expectedHash) throw localError('The file changed before native open. Review it again.', 'CONFLICT');
      const app = apps.applications.find(a => a.extensions.includes(extname(path).toLowerCase())); if (!app) throw localError('No explicitly configured application handles this extension.', 'FORBIDDEN');
      const absolute = await fs.checked(path); result = await launch(app.executable, app.args.map(a => a === '{file}' ? absolute : a));
    } else if (action === 'reveal') {
      if (!root.reveal || body.confirm !== true) throw localError('OS folder reveal is not enabled for this root.', 'FORBIDDEN');
      let absolute = await fs.checked(relativePath(body.path || '',{ empty: true })); if ((await lstat(absolute)).isFile()) absolute = dirname(absolute);
      result = await launch(process.platform === 'darwin' ? '/usr/bin/open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open', [absolute]);
    } else throw localError('Method not allowed.', '405');
    ops.event('local.' + action,who.user.id,{ rootId: root.id, path: body.path || '', destination: body.destination || '', trashId: result?.id || '' }); json(res,200,result); return true;
  }
  return { enabled: true, safeRequest, handle, async close() { for (const root of roots.values()) { await root.fs.queue; root.fs.close(); } for (const lock of locks) { try { const current = JSON.parse(await readFile(lock.path,'utf8')); if (current.token === lock.token) await unlink(lock.path); } catch {} } } };
}
