// Datastore for the whole app state.
//
// Keeps the entire dataset in memory (so the rest of the app keeps its simple,
// synchronous API) and persists it as a single JSON document. Two backends:
//   - Postgres  (when DATABASE_URL is set)  -> survives restarts, used in prod
//   - Local file data/db.json               -> zero-setup local development
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'db.json');
const empty = { users: [], projects: [], pictures: [], activity: [], participants: [], messages: [] };
let db = JSON.parse(JSON.stringify(empty));

const USE_PG = !!process.env.DATABASE_URL;
let pool = null;
let saveChain = Promise.resolve(); // serialises Postgres writes so they can't race

function ensureCollections() {
  for (const k of Object.keys(empty)) if (!db[k]) db[k] = [];
}

// Must be awaited once at startup before the server begins handling requests.
async function init() {
  if (USE_PG) {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // managed Postgres (Neon) requires TLS
    });
    await pool.query(
      'CREATE TABLE IF NOT EXISTS app_state (id int PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())'
    );
    const res = await pool.query('SELECT data FROM app_state WHERE id = 1');
    if (res.rows.length) {
      db = res.rows[0].data;
      ensureCollections();
    } else {
      db = JSON.parse(JSON.stringify(empty));
      await pool.query('INSERT INTO app_state (id, data) VALUES (1, $1)', [JSON.stringify(db)]);
    }
    console.log('Store: Postgres (DATABASE_URL).');
  } else {
    loadFile();
    console.log('Store: local JSON file (data/db.json).');
  }
  return db;
}

function loadFile() {
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      ensureCollections();
    } catch (e) {
      console.error('Could not parse db.json, starting empty:', e.message);
      db = JSON.parse(JSON.stringify(empty));
    }
  }
  return db;
}

// Write the whole dataset out. For Postgres this is queued (async, fire-and-go
// but serialised); for the file backend it is a synchronous write.
function persist() {
  if (USE_PG) {
    const snapshot = JSON.stringify(db);
    saveChain = saveChain
      .then(() =>
        pool.query(
          'INSERT INTO app_state (id, data, updated_at) VALUES (1, $1, now()) ' +
            'ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()',
          [snapshot]
        )
      )
      .catch((e) => console.error('Postgres persist error:', e.message));
    return saveChain;
  }
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  return Promise.resolve();
}

// Wait for all queued Postgres writes to finish (used by the seed script).
function flush() {
  return saveChain;
}

// Replace the entire dataset (used by the seeder).
async function reset(newDb) {
  db = newDb;
  ensureCollections();
  await persist();
  await flush();
  return db;
}

function nextId(collection) {
  const items = db[collection] || [];
  return items.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
}

function insert(collection, doc) {
  doc.id = nextId(collection);
  db[collection].push(doc);
  persist();
  return doc;
}

function update(collection, id, patch) {
  const item = db[collection].find((x) => x.id === Number(id));
  if (!item) return null;
  Object.assign(item, patch);
  persist();
  return item;
}

function all(collection) {
  return db[collection] || [];
}

function find(collection, predicate) {
  return (db[collection] || []).filter(predicate);
}

function findOne(collection, predicate) {
  return (db[collection] || []).find(predicate) || null;
}

module.exports = { init, load: loadFile, save: persist, persist, flush, reset, insert, update, all, find, findOne, nextId };
