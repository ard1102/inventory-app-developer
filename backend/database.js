const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'data', 'inventory.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    db.run(`CREATE TABLE IF NOT EXISTS products (
      barcode TEXT PRIMARY KEY,
      productName TEXT NOT NULL,
      quantity INTEGER DEFAULT 0,
      price REAL DEFAULT 0.0,
      expiryDate TEXT,
      imageUrl TEXT,
      isRefundable INTEGER DEFAULT 0,
      dateAdded TEXT,
      lastUpdated TEXT,
      category TEXT
    )`);

    // Ensure price column is added for previously existing databases
    db.run("ALTER TABLE products ADD COLUMN price REAL DEFAULT 0.0", (err) => {
      // We explicitly ignore the error here because if the column already exists, this query fails cleanly.
    });
  }
});

module.exports = db;
