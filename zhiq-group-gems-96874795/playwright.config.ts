import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// Carrega as chaves de Staging sem commitar no código
dotenv.config({ path: '.env.staging' });

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    // Aponta para o Frontend que, por sua vez, consome as chaves remotas de Supabase
    baseURL: process.env.VITE_SITE_URL || 'http://localhost:8080',
    trace: 'on-first-retry',
    // Abstração do Gateway de Pagamento, passado para o context do navegador
    extraHTTPHeaders: {
      'x-payment-gateway-public-key': process.env.VITE_STRIPE_PUBLIC_KEY || '',
    }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
  ],
});
