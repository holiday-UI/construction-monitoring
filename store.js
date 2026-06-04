// Tiny JSON-file datastore. Pure JS, no native deps, no DB install required.
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'db.json');

const empty = { users: [], projects: [], pictures: [], activity: [], participants: [], messages: [] };
let db = JSON.parse(JSON.stringify(empty));

function load() {
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      for (const k of Object.keys(empty)) if (!db[k]) db[k] = [];
    } catch (e) {
      console.error('Could not parse db.json, starting empty:', e.message);
      db = JSON.parse(JSON.stringify(empty));
    }
  }
  return db;
}

function save() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function nextId(collection) {
  const items = db[collection] || [];
  return items.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
}

function insert(collection, doc) {
  doc.id = nextId(collection);
  db[collection].push(doc);
  save();
  return doc;
}

function update(collection, id, patch) {
  const item = db[collection].find((x) => x.id === Number(id));
  if (!item) return null;
  Object.assign(item, patch);
  save();
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

load();

module.exports = { db, load, save, insert, update, all, find, findOne, nextId };
