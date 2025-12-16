import { InventoryItem, ShoppingItem, Recipe, ExpenseRecord } from '../types';

// Using https://jsonblob.com as a free, serverless backend
// Development: Vite dev server proxies `/jsonblob` to jsonblob to avoid CORS.
// Production: jsonblob doesn't return CORS headers, so a browser request will be
// blocked. The recommended production approach is to deploy a small proxy (Cloudflare
// Worker, Netlify/Vercel function) that forwards requests to jsonblob and adds
// Access-Control-Allow-Origin headers.
// Replace WORKER_PROXY with your deployed worker URL, e.g.:
// const WORKER_PROXY = 'https://my-fridge-proxy.workers.dev/jsonblob'
const WORKER_PROXY = '/jsonblob';

const isProd = (typeof import.meta !== 'undefined') && !!((import.meta as any).env && (import.meta as any).env.PROD);
const BLOB_API_URL = '/jsonblob';

if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.info('[storageService] BLOB_API_URL =', BLOB_API_URL);
}

export interface AppState {
  inventory: InventoryItem[];
  shoppingList: ShoppingItem[];
  recipes: Recipe[];
  expenses: ExpenseRecord[];
  updatedAt: number;
}

export const fetchFamilyData = async (): Promise<AppState | null> => {
  if (!navigator.onLine) return null;

  try {
    const response = await fetch(BLOB_API_URL, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    if (response && response.ok) {
      return await response.json();
    }
  } catch (error) {
    // Network error — fall back to local backup
    try {
      const backup = localStorage.getItem('fridge-cloud-backup');
      if (backup) return JSON.parse(backup);
    } catch {}
    // eslint-disable-next-line no-console
    console.debug('fetchFamilyData failed (Network).', error);
  }
  return null;
};

export const updateFamilyData = async (data: AppState): Promise<boolean> => {
  if (!navigator.onLine) return false;

  try {
    const response = await fetch(BLOB_API_URL, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(data)
    });

    if (response && response.ok) {
      return true;
    }
  } catch (error) {
    // Network error — persist locally
    try {
      localStorage.setItem('fridge-cloud-backup', JSON.stringify(data));
    } catch {}
    // eslint-disable-next-line no-console
    console.debug('updateFamilyData failed (Network). Saved to local backup.', error);
  }
  return false;
};