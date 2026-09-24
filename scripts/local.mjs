/** Portable, zero-dependency localhost launcher. Does not bypass authentication. */
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const args = process.argv.slice(2), options = {};
for (let i=0;i<args.length;i++) {
  const arg = args[i];
  if (['--open','--recover-locks','--help'].includes(arg)) options[arg.slice(2)] = true;
  else if (['--data','--files','--port','--roots','--applications'].includes(arg) && args[i+1] && !args[i+1].startsWith('--')) options[arg.slice(2)] = args[++i];
  else throw new Error('Unknown or incomplete option: ' + arg);
}
if (options.help) { console.log(`Civora local system\n\nnode scripts/local.mjs [--data PATH] [--files PATH] [--port 8787]\n  [--roots CONFIG.json] [--applications CONFIG.json] [--open] [--recover-locks]\n\nLocal disk data and SQLite, bound to 127.0.0.1. Normal sign-in is required.\nNative applications require a separately configured executable allowlist.\n--recover-locks removes a stale root lock only when its recorded PID is absent.`); process.exit(0); }
const directory = resolve(options.data || process.env.CIVORA_DATA_DIR || 'data-local');
const port = Number(options.port || process.env.PORT || 8787); if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use a port between 1024 and 65535.');
await mkdir(directory,{ recursive: true, mode: 0o700 });
Object.assign(process.env,{ HOST:'127.0.0.1', PORT:String(port), CIVORA_DATA_DIR:directory, CIVORA_DB:'sqlite', CIVORA_LOCAL_SYSTEM:'1', CIVORA_PUBLIC_ORIGIN:`http://127.0.0.1:${port}` });
if (options.roots) process.env.CIVORA_LOCAL_ROOTS_FILE = resolve(options.roots);
else if (options.files) {
  const configPath = resolve(directory,'launcher-local-roots.json'); await writeFile(configPath,JSON.stringify({ version:1, roots:[{ id:'working', label:'My local working files', path:resolve(options.files), userIds:['u-admin'], allowReveal:false, allowNativeOpen:false }] },null,2),{ mode:0o600 }); process.env.CIVORA_LOCAL_ROOTS_FILE = configPath;
}
if (options.applications) process.env.CIVORA_LOCAL_APPLICATIONS_FILE = resolve(options.applications);
if (options['recover-locks']) process.env.CIVORA_LOCAL_RECOVER_LOCKS = '1';
await import('../server/index.mjs');
if (options.open) {
  setTimeout(() => {
    const command = process.platform === 'darwin' ? '/usr/bin/open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
    const child = spawn(command,[process.env.CIVORA_PUBLIC_ORIGIN],{ shell:false, detached:true, stdio:'ignore' }); child.on('error',() => console.log('Open the printed localhost address in your browser.')); child.unref();
  },250).unref();
}
