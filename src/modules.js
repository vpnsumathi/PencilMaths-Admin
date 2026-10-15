'use strict';

// Admin module definitions: each module is a CRUD resource with required fields.
const MODULES = {
  students: { fields: ['name', 'email', 'grade'], required: ['name', 'email'] },
  teachers: { fields: ['name', 'email', 'subject'], required: ['name', 'email'] },
  courses: { fields: ['title', 'description', 'grade'], required: ['title'] },
  questions: { fields: ['text', 'answer', 'topic', 'difficulty'], required: ['text', 'answer'] },
};

function createStore() {
  const data = {};
  const counters = {};
  for (const m of Object.keys(MODULES)) {
    data[m] = new Map();
    counters[m] = 0;
  }

  function validate(module, body, partial) {
    const def = MODULES[module];
    if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Body must be a JSON object';
    if (!partial) {
      for (const f of def.required) {
        if (typeof body[f] !== 'string' || !body[f].trim()) return `Field "${f}" is required`;
      }
    }
    return null;
  }

  function pick(module, body) {
    const out = {};
    for (const f of MODULES[module].fields) if (body[f] !== undefined) out[f] = body[f];
    return out;
  }

  return {
    list: (m) => [...data[m].values()],
    get: (m, id) => data[m].get(id) || null,
    create(m, body) {
      const err = validate(m, body, false);
      if (err) return { error: err };
      const id = String(++counters[m]);
      const item = { id, ...pick(m, body) };
      data[m].set(id, item);
      return { item };
    },
    update(m, id, body) {
      const cur = data[m].get(id);
      if (!cur) return { notFound: true };
      const err = validate(m, body, true);
      if (err) return { error: err };
      const item = { ...cur, ...pick(m, body), id };
      for (const f of MODULES[m].required) {
        if (typeof item[f] !== 'string' || !item[f].trim()) return { error: `Field "${f}" is required` };
      }
      data[m].set(id, item);
      return { item };
    },
    remove: (m, id) => data[m].delete(id),
  };
}

module.exports = { MODULES, createStore };
