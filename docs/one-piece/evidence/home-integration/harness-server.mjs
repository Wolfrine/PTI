import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = 'H:/PTI-OnePiece/home-integration-qa';
const publicRoot = path.join(root, 'dist/home-qa/browser');
const events = [];
const requests = [];
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, 'http://127.0.0.1:8917');
  try {
    if (url.pathname === '/__events' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 4096) throw new Error('oversize'); }
      events.push({ at: new Date().toISOString(), ...JSON.parse(body) });
      await fs.writeFile(path.join(root, 'events.json'), JSON.stringify(events,null,2));
      res.writeHead(204).end(); return;
    }
    if (url.pathname === '/__events' && req.method === 'GET') { res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify({events,requests})); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    if (url.pathname === '/one-piece/') {
      const record = { at: new Date().toISOString(), url: req.url, method: req.method, secFetchDest: req.headers['sec-fetch-dest'], secFetchMode: req.headers['sec-fetch-mode'], secFetchSite: req.headers['sec-fetch-site'] };
      requests.push(record);
      await fs.writeFile(path.join(root,'document-requests.json'),JSON.stringify(requests,null,2));
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}).end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Full document navigation observed · QA only</title></head><body><main><h1>Full document navigation observed</h1><p>DEV-ONLY integration target. This is not the One Piece application or an authentication bypass.</p><pre id="navigation-proof">${escape(JSON.stringify(record,null,2))}</pre><a href="/home">Return to isolated PTI home</a></main></body></html>`); return;
    }
    if (url.pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    const relative = url.pathname === '/' || url.pathname === '/home' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\//,'');
    const file = path.resolve(publicRoot,relative);
    if (!file.startsWith(path.resolve(publicRoot)+path.sep)) { res.writeHead(400).end(); return; }
    const bytes = await fs.readFile(file);
    res.writeHead(200,{'content-type':mime[path.extname(file)]??'application/octet-stream','content-length':bytes.length,'cache-control':'no-store'});
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(8917,'127.0.0.1',()=>console.log(JSON.stringify({ listening:'http://127.0.0.1:8917/home', fixtureOnly:true, at:new Date().toISOString() })));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
