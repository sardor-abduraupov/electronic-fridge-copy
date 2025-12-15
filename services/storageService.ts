import { InventoryItem, ShoppingItem, Recipe, ExpenseRecord } from '../types';

// Using https://jsonblob.com as a free, serverless backend
// In development we proxy `/jsonblob` to the remote API to avoid CORS issues.
// The proxy is configured in `vite.config.ts` so browser requests stay same-origin.
// For production (GitHub Pages) we must call the remote API directly — otherwise
// a POST/PUT to the site root will return 405 (method not allowed) because Pages
// only serves static files. Use the real jsonblob API path in production.
const isProd = (typeof import.meta !== 'undefined') && !!((import.meta as any).env && (import.meta as any).env.PROD);
const BLOB_API_URL = isProd ? 'https://jsonblob.com/api/jsonBlob' : '/jsonblob';

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

    if (response.ok) {
      // The Location header contains the URL to the new blob
      const location = response.headers.get("Location") || response.headers.get("location");
      if (location) {
        const parts = location.split('/');
        return parts[parts.length - 1];
      }
    }
  } catch (error) {
    // Silently fail to avoid console spam during CORS blocks
    console.debug("Cloud sync unavailable (Offline/CORS).");
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

    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    // Silent fail
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
    return response.ok;
  } catch (error) {
    return false;
  }
};