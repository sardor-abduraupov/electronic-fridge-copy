import { GoogleGenAI, Type, Schema, FunctionDeclaration, LiveServerMessage, Modality, Tool } from "@google/genai";
import { Category, Recipe } from '../types';

// ===============================
// DIRECT GEMINI API KEY (FRONTEND)
// ===============================
// NOTE: This key is intentionally loaded from environment or window for direct browser use.
// Do not hard-code your real Gemini API key here.
const GEMINI_API_KEY =
  (import.meta as any).env?.VITE_GEMINI_API_KEY ||
  (window as any).__GEMINI_API_KEY__ ||
  "";

if (!GEMINI_API_KEY) {
  console.warn("Gemini API key is missing");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// --- Helper: Clean JSON Markdown ---
const cleanJson = (text: string) => {
  if (!text) return "";
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  return cleaned;
};

// --- Helper: Model Overload Detection ---
const isOverloadedError = (e: any) =>
  String(e?.message || "").includes("503") ||
  String(e?.message || "").includes("UNAVAILABLE") ||
  String(e?.error?.code || "") === "503";

// --- Helper Types ---
interface ReceiptItem {
  name: string;
  quantity: number;
  unit: string;
  price: number;
  category: Category;
  imageKeyword: string; // Added for better image search
}

// --- Tool Definitions for Live Assistant ---
const assistantTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "updateInventory",
        description: "Update the quantity of a specific grocery item. Use negative values for consumption (e.g. 'used 2 eggs' -> -2) and positive for adding/buying.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            itemName: { type: Type.STRING, description: "Name of the item (e.g. 'Eggs', 'Milk'). PREFER RUSSIAN NAMES." },
            quantityChange: { type: Type.NUMBER, description: "Amount to add or remove (e.g. -5, 2)" },
            unit: { type: Type.STRING, description: "Unit of measurement if specified (optional)" }
          },
          required: ["itemName", "quantityChange"]
        }
      },
      {
        name: "addToShoppingList",
        description: "Add an item to the shopping list.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            item: { type: Type.STRING, description: "Item name in Russian" },
            quantity: { type: Type.NUMBER, description: "Default is 1" },
          },
          required: ["item"]
        }
      },
      {
        name: "saveRecipe",
        description: "Save a new recipe to the recipe book.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Title of the recipe in RUSSIAN." },
            ingredients: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING }, 
                description: "List of ingredients in RUSSIAN. Format: 'Quantity Name' (e.g. '3 яйца', '200мл молока'). Must match common Russian grocery names." 
            },
            instructions: { type: Type.STRING, description: "Detailed, step-by-step cooking instructions in RUSSIAN." },
            cookingTime: { type: Type.NUMBER, description: "Time in minutes" }
          },
          required: ["title", "ingredients", "instructions"]
        }
      }
    ]
  }
];

// --- 1. Receipt Analysis (gemini-3-pro-preview) ---
export const analyzeReceipt = async (imageBase64: string): Promise<ReceiptItem[]> => {
  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        quantity: { type: Type.NUMBER },
        unit: { type: Type.STRING, description: "e.g., kg, lbs, count, liters" },
        price: { type: Type.NUMBER },
        category: { type: Type.STRING, enum: ['Produce', 'Fruits', 'Dairy', 'Meat', 'Pantry', 'Beverages', 'Frozen', 'Other'] },
        imageKeyword: { type: Type.STRING, description: "Specific English keyword for finding a photo of this item (e.g. 'milk', 'sausage', 'apples')." }
      },
      required: ['name', 'quantity', 'category', 'price', 'imageKeyword'],
    },
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: imageBase64,
            },
          },
          {
            text: `Analyze this grocery receipt. Extract ONLY food items, beverages, and household consumables.
            
            1. Extract the name in the original language.
            2. Categorize strictly into: 'Produce', 'Fruits', 'Dairy', 'Meat', 'Pantry', 'Beverages', 'Frozen', 'Other'.
            3. Provide an 'imageKeyword' which is the ENGLISH translation of the item name (e.g., 'Яйца' -> 'Eggs'). This is crucial for image search.
            
            Extract prices and quantities accurately. If the image is blurry or contains no groceries, return an empty array.`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    if (response.text) {
      return JSON.parse(cleanJson(response.text)) as ReceiptItem[];
    }
  } catch (error) {
    console.error("Receipt analysis failed:", error);
  }
  return [];
};

