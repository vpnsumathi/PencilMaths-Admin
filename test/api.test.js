'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createServer } = require('../src/server');

test('CRUD on admin modules', async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/api`;
  const j = (p, method, body) => fetch(base + p, {
    method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body),
  });
  try {
    assert.strictEqual((await (await j('')).json()).length, 4);
    assert.strictEqual((await j('/courses', 'POST', {})).status, 400);
    const created = await j('/courses', 'POST', { title: 'Algebra' });
    assert.strictEqual(created.status, 201);
    const { id } = await created.json();
    assert.strictEqual((await (await j('/courses/' + id)).json()).title, 'Algebra');
    const upd = await (await j('/courses/' + id, 'PUT', { grade: '5' })).json();
    assert.deepStrictEqual(upd, { id, title: 'Algebra', grade: '5' });
    assert.strictEqual((await j('/courses/' + id, 'DELETE')).status, 204);
    assert.strictEqual((await j('/courses/' + id)).status, 404);
    assert.strictEqual((await j('/nope')).status, 404);
  } finally {
    server.close();
  }
});
