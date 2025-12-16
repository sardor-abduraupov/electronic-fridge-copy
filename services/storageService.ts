import { InventoryItem, ShoppingItem, Recipe, ExpenseRecord } from '../types';

// Using https://jsonblob.com as a free, serverless backend
// Development: Vite dev server proxies `/jsonblob` to jsonblob to avoid CORS.
// Production: jsonblob doesn't return CORS headers, so a browser request will be
// blocked. The recommended production approach is to deploy a small proxy (Cloudflare
// Worker, Netlify/Vercel function) that forwards requests to jsonblob and adds
// Access-Control-Allow-Origin headers.
// Replace WORKER_PROXY with your deployed worker URL, e.g.:
// const WORKER_PROXY = 'https://my-fridge-proxy.workers.dev/jsonblob'
const WORKER_PROXY = 'https://electronic-fridge-worker.abduraupov-s-r.workers.dev/jsonblob';

const isProd = (typeof import.meta !== 'undefined') && !!((import.meta as any).env && (import.meta as any).env.PROD);
const BLOB_API_URL = isProd ? WORKER_PROXY : '/jsonblob';

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

// Create a new shared database (Blob)
export const createFamilyDatabase = async (initialState: AppState): Promise<string | null> => {
  // Quick check to avoid making requests if obviously offline
  if (!navigator.onLine) {
      console.log("Offline: Skipping cloud creation.");
      return null;
  }

  try {
    const response = await fetch(BLOB_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(initialState),
    });

    if (response && response.ok) {
      // The Location header contains the URL to the new blob
      const location = response.headers.get("Location") || response.headers.get("location");
      if (location) {
        const parts = location.split('/');
        return parts[parts.length - 1];
      }
    } else {
      // Non-OK server response
      // eslint-disable-next-line no-console
      console.warn('[storageService] createFamilyDatabase: server responded with', response && response.status);
    }
  } catch (error) {
    // Network/CORS error — fallback to localStorage so app keeps working
    // eslint-disable-next-line no-console
    console.debug('Cloud sync unavailable (Network/CORS). Falling back to localStorage.', error);
    try {
      localStorage.setItem('fridge-cloud-backup', JSON.stringify(initialState));
    } catch (e) {
      // ignore localStorage failures
    }
  }
  return null;
};

// Fetch data from the shared database
export const fetchFamilyData = async (blobId: string): Promise<AppState | null> => {
  if (!blobId || !navigator.onLine) return null;

  try {
    const response = await fetch(`${BLOB_API_URL}/${blobId}`, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    if (response && response.ok) {
      return await response.json();
    }
  } catch (error) {
    // Network/CORS error — log and fall back to null so app uses local copy
    // eslint-disable-next-line no-console
    console.debug('fetchFamilyData failed (Network/CORS)', error);
  }
  return null;
};

// Update the shared database
export const updateFamilyData = async (blobId: string, data: AppState): Promise<boolean> => {
  if (!blobId || !navigator.onLine) return false;

  try {
    const response = await fetch(`${BLOB_API_URL}/${blobId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(data)
    });
    if (response && response.ok) return true;
  } catch (error) {
    // Network/CORS error — persist locally and return false
    try {
      localStorage.setItem('fridge-cloud-backup', JSON.stringify(data));
    } catch (e) {
      // ignore
    }
    // eslint-disable-next-line no-console
    console.debug('updateFamilyData failed (Network/CORS). Saved to local backup.', error);
    return false;
  }
  return false;
};