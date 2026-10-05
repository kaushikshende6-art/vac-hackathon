const fs = require('fs');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'trackx.db');
const dbDir = path.dirname(dbPath);

// Ensure data directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db;

try {
  // 1. Try Node's built-in sqlite (Zero build dependencies, available in Node 22.5+ / 24+ / 26+)
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(dbPath);
  db.pragma = (str) => db.exec(`PRAGMA ${str};`);
} catch (e1) {
  try {
    // 2. Fallback to better-sqlite3 if available
    const Database = require('better-sqlite3');
    db = new Database(dbPath);
  } catch (e2) {
    console.error('Failed to load SQLite:', e1, e2);
    throw new Error('SQLite engine not available. Please run Node 22+ or install better-sqlite3.');
  }
}

// Enable WAL mode & foreign keys
if (typeof db.pragma === 'function') {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
} else {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
}

// Initialize schema
function initSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);
  }
}

initSchema();

module.exports = db;