// --- 2. Voice/Audio Input Parsing (gemini-2.5-flash) ---
export const parseVoiceInput = async (audioBase64: string, mimeType: string = 'audio/wav'): Promise<ReceiptItem[]> => {
  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        quantity: { type: Type.NUMBER },
        unit: { type: Type.STRING },
        category: { type: Type.STRING, enum: ['Produce', 'Fruits', 'Dairy', 'Meat', 'Pantry', 'Beverages', 'Frozen', 'Other'] },
        imageKeyword: { type: Type.STRING, description: "English keyword for image search" }
      },
      required: ['name', 'quantity', 'category', 'imageKeyword'],
    },
  };

  let response;
  try {
    response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: audioBase64,
            },
          },
          {
            text: `Listen to this audio note describing groceries. Extract a list of items.
            For each item, determine the category and provide an ENGLISH 'imageKeyword' for finding a photo of it.
            IMPORTANT: If the audio is silent, unclear, or contains no grocery items, return an empty list []. Do NOT invent items.
            `,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });
  } catch (error) {
    if (isOverloadedError(error)) {
      try {
        response = await ai.models.generateContent({
          model: 'gemini-1.5-pro',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: mimeType,
                  data: audioBase64,
                },
              },
              {
                text: `Listen to this audio note describing groceries. Extract a list of items.
                For each item, determine the category and provide an ENGLISH 'imageKeyword' for finding a photo of it.
                IMPORTANT: If the audio is silent, unclear, or contains no grocery items, return an empty list []. Do NOT invent items.
                `,
              },
            ],
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: schema,
          },
        });
      } catch (error2) {
        console.error("Voice parsing failed:", error2);
        return [];
      }
    } else {
      console.error("Voice parsing failed:", error);
      return [];
    }
  }
  if (response && response.text) {
    // Voice input usually doesn't have price, so map it with 0
    const items = JSON.parse(cleanJson(response.text));
    return items.map((i: any) => ({ ...i, price: 0 }));
  }
  return [];
};

// --- 3. Smart Item Identification (Manual Add) ---
export const getSmartItemDetails = async (itemName: string): Promise<{ category: Category, imageKeyword: string }> => {
    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            category: { type: Type.STRING, enum: ['Produce', 'Fruits', 'Dairy', 'Meat', 'Pantry', 'Beverages', 'Frozen', 'Other'] },
            imageKeyword: { type: Type.STRING, description: "English translation of the item for image search (e.g. 'cucumber')" }
        },
        required: ['category', 'imageKeyword']
    };

    let response;
    try {
        response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Identify the grocery category for "${itemName}" and provide its English translation for image searching.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
    } catch (e) {
        if (isOverloadedError(e)) {
            try {
                response = await ai.models.generateContent({
                    model: 'gemini-1.5-pro',
                    contents: `Identify the grocery category for "${itemName}" and provide its English translation for image searching.`,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: schema
                    }
                });
            } catch (e2) {
                console.error("Smart identification failed", e2);
                // Fallback
                return { category: 'Other', imageKeyword: 'grocery' };
            }
        } else {
            console.error("Smart identification failed", e);
            // Fallback
            return { category: 'Other', imageKeyword: 'grocery' };
        }
    }
    if (response && response.text) {
        return JSON.parse(cleanJson(response.text));
    }
    // Fallback
    return { category: 'Other', imageKeyword: 'grocery' };
};

