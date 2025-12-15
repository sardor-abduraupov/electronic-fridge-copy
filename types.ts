export type Category = 'Produce' | 'Fruits' | 'Dairy' | 'Meat' | 'Pantry' | 'Beverages' | 'Frozen' | 'Other';

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: Category;
  addedDate: string;
  expiryDate?: string; // AI estimated
  price?: number;
  imageUrl?: string;
}

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  checked: boolean;
}

export interface RecipeIngredient {
  name: string;
  quantity: string; // Keep as string for flexibility (e.g. "2 cups")
  category?: Category;
}

export interface Recipe {
  id: string;
  title: string;
  ingredients: RecipeIngredient[];
  instructions: string[];
  timesCooked: number;
  cookingTime?: number; // minutes
  rating?: number; // 0-5
  imageUrl?: string;
  source?: string;
}

export enum AppTab {
  Fridge = 'fridge',
  Add = 'add',
  Recipes = 'recipes',
  List = 'list',
  Stats = 'stats',
  Assistant = 'assistant'
}

export interface ExpenseRecord {
  date: string;
  amount: number;
  category: Category;
}