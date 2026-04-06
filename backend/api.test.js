import request from 'supertest';
import { expect, it, describe } from 'vitest';

const API_URL = 'http://127.0.0.1:3000/api';

describe('Inventory API Tests', () => {
  const testBarcode = 'TEST_12345';
  
  it('should list zero or more products initially', async () => {
    const res = await request(API_URL).get('/products').set('Authorization', 'Bearer default_secret_token');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('products');
  });

  it('should create a new product and track dateAdded & lastUpdated', async () => {
    const res = await request(API_URL)
      .post('/products')
      .set('Authorization', 'Bearer default_secret_token')
      .send({
        barcode: testBarcode,
        productName: 'Test Item',
        quantity: 5,
        price: 9.99,
        expiryDate: '2030-01-01',
        isRefundable: true,
        dateAdded: new Date().toISOString()
      });
      
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Product created');
  });

  it('should retrieve the created product with timestamps', async () => {
    const res = await request(API_URL).get(`/products/${testBarcode}`).set('Authorization', 'Bearer default_secret_token');
    expect(res.statusCode).toBe(200);
    expect(res.body.barcode).toBe(testBarcode);
    expect(res.body.productName).toBe('Test Item');
    expect(res.body.price).toBe(9.99);
    expect(res.body).toHaveProperty('dateAdded');
    expect(res.body).toHaveProperty('lastUpdated');
  });

  it('should update the product and refresh lastUpdated', async () => {
    // Wait slightly to ensure timestamp differs
    await new Promise(r => setTimeout(r, 10));
    
    const res = await request(API_URL)
      .put(`/products/${testBarcode}`)
      .set('Authorization', 'Bearer default_secret_token')
      .send({
        productName: 'Updated Test Item',
        quantity: 10,
        price: 19.99,
        expiryDate: '2031-01-01',
        isRefundable: false
      });
      
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Product updated');
    
    // Verify
    const verifyRes = await request(API_URL).get(`/products/${testBarcode}`).set('Authorization', 'Bearer default_secret_token');
    expect(verifyRes.body.productName).toBe('Updated Test Item');
    expect(verifyRes.body.price).toBe(19.99);
    expect(verifyRes.body.lastUpdated).not.toBe(verifyRes.body.dateAdded);
  });
});