// --- 4. Generate Recipe for Ingredient (gemini-2.5-flash) ---
interface GeneratedRecipeData {
    title: string;
    ingredients: { name: string; quantity: string; }[];
    instructions: string[];
    imageKeyword: string;
    cookingTime: number;
}

export const generateRecipeForIngredient = async (ingredientName: string): Promise<GeneratedRecipeData> => {
    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING, description: "Название рецепта на русском языке" },
            ingredients: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING, description: "Название ингредиента на русском" },
                        quantity: { type: Type.STRING, description: "Количество (например: 200гр, 1 ст.л)" },
                    },
                    required: ['name', 'quantity']
                }
            },
            instructions: {
                type: Type.ARRAY,
                items: { type: Type.STRING, description: "Шаг приготовления на русском" }
            },
            imageKeyword: { type: Type.STRING, description: "Short English keyword for image search (e.g. 'borsch', 'pancakes')" },
            cookingTime: { type: Type.INTEGER, description: "Total cooking time in minutes" }
        },
        required: ['title', 'ingredients', 'instructions', 'imageKeyword', 'cookingTime']
    };

    let response;
    try {
        response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Create a popular, delicious recipe that uses the ingredient: "${ingredientName}". 
            The recipe MUST be in Russian.
            Include a short English keyword that describes the dish visually for image search.
            Provide a realistic cooking time estimate in minutes.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
            }
        });
    } catch (e) {
        if (isOverloadedError(e)) {
            try {
                response = await ai.models.generateContent({
                    model: 'gemini-1.5-pro',
                    contents: `Create a popular, delicious recipe that uses the ingredient: "${ingredientName}". 
                    The recipe MUST be in Russian.
                    Include a short English keyword that describes the dish visually for image search.
                    Provide a realistic cooking time estimate in minutes.`,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: schema,
                    }
                });
            } catch (e2) {
                console.error("Recipe generation failed:", e2);
                throw new Error("Не удалось создать рецепт");
            }
        } else {
            console.error("Recipe generation failed:", e);
            throw new Error("Не удалось создать рецепт");
        }
    }
    if (response && response.text) {
        return JSON.parse(cleanJson(response.text));
    }
    throw new Error("Не удалось создать рецепт");
}

// --- 5. Parse Recipe from Text/URL (gemini-2.5-flash) ---
export const parseRecipe = async (input: string): Promise<Omit<Recipe, 'id' | 'timesCooked' | 'rating'> & { imageKeyword?: string }> => {
    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING, description: "Title in Russian" },
            ingredients: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING, description: "In Russian" },
                        quantity: { type: Type.STRING },
                        category: { type: Type.STRING, enum: ['Produce', 'Fruits', 'Dairy', 'Meat', 'Pantry', 'Beverages', 'Frozen', 'Other'] }
                    },
                    required: ['name', 'quantity']
                }
            },
            instructions: {
                type: Type.ARRAY,
                items: { type: Type.STRING, description: "In Russian" }
            },
            imageKeyword: { type: Type.STRING, description: "English visual keyword" },
            cookingTime: { type: Type.INTEGER, description: "Cooking time in minutes" }
        },
        required: ['title', 'ingredients', 'instructions', 'imageKeyword', 'cookingTime']
    };

    let response;
    try {
        response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Extract a structured recipe from the following input. If the input is just a name (e.g. "Carbonara"), generate a standard recipe for it. 
            ENSURE OUTPUT IS IN RUSSIAN.
            Input: ${input}`,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
            }
        });
    } catch (e) {
        if (isOverloadedError(e)) {
            try {
                response = await ai.models.generateContent({
                    model: 'gemini-1.5-pro',
                    contents: `Extract a structured recipe from the following input. If the input is just a name (e.g. "Carbonara"), generate a standard recipe for it. 
                    ENSURE OUTPUT IS IN RUSSIAN.
                    Input: ${input}`,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: schema,
                    }
                });
            } catch (e2) {
                throw new Error("Failed to parse recipe");
            }
        } else {
            throw new Error("Failed to parse recipe");
        }
    }
    if (response && response.text) {
        const data = JSON.parse(cleanJson(response.text));
        // Map data to match Recipe interface (handling potential extra fields from schema)
        return {
            title: data.title,
            ingredients: data.ingredients,
            instructions: data.instructions,
            imageUrl: `https://loremflickr.com/400/300/${encodeURIComponent(data.imageKeyword || 'food')}`,
            imageKeyword: data.imageKeyword,
            cookingTime: data.cookingTime || 30
        };
    }
    throw new Error("Failed to parse recipe");
};

