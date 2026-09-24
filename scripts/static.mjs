import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT=resolve(fileURLToPath(new URL('../',import.meta.url)));
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.ico':'image/x-icon','.md':'text/plain;charset=utf-8'};
const cspCache=new Map();
async function htmlPolicy(path,mtime){let cached=cspCache.get(path);if(cached?.mtime===mtime)return cached.policy;const html=await readFile(path,'utf8'),hashes=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!/[\s]src\s*=/.test(m[1])).map(m=>`'sha256-${createHash('sha256').update(m[2]).digest('base64')}'`);const policy=["default-src 'self'",`script-src 'self' ${hashes.join(' ')} https://accounts.google.com/gsi/client`,"style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style","img-src 'self' blob: data:","font-src 'self'","connect-src 'self' https://www.googleapis.com https://accounts.google.com/gsi/ https://oauth2.googleapis.com https://graph.microsoft.com https://login.microsoftonline.com https://api.dropboxapi.com https://content.dropboxapi.com https://*.1drv.com https://*.sharepoint.com","frame-src 'self' blob: https://accounts.google.com/gsi/","worker-src 'self' blob:","object-src 'none'","base-uri 'self'","form-action 'self'","frame-ancestors 'none'"].join('; ');cspCache.set(path,{mtime,policy});return policy;}
export async function serveStatic(req,res){
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
  if(name==='/')name='/index.html';
  const allowed=['/index.html','/release.json','/portal.html','/oauth-callback.html','/manifest.webmanifest','/sw.js','/dist/civora.html','/dist/portal.html','/examples/reuse.html','/examples/local-folder.html','/docs/WORKBENCH.md','/docs/REFINEMENTS.md','/docs/LOCAL-SYSTEM.md','/docs/WORKFLOW-AUTOMATION.md','/docs/EXPLORER.md','/docs/EXPLORER-DESIGN.md','/docs/UI-PARITY.md','/docs/MOBILE-TOUCH.md','/docs/DOCUMENT-SETS.md'].includes(name)||/^\/dist\/lib\/civora-[a-z-]+\.js$/.test(name)||/^\/(app|packages)\/[a-zA-Z0-9_./-]+\.(js|css|svg)$/.test(name);
  const path=resolve(ROOT,'.'+name);
  if(!allowed||name.includes('..')||!path.startsWith(ROOT+sep)){res.writeHead(404).end('Not found');return;}
  try{const info=await stat(path);if(!info.isFile())throw new Error();res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Content-Length':info.size,'Cache-Control':(['/release.json','/sw.js'].includes(name)||extname(path)==='.html')?'no-store, max-age=0':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Cross-Origin-Opener-Policy':'same-origin-allow-popups','Permissions-Policy':'camera=(), microphone=(), geolocation=()',...(extname(path)==='.html'?{'Content-Security-Policy':await htmlPolicy(path,info.mtimeMs)}:{})});if(req.method==='HEAD')res.end();else createReadStream(path).pipe(res);}catch{res.writeHead(404).end('Not found');}
}
