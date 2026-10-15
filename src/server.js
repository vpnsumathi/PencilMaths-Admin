'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { MODULES, createStore } = require('./modules');

function createServer() {
  const store = createStore();

  function send(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let raw = '';
      req.on('data', (c) => {
        raw += c;
        if (raw.length > 1e6) { reject(new Error('too large')); req.destroy(); }
      });
      req.on('end', () => {
        if (!raw) return resolve({});
        try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('Invalid JSON')); }
      });
      req.on('error', reject);
    });
  }

  return http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const parts = pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html')));
    }
    if (parts[0] !== 'api') return send(res, 404, { error: 'Not found' });
    if (parts.length === 1 && req.method === 'GET') {
      return send(res, 200, Object.keys(MODULES).map((name) => ({ name, ...MODULES[name] })));
    }

    const module = parts[1];
    if (!Object.prototype.hasOwnProperty.call(MODULES, module)) return send(res, 404, { error: 'Unknown module' });
    const id = parts[2];

    try {
      if (!id && req.method === 'GET') return send(res, 200, store.list(module));
      if (!id && req.method === 'POST') {
        const r = store.create(module, await readBody(req));
        return r.error ? send(res, 400, { error: r.error }) : send(res, 201, r.item);
      }
      if (id && req.method === 'GET') {
        const item = store.get(module, id);
        return item ? send(res, 200, item) : send(res, 404, { error: 'Not found' });
      }
      if (id && (req.method === 'PUT' || req.method === 'PATCH')) {
        const r = store.update(module, id, await readBody(req));
        if (r.notFound) return send(res, 404, { error: 'Not found' });
        return r.error ? send(res, 400, { error: r.error }) : send(res, 200, r.item);
      }
      if (id && req.method === 'DELETE') {
        return store.remove(module, id) ? send(res, 204) : send(res, 404, { error: 'Not found' });
      }
      return send(res, 405, { error: 'Method not allowed' });
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  });
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createServer().listen(port, () => console.log(`PencilMaths Admin on http://localhost:${port}`));
}

module.exports = { createServer };