// --- Helper: AI-powered image keyword extraction ---
const inferImageKeywordWithAI = async (input: string): Promise<string> => {
    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            keyword: {
                type: Type.STRING,
                description:
                    "Single concrete English food noun suitable for image search (e.g. 'eggs', 'sourdough bread', 'chicken breast', 'ramen'). No adjectives, no brands."
            }
        },
        required: ["keyword"]
    };

    try {
        const res = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Extract ONE concrete food keyword in English for image search.
Input: "${input}"
Rules:
- Output ONE noun phrase
- Must describe FOOD
- No brands
- No packaging
- No explanations`,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });

        if (res.text) {
            const parsed = JSON.parse(cleanJson(res.text));
            if (parsed.keyword && typeof parsed.keyword === "string") {
                return parsed.keyword.toLowerCase();
            }
        }
    } catch (e) {
        // ignore AI failure
    }

    return "food";
};

// --- 6. AI Image Search Keyword Selection (AI for food concept, public image for photo) ---
export const generateGroceryImage = async (prompt: string): Promise<string | null> => {
    // 1) Normalize prompt to a small keyword
    const normalize = (s: string) => {
        if (!s) return '';
        let t = s.toLowerCase().trim();
        // remove punctuation
        t = t.replace(/["'`…«»(),.?!:;\/\\]/g, '');
        // replace multiple spaces
        t = t.replace(/\s+/g, ' ');
        return t;
    };

    const keyword = normalize(prompt).split(' ')[0] || 'food';

    // 2) curated mapping for common grocery items to more precise search keywords
    const curated: Record<string, string> = {
        egg: 'eggs',
        eggs: 'eggs',
        milk: 'milk',
        bread: 'bread',
        butter: 'butter',
        cheese: 'cheese',
        apple: 'apples',
        apples: 'apples',
        banana: 'bananas',
        tomato: 'tomato',
        tomatoes: 'tomatoes',
        cucumber: 'cucumber',
        rice: 'rice',
        chicken: 'chicken',
        pork: 'pork',
        beef: 'beef',
        yogurt: 'yogurt',
        coffee: 'coffee',
        tea: 'tea',
        orange: 'orange',
        potato: 'potato',
        potatoes: 'potatoes',
        onion: 'onion',
        garlic: 'garlic',
        applejuice: 'apple juice',
        juice: 'juice',
        cereal: 'cereal'
    };

    let key = curated[keyword];

    if (!key) {
        key = await inferImageKeywordWithAI(prompt);
    }

    // 3) Candidate public image sources (no API key required)
    // - source.unsplash.com returns a relevant image for a keyword
    // - loremflickr is a fallback that uses the keyword
    // We return the first candidate URL; the browser will fetch it.

    // Use Unsplash Source (no API key) — good quality and relevant
    const unsplash = `https://source.unsplash.com/800x600/?${encodeURIComponent(key)}`;

    // Fallback to LoremFlickr (keyword-based)
    const lorem = `https://loremflickr.com/800/600/${encodeURIComponent(key)}`;

    // Final fallback: a neutral food placeholder
    const placeholder = `https://loremflickr.com/800/600/food`;

    try {
        return unsplash;
    } catch (e) {
        try {
            return lorem;
        } catch (e2) {
            return placeholder;
        }
    }
};

