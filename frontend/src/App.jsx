import React, { useState, useEffect, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

function App() {
  const [appToken, setAppToken] = useState(localStorage.getItem('appToken') || '');
  const [tempToken, setTempToken] = useState('');
  
  const [products, setProducts] = useState([]);
  const [sortBy, setSortBy] = useState('dateAdded');
  
  const [scanning, setScanning] = useState(false);
  const [barcode, setBarcode] = useState('');
  
  const [formData, setFormData] = useState({
    productName: '',
    category: '',
    quantity: 1,
    price: '',
    expiryDate: '',
    isRefundable: false,
    imageFile: null,
    imageUrl: ''
  });
  
  const [isExisting, setIsExisting] = useState(false);
  const scannerRef = useRef(null);

  useEffect(() => {
    if (appToken) {
      fetchProducts();
    }
  }, [sortBy, appToken]);

  const handleAuthError = () => {
    alert("Invalid Access Token. Please log in again.");
    setAppToken('');
    localStorage.removeItem('appToken');
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch(`/api/products?sort=${sortBy}`, {
        headers: { 'Authorization': `Bearer ${appToken}` }
      });
      if (res.status === 401) return handleAuthError();
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const checkProduct = async (code) => {
    try {
      const res = await fetch(`/api/products/${code}`, {
        headers: { 'Authorization': `Bearer ${appToken}` }
      });
      if (res.status === 401) return handleAuthError();
      if (res.ok) {
        const data = await res.json();
        const isExternal = data.source === 'external';
        
        setFormData({
          productName: data.productName || '',
          category: data.category || '',
          quantity: data.quantity || 1,
          price: data.price || '',
          expiryDate: data.expiryDate || '',
          isRefundable: data.isRefundable === 1,
          imageFile: null,
          imageUrl: data.imageUrl || ''
        });
        
        setIsExisting(!isExternal);
        if (isExternal) {
          console.log("Found product on Open Food Facts!");
        }
      } else {
        setFormData({
          productName: '',
          category: '',
          quantity: 1,
          price: '',
          expiryDate: '',
          isRefundable: false,
          imageFile: null,
          imageUrl: ''
        });
        setIsExisting(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const startScanning = async () => {
    setScanning(true);
    setBarcode('');
    await new Promise(r => setTimeout(r, 100));
    try {
      const config = { 
        fps: 20, 
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          return {
            width: viewfinderWidth * 0.8,
            height: Math.max(viewfinderHeight * 0.3, 100)
          };
        },
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39
        ],
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      };

      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        let cameraId = devices[0].id;
        for (const device of devices) {
          if (device.label.toLowerCase().includes('back') || device.label.toLowerCase().includes('rear') || device.label.toLowerCase().includes('environment')) {
            cameraId = device.id;
            break;
          }
        }
        scannerRef.current = new Html5Qrcode("reader");
        await scannerRef.current.start(
          cameraId,
          config,
          (decodedText) => {
            setBarcode(decodedText);
            stopScanning();
            checkProduct(decodedText);
          },
          (error) => {}
        );
      } else {
        alert("No cameras found on your device.");
        setScanning(false);
      }
    } catch (err) {
      console.error("Camera setup failed:", err);
      try {
        const fallbackConfig = { 
          fps: 20, 
          qrbox: { width: 250, height: 150 },
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39
          ]
        };
        scannerRef.current = new Html5Qrcode("reader");
        await scannerRef.current.start(
          { facingMode: "user" },
          fallbackConfig,
          (decodedText) => {
            setBarcode(decodedText);
            stopScanning();
            checkProduct(decodedText);
          },
          (error) => {}
        );
      } catch (fallbackErr) {
        alert("Could not start any camera.");
        setScanning(false);
      }
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (e) { console.error(e); }
    }
    setScanning(false);
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const compressedFile = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 800, useWebWorker: true });
        setFormData({ ...formData, imageFile: compressedFile, imageUrl: URL.createObjectURL(compressedFile) });
      } catch (err) { console.error(err); }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!barcode) return alert("Please scan a barcode first");

    const data = new FormData();
    data.append('barcode', barcode);
    data.append('productName', formData.productName);
    data.append('category', formData.category);
    data.append('quantity', formData.quantity);
    data.append('price', formData.price);
    data.append('expiryDate', formData.expiryDate);
    data.append('isRefundable', formData.isRefundable);
    if (!isExisting) {
      data.append('dateAdded', new Date().toISOString());
    }
    if (formData.imageFile) {
      data.append('image', formData.imageFile, 'product.jpg');
    } else if (formData.imageUrl) {
      data.append('imageUrl', formData.imageUrl);
    }

    const url = isExisting ? `/api/products/${barcode}` : '/api/products';
    const method = isExisting ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Authorization': `Bearer ${appToken}` },
        body: data
      });
      if (res.status === 401) return handleAuthError();
      if (res.ok) {
        alert("Saved successfully!");
        setBarcode('');
        setFormData({ productName: '', category: '', quantity: 1, price: '', expiryDate: '', isRefundable: false, imageFile: null, imageUrl: '' });
        fetchProducts();
      }
    } catch (err) {
      console.error(err);
      alert("Failed to save data");
    }
  };

  const downloadCSV = async () => {
    try {
      const res = await fetch('/api/export', { headers: { 'Authorization': `Bearer ${appToken}` } });
      if (res.status === 401) return handleAuthError();
      if (!res.ok) return alert("Failed to fetch CSV");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'inventory.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error(err);
      alert("CSV Download failed.");
    }
  };

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    localStorage.setItem('appToken', tempToken);
    setAppToken(tempToken);
  };

  if (!appToken) {
    return (
      <div className="container" style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh'}}>
        <form className="glass-card animate-fade-in" onSubmit={handleLoginSubmit} style={{maxWidth: '400px', width: '100%', textAlign: 'center'}}>
          <h2>Secure Login</h2>
          <p style={{color: 'var(--text-secondary)', marginBottom: '1.5rem'}}>Please enter the system access token to continue.</p>
          <div className="form-group">
            <input 
              type="password" 
              placeholder="Configuration Token" 
              required
              value={tempToken}
              onChange={e => setTempToken(e.target.value)}
              style={{textAlign: 'center'}}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{width: '100%'}}>Unlock Scanner</button>
        </form>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Inventory Scanner</h1>
      
      <div className="glass-card animate-fade-in">
        <div style={{ display: scanning ? 'block' : 'none' }}>
          <div id="reader"></div>
          <br/>
          <button className="btn btn-secondary" onClick={stopScanning}>Cancel Scan</button>
        </div>
        
        {!scanning && (
          <button className="btn btn-primary" onClick={startScanning}>Start Camera Scanner</button>
        )}
        
        {!scanning && barcode && (
          <div style={{marginTop: '1rem', textAlign: 'center'}}>
            <p><strong>Detected Barcode:</strong> {barcode}</p>
          </div>
        )}
      </div>

      {barcode && !scanning && (
        <form className="glass-card animate-fade-in" onSubmit={handleSubmit}>
          {!isExisting && formData.productName && (
            <div style={{
              backgroundColor: 'rgba(74, 144, 226, 0.1)', 
              color: 'var(--primary-color)', 
              padding: '0.8rem', 
              borderRadius: '8px', 
              marginBottom: '1rem',
              fontSize: '0.9rem',
              border: '1px solid var(--primary-color)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span>🌐</span>
              <span>Found product details online! Review and click Save to add to your local inventory.</span>
            </div>
          )}
          <div className="form-group">
            <label>Product Name</label>
            <input 
              type="text" 
              required 
              value={formData.productName}
              onChange={e => setFormData({...formData, productName: e.target.value})}
            />
          </div>
          
          <div className="form-group">
            <label>Category</label>
            <input 
              type="text" 
              placeholder="Drinks, Snacks, Electronics..."
              value={formData.category}
              onChange={e => setFormData({...formData, category: e.target.value})}
            />
          </div>
          
          <div className="form-group">
            <label>Quantity</label>
            <input 
              type="number" 
              min="0" 
              required 
              value={formData.quantity}
              onChange={e => setFormData({...formData, quantity: parseInt(e.target.value)})}
            />
          </div>

          <div className="form-group">
            <label>Price ($)</label>
            <input 
              type="number" 
              step="0.01"
              min="0"
              value={formData.price}
              onChange={e => setFormData({...formData, price: e.target.value})}
            />
          </div>
          
          <div className="form-group">
            <label>Expiry Date</label>
            <input 
              type="date" 
              value={formData.expiryDate}
              onChange={e => setFormData({...formData, expiryDate: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label>Product Image</label>
            <input type="file" accept="image/*" onChange={handleImageChange} />
            {formData.imageUrl && (
              <img src={formData.imageUrl} alt="Preview" style={{width: '100px', height: '100px', objectFit: 'cover', marginTop: '10px', borderRadius: '8px'}} />
            )}
          </div>
          
          <div className="form-group checkbox-group">
            <input 
              type="checkbox" 
              id="refundable"
              checked={formData.isRefundable}
              onChange={e => setFormData({...formData, isRefundable: e.target.checked})}
            />
            <label htmlFor="refundable" style={{marginBottom: 0}}>Refundable Item</label>
          </div>
          
          <button type="submit" className="btn btn-primary">
            {isExisting ? "Update Product" : "Save New Product"}
          </button>
        </form>
      )}

      <div className="glass-card animate-fade-in">
        <div className="controls" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem'}}>
          <h2 style={{margin: 0}}>Inventory List</h2>
          <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap'}}>
            <select 
              className="sort-select" 
              value={sortBy} 
              onChange={e => setSortBy(e.target.value)}
            >
              <option value="dateAdded">Sort by Date</option>
              <option value="productName">Sort by Name</option>
              <option value="expiryDate">Sort by Expiry Date</option>
            </select>
            <button className="btn btn-secondary" onClick={downloadCSV} style={{marginTop: 0}}>Download CSV</button>
            <button className="btn btn-secondary" onClick={() => { localStorage.removeItem('appToken'); setAppToken(''); }} style={{marginTop: 0, backgroundColor: 'var(--danger-color)'}}>Logout</button>
          </div>
        </div>
        
        <div className="product-grid">
          {products.map(p => {
            let expiryColor = 'var(--success-color)';
            let daysLeftText = '';
            if (p.expiryDate) {
              const daysLeft = Math.ceil((new Date(p.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
              if (daysLeft < 0) {
                expiryColor = 'var(--danger-color)';
                daysLeftText = `(Expired ${Math.abs(daysLeft)} days ago)`;
              } else if (daysLeft <= 5) {
                expiryColor = 'orange';
                daysLeftText = `(Expires in ${daysLeft} days!)`;
              } else {
                daysLeftText = `(${daysLeft} days left)`;
              }
            }
            
            return (
            <div key={p.barcode} className="glass-card product-item" style={{marginBottom: 0, padding: '1rem', cursor: 'pointer'}} onClick={() => {
              setBarcode(p.barcode);
              checkProduct(p.barcode);
              window.scrollTo({top: 0, behavior: 'smooth'});
            }}>
              {p.imageUrl ? (
                <img src={p.imageUrl} className="product-img" alt={p.productName} />
              ) : (
                <div className="product-img" style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>No Image</div>
              )}
              <div className="product-info">
                <h3 style={{marginBottom: '0.2rem'}}>{p.productName}</h3>
                {p.category && <span style={{display: 'inline-block', backgroundColor: 'var(--primary-color)', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', marginBottom: '0.5rem'}}>{p.category}</span>}
                <p><strong>Code:</strong> {p.barcode}</p>
                <p><strong>QTY:</strong> {p.quantity}</p>
                {p.price !== undefined && p.price !== null && (
                  <p><strong>Price:</strong> ${Number(p.price).toFixed(2)}</p>
                )}
                {p.expiryDate && (
                  <p>
                    <strong>Exp:</strong> {p.expiryDate} 
                    <span style={{color: expiryColor, marginLeft: '5px'}}>{daysLeftText}</span>
                  </p>
                )}
                <p><strong>Refundable:</strong> {p.isRefundable === 1 ? 'Yes' : 'No'}</p>
                <div style={{fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.5rem'}}>
                  <p>Added: {new Date(p.dateAdded).toLocaleDateString()}</p>
                  <p>Updated: {p.lastUpdated ? new Date(p.lastUpdated).toLocaleDateString() : 'Never'}</p>
                </div>
              </div>
            </div>
          )})}
          {products.length === 0 && <p>No items in inventory yet.</p>}
        </div>
      </div>
    </div>
  );
}

export default App;
