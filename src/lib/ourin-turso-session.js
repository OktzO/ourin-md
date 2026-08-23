import { getTursoClient } from './ourin-turso.js';

const credsCache = new Map();
const keysCache = new Map();

async function loadState(scope) {
  const client = getTursoClient();
  if (!client) return null;
  // load creds
  const credsRs = await client.execute({
    sql: 'SELECT creds FROM session_creds WHERE scope = ?',
    args: [scope],
  });
  let creds = null;
  if (credsRs.rows && credsRs.rows.length > 0) {
    creds = JSON.parse(credsRs.rows[0].creds);
  } else {
    const { initAuthCreds } = await import('ourin');
    creds = initAuthCreds();
  }
  // keys are loaded lazily on demand
  return {
    creds,
    keys: {
      get: async (type, ids) => {
        if (!Array.isArray(ids) || ids.length === 0) return {};
        const cacheKey = `${scope}:${type}`;
        if (!keysCache.has(cacheKey)) keysCache.set(cacheKey, new Map());
        const local = keysCache.get(cacheKey);
        const missing = ids.filter(id => !local.has(id));
        if (missing.length > 0) {
          const placeholders = missing.map(() => '?').join(',');
          const rs = await client.execute({
            sql: `SELECT id, data FROM session_keys WHERE scope = ? AND category = ? AND id IN (${placeholders})`,
            args: [scope, type, ...missing],
          });
          for (const row of rs.rows) {
            local.set(row.id, JSON.parse(row.data));
          }
        }
        const result = {};
        for (const id of ids) {
          if (local.has(id)) result[id] = local.get(id);
        }
        return result;
      },
      set: async (data) => {
        const client = getTursoClient();
        if (!client) return;
        for (const [type, entries] of Object.entries(data)) {
          for (const [id, value] of Object.entries(entries)) {
            const cacheKey = `${scope}:${type}`;
            if (!keysCache.has(cacheKey)) keysCache.set(cacheKey, new Map());
            keysCache.get(cacheKey).set(id, value);
            await client.execute({
              sql: 'INSERT INTO session_keys (scope, category, id, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(scope, category, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
              args: [scope, type, id, JSON.stringify(value), Date.now()],
            });
          }
        }
      },
      getMany: async (type) => {
        const rs = await client.execute({
          sql: 'SELECT id, data FROM session_keys WHERE scope = ? AND category = ?',
          args: [scope, type],
        });
        const result = {};
        for (const row of rs.rows) {
          result[row.id] = JSON.parse(row.data);
        }
        return result;
      },
    },
  };
}

async function saveCreds(scope, creds) {
  const client = getTursoClient();
  if (!client) return;
  credsCache.set(scope, creds);
  await client.execute({
    sql: 'INSERT INTO session_creds (scope, creds, updated_at) VALUES (?, ?, ?) ON CONFLICT(scope) DO UPDATE SET creds = excluded.creds, updated_at = excluded.updated_at',
    args: [scope, JSON.stringify(creds), Date.now()],
  });
}

async function useTursoAuthState(scope = 'main') {
  const state = await loadState(scope);
  if (!state) {
    // Turso client unavailable — caller must fall back
    return { state: null, saveCreds: () => {} };
  }
  return {
    state,
    saveCreds: () => saveCreds(scope, state.creds),
  };
}

export { useTursoAuthState, loadState, saveCreds };
