import { createServer } from 'node:http';
import { serveStatic } from './static.mjs';
const port=Number(process.env.PORT||8080),host=process.env.HOST||'127.0.0.1';
createServer((req,res)=>serveStatic(req,res).catch(()=>{if(!res.headersSent)res.writeHead(500);res.end();})).listen(port,host,()=>console.log(`Civora local-first app: http://${host}:${port}\nNo team API is running here. For authenticated storage use npm run server.`));
