/**
 * Gemini Service (Frontend)
 * -------------------------
 * This file talks ONLY to the Cloudflare Worker.
 * No API keys. No SDK. No direct Gemini access.
 */

import { Category, Recipe } from "../types";

/* ===============================
   CONFIG
================================ */

const API_BASE = "/ai";

/* ===============================
   HELPERS
================================ */

async function post<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "AI request failed");
  }

  return res.json();
}

/* ===============================
   TYPES (same as before)
================================ */

export interface ReceiptItem {
  name: string;
  quantity: number;
  unit?: string;
  price: number;
  category: Category;
  imageKeyword: string;
}

interface GeneratedRecipeData {
  title: string;
  ingredients: { name: string; quantity: string }[];
  instructions: string[];
  imageKeyword: string;
  cookingTime: number;
}

/* ===============================
   1. RECEIPT ANALYSIS
================================ */

export const analyzeReceipt = async (
  imageBase64: string
): Promise<ReceiptItem[]> => {
  return post<ReceiptItem[]>("/receipt", { imageBase64 });
};

/* ===============================
   2. VOICE INPUT PARSING
================================ */

export const parseVoiceInput = async (
  audioBase64: string,
  mimeType: string = "audio/wav"
): Promise<ReceiptItem[]> => {
  const items = await post<any[]>("/voice", { audioBase64, mimeType });

  // price is not present for voice input
  return items.map((i) => ({
    ...i,
    price: 0,
  }));
};

/* ===============================
   3. SMART ITEM IDENTIFICATION
================================ */

export const getSmartItemDetails = async (
  itemName: string
): Promise<{ category: Category; imageKeyword: string }> => {
  try {
    return await post("/smart-item", { itemName });
  } catch {
    return { category: "Other", imageKeyword: "grocery" };
  }
};

/* ===============================
   4. GENERATE RECIPE
================================ */

export const generateRecipeForIngredient = async (
  ingredientName: string
): Promise<GeneratedRecipeData> => {
  return post("/recipe/generate", { ingredientName });
};

/* ===============================
   5. PARSE RECIPE (TEXT / URL)
================================ */

export const parseRecipe = async (
  input: string
): Promise<
  Omit<Recipe, "id" | "timesCooked" | "rating"> & {
    imageKeyword?: string;
  }
> => {
  const data = await post<any>("/recipe/parse", { input });

  return {
    title: data.title,
    ingredients: data.ingredients,
    instructions: data.instructions,
    imageUrl: `https://loremflickr.com/400/300/${encodeURIComponent(
      data.imageKeyword || "food"
    )}`,
    imageKeyword: data.imageKeyword,
    cookingTime: data.cookingTime || 30,
  };
};

/* ===============================
   6. BATCH CATEGORIZATION
================================ */

export const categorizeBatch = async (
  itemNames: string[]
): Promise<Record<string, Category>> => {
  if (itemNames.length === 0) return {};

  const data = await post<{ categories: { name: string; category: Category }[] }>(
    "/categorize-batch",
    { items: itemNames }
  );

  const mapping: Record<string, Category> = {};
  data.categories.forEach((i) => {
    mapping[i.name] = i.category;
  });

  return mapping;
};

/* ===============================
   7. IMAGE GENERATION
================================ */

export const generateGroceryImage = async (
  prompt: string
): Promise<string | null> => {
  try {
    const res = await fetch(`${API_BASE}/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!res.ok) return null;

    // Worker returns either base64 image or text
    return await res.text();
  } catch {
    return null;
  }
};

/* ===============================
   8. LIVE CHEF (INTENTIONALLY DISABLED)
================================ */

/**
 * Live audio assistant CANNOT run in browser anymore.
 * It must be implemented via:
 * - Node.js server
 * - WebSocket relay
 *
 * This stub is kept so imports do not break.
 */

export const connectToLiveChef = () => {
  throw new Error(
    "Live Chef is disabled in frontend. Use server-side WebSocket relay."
  );
};