// --- 7. Live Connection Factory ---
export const connectToLiveChef = (
  onAudioData: (base64: string) => void,
  onTranscription: (text: string, isUser: boolean) => void,
  onToolCall: (name: string, args: any) => Promise<any>,
  onClose: () => void
) => {
  // Build callbacks object
  const callbacks = {
    onopen: () => console.log('Live session connected'),
    onmessage: async (msg: LiveServerMessage) => {
      const sc: any = (msg as any).serverContent;
      const audioData = sc?.modelTurn?.parts?.[0]?.inlineData?.data;
      if (audioData) {
        onAudioData(audioData);
      }

      if (sc?.outputTranscription?.text) {
        onTranscription(sc.outputTranscription.text, false);
      }

      if (sc?.inputTranscription?.text) {
        onTranscription(sc.inputTranscription.text, true);
      }

      if (msg.toolCall) {
        const functionCalls = (msg.toolCall.functionCalls || []) as any[];
        const functionResponses = await Promise.all(
          functionCalls.map(async (fc) => {
            console.log('Processing Tool:', fc.name, fc.args);
            let result;
            try {
              result = await onToolCall(fc.name as string, fc.args);
            } catch (e) {
              result = { error: (e as Error).message };
            }
            return {
              id: fc.id,
              name: fc.name,
              response: { result }
            };
          })
        );

        // sessionPromise will be defined below; use it to send tool responses
        sessionPromise.then((session: any) => {
          session.sendToolResponse({ functionResponses });
        });
      }
    },
    onclose: () => onClose(),
    onerror: (err: any) => console.error('Live session error', err)
  };

  const liveConfig: any = {
    responseModalities: [Modality.AUDIO],
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
    },
    systemInstruction: ("You are a helpful, master chef assistant called 'Fridge Bot'. You speak Russian. You can update the user's inventory, add to shopping list, and save recipes directly. Be concise. Do NOT invent items or hallucinate groceries that the user did not mention. When using tools, ensure all text arguments (titles, ingredients, instructions) are in RUSSIAN. Ingredients must match common grocery item names in Russian (e.g. 'Молоко', not 'Milk')."),
    outputAudioTranscription: {},
    inputAudioTranscription: {},
    tools: assistantTools
  };

  const sessionPromise = ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks,
    config: liveConfig
  });

  return sessionPromise;
};

// --- Re-export helpers ---
export const categorizeBatch = async (itemNames: string[]): Promise<Record<string, Category>> => {
    const uniqueNames = Array.from(new Set(itemNames));
    if (uniqueNames.length === 0) return {};
    
    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            categories: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        category: { type: Type.STRING, enum: ['Produce', 'Fruits', 'Dairy', 'Meat', 'Pantry', 'Beverages', 'Frozen', 'Other'] }
                    },
                    required: ['name', 'category']
                }
            }
        },
        required: ['categories']
    };

    let response;
    try {
        response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Categorize these grocery items correctly. Items: ${uniqueNames.join(', ')}`,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
    } catch (e) {
        if (isOverloadedError(e)) {
            try {
                response = await ai.models.generateContent({
                    model: 'gemini-1.5-pro',
                    contents: `Categorize these grocery items correctly. Items: ${uniqueNames.join(', ')}`,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: schema
                    }
                });
            } catch (e2) {
                console.error("Batch categorization failed", e2);
                return {};
            }
        } else {
            console.error("Batch categorization failed", e);
            return {};
        }
    }
    if (response && response.text) {
        const data = JSON.parse(cleanJson(response.text));
        const mapping: Record<string, Category> = {};
        data.categories.forEach((item: any) => {
            mapping[item.name] = item.category as Category;
        });
        return mapping;
    }
    return {};
};