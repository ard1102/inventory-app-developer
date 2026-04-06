import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import App from './App';

// Mock html5-qrcode to prevent JSDOM errors
vi.mock('html5-qrcode', () => {
  return {
    Html5Qrcode: class {
      start() { return Promise.resolve(); }
      stop() { return Promise.resolve(); }
      clear() {}
      static getCameras() { return Promise.resolve([{ id: 'mock-cam', label: 'Mock Camera' }]); }
    }
  }
});

// Mock fetch to simulate API responses and test Expiry logic
global.fetch = vi.fn((url) => {
  if (url.includes('/api/products')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ products: [
        {
          barcode: '111',
          productName: 'Fresh Milk',
          quantity: 2,
          expiryDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0], // 3 days from now
          isRefundable: 0,
          dateAdded: new Date(Date.now() - 86400000).toISOString()
        },
        {
          barcode: '222',
          productName: 'Expired Bread',
          quantity: 1,
          expiryDate: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0], // 2 days ago
          isRefundable: 1,
          dateAdded: new Date(Date.now() - 86400000 * 5).toISOString(),
          lastUpdated: new Date().toISOString()
        }
      ]})
    });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
});

describe('Inventory Dashboard Tests', () => {
  it('renders the core UI components and fetches products', async () => {
    render(<App />);
    expect(screen.getByText('Inventory Scanner')).toBeDefined();
    
    // Check if products load
    const freshMilk = await screen.findByText('Fresh Milk');
    expect(freshMilk).toBeDefined();
  });

  it('calculates days before expiry correctly and flags expiration warnings', async () => {
    render(<App />);
    
    // Fresh Milk expires in 3 days
    const closeToExpiry = await screen.findByText('(Expires in 3 days!)');
    expect(closeToExpiry).toBeDefined();

    // Expired Bread expired 2 days ago
    const pastExpiry = await screen.findByText('(Expired 2 days ago)');
    expect(pastExpiry).toBeDefined();
  });
});
