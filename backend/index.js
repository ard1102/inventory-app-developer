const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Prepare uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

app.use('/uploads', express.static('uploads'));

// Multer storage for images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// API Security Middleware
const appToken = process.env.APP_TOKEN || 'default_secret_token';
app.use('/api', (req, res, next) => {
  // Allow OPTIONS preflight
  if (req.method === 'OPTIONS') return next();
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${appToken}`) {
    return res.status(401).json({ error: 'Unauthorized access' });
  }
  next();
});

// API Endpoints

// Get all products
app.get('/api/products', (req, res) => {
  const { sort } = req.query;
  let orderBy = 'dateAdded DESC';
  if (sort === 'dateAdded') orderBy = 'dateAdded DESC';
  if (sort === 'productName') orderBy = 'productName ASC';
  if (sort === 'expiryDate') orderBy = 'expiryDate ASC';

  db.all(`SELECT * FROM products ORDER BY ${orderBy}`, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ products: rows });
  });
});

// Export all products as CSV
app.get('/api/export', (req, res) => {
  db.all(`SELECT * FROM products ORDER BY dateAdded DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (rows.length === 0) return res.send("No records found.");

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory.csv"');

    // Make CSV string
    const headers = ['Barcode', 'Name', 'Category', 'Quantity', 'Expiry Date', 'Refundable', 'Date Added'];
    const csvRows = [headers.join(',')];
    rows.forEach(r => {
      csvRows.push([
        r.barcode,
        `"${(r.productName || '').replace(/"/g, '""')}"`,
        `"${(r.category || '').replace(/"/g, '""')}"`,
        r.quantity,
        r.expiryDate,
        r.isRefundable ? 'Yes' : 'No',
        r.dateAdded
      ].join(','));
    });
    
    res.send(csvRows.join('\n'));
  });
});

// Helper to fetch from Open Food Facts
async function fetchFromOpenFoodFacts(barcode) {
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`, {
      headers: { 'User-Agent': 'InventoryScanner/1.0 (Learning/Dev-Tools)' }
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.status === 1) {
      const p = data.product;
      return {
        barcode,
        productName: p.product_name || p.generic_name || 'Unknown Product',
        category: (p.categories_tags && p.categories_tags[0] ? p.categories_tags[0].replace('en:', '') : '') || '',
        imageUrl: p.image_url || p.image_front_url || null,
        source: 'external'
      };
    }
    return null;
  } catch (err) {
    console.error('External API error:', err);
    return null;
  }
}

// Get product by barcode
app.get('/api/products/:barcode', async (req, res) => {
  const { barcode } = req.params;
  db.get(`SELECT * FROM products WHERE barcode = ?`, [barcode], async (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (row) {
      res.json({ ...row, source: 'local' });
    } else {
      // Not found locally? Try Open Food Facts
      const externalProduct = await fetchFromOpenFoodFacts(barcode);
      if (externalProduct) {
        res.json(externalProduct);
      } else {
        res.status(404).json({ message: "Product not found" });
      }
    }
  });
});

// Create product
app.post('/api/products', upload.single('image'), (req, res) => {
  const { barcode, productName, category, quantity, expiryDate, isRefundable, dateAdded } = req.body;
  let imageUrl = req.body.imageUrl || null;
  if (req.file) {
    imageUrl = `/uploads/${req.file.filename}`;
  }

  const lastUpdated = new Date().toISOString();
  const sql = `INSERT INTO products (barcode, productName, quantity, expiryDate, imageUrl, isRefundable, dateAdded, lastUpdated, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [barcode, productName, quantity, expiryDate, imageUrl, isRefundable ? 1 : 0, dateAdded, lastUpdated, category || ''];
  
  db.run(sql, params, function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: "Product created", barcode });
  });
});

// Update product
app.put('/api/products/:barcode', upload.single('image'), (req, res) => {
  const { productName, category, quantity, expiryDate, isRefundable } = req.body;
  
  // If no new image, update without changing imageUrl
  if (req.file) {
    const imageUrl = `/uploads/${req.file.filename}`;
    db.run(`UPDATE products SET productName = ?, category = ?, quantity = ?, expiryDate = ?, imageUrl = ?, isRefundable = ?, lastUpdated = ? WHERE barcode = ?`,
      [productName, category || '', quantity, expiryDate, imageUrl, isRefundable ? 1 : 0, new Date().toISOString(), req.params.barcode],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Product updated" });
      });
  } else {
    db.run(`UPDATE products SET productName = ?, category = ?, quantity = ?, expiryDate = ?, isRefundable = ?, lastUpdated = ? WHERE barcode = ?`,
      [productName, category || '', quantity, expiryDate, isRefundable ? 1 : 0, new Date().toISOString(), req.params.barcode],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Product updated" });
      });
  }
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
