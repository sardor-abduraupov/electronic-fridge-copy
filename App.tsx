import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Refrigerator, 
  PlusCircle, 
  ShoppingCart, 
  PieChart, 
  Scan, 
  Mic, 
  Trash2, 
  CheckCircle2, 
  ChefHat, 
  Sparkles,
  X,
  Search,
  BookOpen,
  ArrowRight,
  Utensils,
  AlertCircle,
  LayoutGrid,
  Bot,
  Beef,
  Carrot,
  Milk,
  Coffee,
  Cookie,
  IceCream,
  Package,
  Apple, 
  Receipt,
  Minus,
  Plus,
  Cloud,
  Share2,
  Copy,
  WifiOff,
  Edit2,
  Wand2,
  ListFilter,
  Save,
  Wifi,
  Loader2,
  RefreshCcw,
  Image as ImageIcon,
  Moon,
  Sun,
  Clock,
  Star
} from 'lucide-react';
import { InventoryItem, AppTab, ShoppingItem, Category, ExpenseRecord, Recipe } from './types';
import { analyzeReceipt, parseVoiceInput, generateRecipeForIngredient, parseRecipe, categorizeBatch, getSmartItemDetails, generateGroceryImage } from './services/geminiService';
import { fetchFamilyData, updateFamilyData, AppState } from './services/storageService';
import { ExpenseAnalytics } from './components/Charts';
import LiveAssistant from './components/LiveAssistant';

// --- PERSISTENCE HOOK ---
function useStickyState<T>(defaultValue: T, key: string): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = React.useState(() => {
    try {
      const stickyValue = window.localStorage.getItem(key);
      return stickyValue !== null ? JSON.parse(stickyValue) : defaultValue;
    } catch (error) {
      console.error(`Error reading ${key} from localStorage`, error);
      return defaultValue;
    }
  });

  React.useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error saving ${key} to localStorage`, error);
    }
  }, [key, value]);

  return [value, setValue];
}

// --- UTILS ---
const compressImage = async (base64Str: string, maxWidth = 300, quality = 0.7): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = Math.min(maxWidth / img.width, 1);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            } else {
                resolve(base64Str);
            }
        };
        img.onerror = () => resolve(base64Str);
    });
};

// --- INITIAL STATE (EMPTY) ---
const INITIAL_INVENTORY: InventoryItem[] = [];
const INITIAL_RECIPES: Recipe[] = [];

// Russian Category Translation
const CATEGORY_NAMES: Record<Category, string> = {
  'Produce': 'Овощи',
  'Fruits': 'Фрукты',
  'Dairy': 'Молочные продукты',
  'Meat': 'Мясо и Рыба',
  'Pantry': 'Бакалея',
  'Beverages': 'Напитки',
  'Frozen': 'Заморозка',
  'Other': 'Другое'
};

// Category Sort Order - Perishables First
const CATEGORY_ORDER: Category[] = [
  'Dairy', 'Produce', 'Fruits', 'Meat', 'Frozen', 'Beverages', 'Pantry', 'Other'
];

// Map Categories to Icons
const CATEGORY_ICONS: Record<Category, React.ElementType> = {
  'Produce': Carrot,
  'Fruits': Apple,
  'Dairy': Milk,
  'Meat': Beef,
  'Pantry': Cookie,
  'Beverages': Coffee,
  'Frozen': IceCream,
  'Other': Package
};

// Fintech-style Colors (Cyan/Teal Theme)
const CATEGORY_THEMES: Record<Category, string> = {
  Produce: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400',
  Fruits: 'text-rose-500 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-400',
  Dairy: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400',
  Meat: 'text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400',
  Pantry: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400',
  Beverages: 'text-teal-600 bg-teal-50 dark:bg-teal-900/30 dark:text-teal-400',
  Frozen: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-400',
  Other: 'text-slate-600 bg-slate-50 dark:bg-slate-800 dark:text-slate-400',
};

// --- COMPONENTS ---

const Header: React.FC<{ 
    title: string; 
    onAssistant: () => void; 
    onSmartOrganize: () => void; 
    onRetrySync: () => void;
    syncStatus: 'synced' | 'syncing' | 'offline';
    theme: 'light' | 'dark';
    toggleTheme: () => void;
}> = ({ title, onAssistant, onSmartOrganize, onRetrySync, syncStatus, theme, toggleTheme }) => (
  <header className="fixed top-0 left-0 right-0 z-20 px-6 py-4 flex justify-between items-center pointer-events-none bg-gradient-to-b from-slate-50 to-slate-50/0 dark:from-slate-950 dark:to-slate-950/0">
    <div className="pointer-events-auto flex items-center gap-3">
        <button onClick={onRetrySync} className="w-10 h-10 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center shadow-sm text-slate-700 dark:text-slate-200 relative border border-slate-50 dark:border-slate-800 active:scale-95 transition-transform">
             <Refrigerator size={20} />
             <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center transition-colors ${syncStatus === 'synced' ? 'bg-emerald-500' : syncStatus === 'syncing' ? 'bg-amber-500' : 'bg-slate-300'}`}>
                {syncStatus === 'syncing' ? <div className="w-2 h-2 border-2 border-white/50 border-t-white rounded-full animate-spin"></div> : syncStatus === 'offline' ? <WifiOff size={8} className="text-white" /> : <Cloud size={8} className="text-white" />}
             </div>
        </button>
        <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Мой Дом</span>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-none">{title}</h1>
        </div>
    </div>
    
    <div className="pointer-events-auto flex gap-3">
        <button onClick={toggleTheme} className="p-2.5 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 rounded-full shadow-sm active:scale-95 transition-transform border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
        <button onClick={onSmartOrganize} className="p-2.5 bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 rounded-full shadow-sm active:scale-95 transition-transform border border-violet-100 dark:border-slate-800 hover:bg-violet-50 dark:hover:bg-slate-800">
            <Wand2 size={20} />
        </button>
        <button onClick={onAssistant} className="p-2.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 rounded-full shadow-sm active:scale-95 transition-transform relative border border-slate-100 dark:border-slate-800">
            <Bot size={20} />
            <span className="absolute top-2 right-2.5 w-2 h-2 bg-emerald-500 rounded-full border border-white dark:border-slate-900"></span>
        </button>
    </div>
  </header>
);

const LoadingOverlay: React.FC<{ message: string }> = ({ message }) => (
  <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 z-50 flex items-center justify-center backdrop-blur-md">
    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl flex flex-col items-center space-y-4 shadow-2xl max-w-xs w-full mx-4 border border-slate-100 dark:border-slate-800">
      <div className="relative">
          <div className="w-12 h-12 border-4 border-cyan-100 dark:border-cyan-900 border-t-cyan-600 dark:border-t-cyan-500 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles size={16} className="text-cyan-600 dark:text-cyan-500 animate-pulse" />
          </div>
      </div>
      <p className="font-semibold text-slate-700 dark:text-slate-200 text-center leading-tight text-sm">{message}</p>
    </div>
  </div>
);

// --- MAIN APP ---

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.Fridge);
  const [theme, setTheme] = useStickyState<'light' | 'dark'>('light', 'ef_theme');
  
  // PERSISTENT STATE - UPDATED KEYS TO v4 TO RESET GHOST DATA
  const [inventory, setInventory] = useStickyState<InventoryItem[]>(INITIAL_INVENTORY, 'ef_inventory_v4');
  const [shoppingList, setShoppingList] = useStickyState<ShoppingItem[]>([], 'ef_shopping_v4');
  const [recipes, setRecipes] = useStickyState<Recipe[]>(INITIAL_RECIPES, 'ef_recipes_v4');
  const [expenses, setExpenses] = useStickyState<ExpenseRecord[]>([], 'ef_expenses_v4');
  const [dismissedItems, setDismissedItems] = useStickyState<string[]>([], 'ef_dismissed_v4');
  
  // SHARED DATABASE STATE (GLOBAL SINGLE BLOB)
  const [lastSyncTime, setLastSyncTime] = useStickyState<number>(0, 'ef_last_sync_v4');
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline'>('offline');

  // States for flows
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isLiveAssistantOpen, setLiveAssistantOpen] = useState(false);
  const [showAddRecipe, setShowAddRecipe] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null); // For editing capability
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [pendingPurchases, setPendingPurchases] = useState<(ShoppingItem & { finalPrice: number })[]>([]);
  const [activeFilter, setActiveFilter] = useState<Category | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  
  // Recipe Sorting
  const [recipeSortMode, setRecipeSortMode] = useState<'popular' | 'fastest' | 'rating'>('popular');

  // Manual Add State
  const [manualAddName, setManualAddName] = useState('');
  const [manualAddCategory, setManualAddCategory] = useState<Category>('Other'); // Fallback

  // Quick Add State
  const [quickAddText, setQuickAddText] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Apply Theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // --- 0. AUTO-INIT CLOUD DATABASE (Silent) ---

  // --- 1. SYNC ENGINE (Push) ---
  useEffect(() => {
    setSyncStatus('syncing');

    const timeout = setTimeout(async () => {
      const currentState: AppState = {
        inventory,
        shoppingList,
        recipes,
        expenses,
        updatedAt: Date.now()
      };

      const success = await updateFamilyData(currentState);
      if (success) {
        setLastSyncTime(currentState.updatedAt);
        setSyncStatus('synced');
      } else {
        setSyncStatus('offline');
      }
    }, 2000);

    return () => clearTimeout(timeout);
  }, [inventory, shoppingList, recipes, expenses]);

  // --- 2. SYNC ENGINE (Poll) ---
  useEffect(() => {
    const poll = async () => {
      const data = await fetchFamilyData();
      if (data && data.updatedAt > lastSyncTime) {
        console.log("Syncing from cloud...");
        setInventory(data.inventory);
        setShoppingList(data.shoppingList);
        setRecipes(data.recipes);
        setExpenses(data.expenses);
        setLastSyncTime(data.updatedAt);
        setSyncStatus('synced');
      }
    };

    const interval = setInterval(poll, 10000);
    poll();

    return () => clearInterval(interval);
  }, [lastSyncTime]);


  // Derived state
  const spentThisMonth = expenses.reduce((acc, item) => {
      const date = new Date(item.date);
      const now = new Date();
      if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) {
          return acc + item.amount;
      }
      return acc;
  }, 0);
  
  const formatUZS = (val: number) => val.toLocaleString('uz-UZ').replace(/,/g, ' ');

  // --- ACTIONS ---

  // --- VOICE ASSISTANT TOOL HANDLER ---
  const handleVoiceToolUse = async (tool: string, args: any): Promise<any> => {
      console.log('Voice Tool:', tool, args);

      if (tool === 'updateInventory') {
          const { itemName, quantityChange } = args;
          let message = "";
          
          setInventory(prev => {
              // Find best match
              const matchIndex = prev.findIndex(i => i.name.toLowerCase().includes(itemName.toLowerCase()));
              
              if (matchIndex === -1 && quantityChange > 0) {
                  // Add new item (Simple Add)
                  const newItem: InventoryItem = {
                      id: `voice-add-${Date.now()}`,
                      name: itemName,
                      quantity: quantityChange,
                      unit: args.unit || 'шт',
                      category: 'Other',
                      addedDate: new Date().toISOString().split('T')[0],
                      imageUrl: `https://loremflickr.com/300/300/${encodeURIComponent(itemName)},food`
                  };
                  // Trigger background process for category/image
                  backgroundProcessItem(newItem.id, newItem.name, 'Other');
                  message = `Added ${quantityChange} ${itemName} to inventory.`;
                  return [...prev, newItem];
              } else if (matchIndex === -1) {
                   message = `Could not find ${itemName} in inventory to use.`;
                   return prev;
              } else {
                  // Update existing
                  const updated = [...prev];
                  const item = updated[matchIndex];
                  const newQty = Math.max(0, item.quantity + quantityChange);
                  updated[matchIndex] = { ...item, quantity: parseFloat(newQty.toFixed(2)) };
                  message = `Updated ${item.name}. New quantity: ${newQty} ${item.unit}.`;
                  return updated;
              }
          });
          return message;
      }

      if (tool === 'addToShoppingList') {
          const { item, quantity } = args;
          setShoppingList(prev => [
              ...prev,
              {
                  id: `voice-${Date.now()}`,
                  name: item,
                  quantity: quantity || 1,
                  checked: false
              }
          ]);
          return `Added ${item} to shopping list.`;
      }

      if (tool === 'saveRecipe') {
          const { title, ingredients, instructions, cookingTime } = args;
          const recipeId = Date.now().toString();
          
          // Parse ingredients if string array
          const parsedIngs = ingredients.map((ing: string) => {
              // Simple heuristic to split quantity and name
              // Matches start with number, maybe unit, then space, then rest
              const match = ing.match(/^([\d.,]+(?:\s*[a-zA-Zа-яА-Я]+)?)\s+(.*)$/);
              if (match) {
                  return {
                      name: match[2].trim(),
                      quantity: match[1].trim(),
                      category: 'Other' as Category
                  };
              }
              return {
                  name: ing,
                  quantity: '', 
                  category: 'Other' as Category
              };
          });

          const newRecipe: Recipe = {
              id: recipeId,
              title: title,
              ingredients: parsedIngs,
              instructions: instructions.split('\n'),
              timesCooked: 0,
              cookingTime: cookingTime || 30,
              rating: 0,
              imageUrl: `https://loremflickr.com/400/300/${encodeURIComponent(title)},food`
          };
          
          setRecipes(prev => [...prev, newRecipe]);
          // Trigger image gen
          backgroundProcessRecipeImage(recipeId, title, title);
          
          return `Saved recipe for ${title}.`;
      }

      return "Function executed.";
  };

  const handleScanReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoadingMessage("Анализ чека...");
    setIsProcessing(true);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const items = await analyzeReceipt(base64);
        
        const newInventoryItems: InventoryItem[] = items.map((i, idx) => {
          return {
            id: Date.now().toString() + idx,
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            category: i.category,
            price: i.price,
            addedDate: new Date().toISOString().split('T')[0],
            // For bulk, using updated keyword logic with fallback
            imageUrl: `https://loremflickr.com/300/300/${encodeURIComponent(i.imageKeyword || 'grocery')},food,isolated/all` 
          };
        });

        setInventory(prev => [...prev, ...newInventoryItems]);
        const newExpenses = items.map(i => ({
            date: new Date().toISOString(),
            amount: i.price,
            category: i.category
        }));
        setExpenses(prev => [...prev, ...newExpenses]);
        setIsProcessing(false);
        setActiveTab(AppTab.Fridge);
      };
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
      alert("Не удалось проанализировать чек.");
    }
  };

  const handleVoiceInput = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        audioChunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };

        mediaRecorderRef.current.onstop = async () => {
          setLoadingMessage("Обработка...");
          setIsProcessing(true);
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            try {
              const base64Audio = (reader.result as string).split(',')[1];
              const mimeType = audioBlob.type || 'audio/webm';
              const items = await parseVoiceInput(base64Audio, mimeType);
              
              const newItems: InventoryItem[] = items.map((i, idx) => {
                return {
                  id: 'voice-' + Date.now() + idx,
                  name: i.name,
                  quantity: i.quantity,
                  unit: i.unit,
                  category: i.category,
                  addedDate: new Date().toISOString().split('T')[0],
                  // Bulk add - use improved web search first
                  imageUrl: `https://loremflickr.com/300/300/${encodeURIComponent(i.imageKeyword || 'food')},grocery,isolated/all`
                };
              });

              if (newItems.length > 0) {
                  setInventory(prev => [...prev, ...newItems]);
                  setActiveTab(AppTab.Fridge);
              } else {
                  alert("Не удалось распознать продукты.");
              }
            } catch (e) {
              console.error(e);
              alert("Ошибка обработки аудио.");
            } finally {
               setIsProcessing(false);
               stream.getTracks().forEach(track => track.stop());
            }
          };
        };
        mediaRecorderRef.current.start();
        setIsRecording(true);
      } catch (e) {
        console.error("Could not start recording", e);
        alert("Не удалось получить доступ к микрофону.");
      }
    }
  };

  // --- SMART ORGANIZE (Cleanup) ---
  const handleSmartOrganize = async () => {
      if (inventory.length === 0) {
          alert("Холодильник пуст, нечего организовывать.");
          return;
      }
      if (!confirm("Это автоматически исправит категории всех продуктов с помощью ИИ. Продолжить?")) return;

      setLoadingMessage("Навожу порядок...");
      setIsProcessing(true);
      
      try {
          const names = inventory.map(i => i.name);
          const categoryMap = await categorizeBatch(names);
          
          if (Object.keys(categoryMap).length > 0) {
              setInventory(prev => prev.map(item => {
                  if (categoryMap[item.name]) {
                      return { ...item, category: categoryMap[item.name] };
                  }
                  return item;
              }));
              alert("Готово! Продукты разложены по полкам.");
          } else {
              alert("Не удалось обновить категории.");
          }
      } catch(e) {
          console.error(e);
          alert("Ошибка при организации.");
      } finally {
          setIsProcessing(false);
      }
  };

  // --- BACKGROUND HELPERS ---
  const backgroundProcessItem = async (itemId: string, name: string, initialCategory: Category) => {
      try {
          // 1. Identify Correct Category & Keyword
          const smartDetails = await getSmartItemDetails(name);
          
          let newCategory = initialCategory;
          // Only override category if user selected "Other" (Auto)
          if (initialCategory === 'Other' && smartDetails.category !== 'Other') {
              newCategory = smartDetails.category;
          }

          // 2. Generate Image (now returns URL)
          const newImageUrl = await generateGroceryImage(smartDetails.imageKeyword || name);

          // 3. Update Inventory State silently
          setInventory(prev => prev.map(item => {
              if (item.id === itemId) {
                  return {
                      ...item,
                      category: newCategory,
                      imageUrl: newImageUrl || item.imageUrl // Keep fallback if generation failed
                  };
              }
              return item;
          }));

          // 4. Update Expense category if needed
          if (newCategory !== initialCategory) {
               // This is a bit complex to sync with expenses without an ID, but skipping for simplicity in this demo
          }

      } catch (e) {
          console.error("Background processing failed for item:", name, e);
      }
  };

  // --- SMART MANUAL ADD (Optimistic) ---
  const handleManualSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const quantity = parseFloat(formData.get('quantity') as string) || 1;
    const unit = formData.get('unit') as string || 'шт';
    let category = formData.get('category') as Category; 
    const price = parseFloat(formData.get('price') as string) || 0;

    if (!name) return;

    // 1. Close Modal Immediately
    setShowManualAdd(false);
    
    // 2. Add with Placeholder
    const newItemId = `manual-${Date.now()}`;
    const fallbackUrl = `https://loremflickr.com/300/300/${encodeURIComponent(name)},food`;
    
    const newItem: InventoryItem = {
        id: newItemId,
        name,
        quantity,
        unit,
        category: category,
        price,
        addedDate: new Date().toISOString().split('T')[0],
        imageUrl: fallbackUrl
    };

    setInventory(prev => [...prev, newItem]);
    if (price > 0) {
        setExpenses(prev => [...prev, {
            date: new Date().toISOString(),
            amount: price,
            category: category
        }]);
    }
    
    // Reset Form
    setManualAddName('');
    setManualAddCategory('Other');
    setActiveTab(AppTab.Fridge);

    // 3. Trigger Background AI
    backgroundProcessItem(newItemId, name, category);
  };

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!editingItem) return;

      const formData = new FormData(e.currentTarget);
      const name = formData.get('name') as string;
      const quantity = parseFloat(formData.get('quantity') as string);
      const unit = formData.get('unit') as string;
      const category = formData.get('category') as Category;
      const price = parseFloat(formData.get('price') as string);

      setInventory(prev => prev.map(item => {
          if (item.id === editingItem.id) {
              return { ...item, name, quantity, unit, category, price };
          }
          return item;
      }));
      setEditingItem(null);
  };
  
  // New Action: Regenerate Image for existing item
  const handleRegenerateImage = async () => {
      if (!editingItem) return;
      const originalItem = editingItem; // capture ref
      setEditingItem(null); // close modal
      setLoadingMessage(`Рисую новое фото: ${originalItem.name}...`);
      setIsProcessing(true);
      
      try {
          // Get smart keyword first for better prompt
          const smartDetails = await getSmartItemDetails(originalItem.name);
          const imageUrl = await generateGroceryImage(smartDetails.imageKeyword || originalItem.name);
          
          if (imageUrl) {
              setInventory(prev =>
                  prev.map(i => i.id === originalItem.id ? { ...i, imageUrl } : i)
              );
          } else {
              alert("Не удалось сгенерировать изображение.");
          }
      } catch (e) {
          alert("Ошибка генерации.");
      } finally {
          setIsProcessing(false);
      }
  };

  const consumeItem = (id: string) => {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    setInventory(prev => prev.filter(i => i.id !== id));
    
    const alreadyInList = shoppingList.some(s => s.name.toLowerCase() === item.name.toLowerCase());
    if (!alreadyInList && !dismissedItems.includes(item.name)) {
        setShoppingList(prev => [...prev, {
            id: `smart-${Date.now()}`,
            name: item.name,
            quantity: 1, 
            checked: false
        }]);
    }
  };

  const updateQuantity = (id: string, change: number) => {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    const isWeight = ['кг', 'л', 'kg', 'l'].some(u => item.unit.toLowerCase().includes(u));
    const step = isWeight ? 0.5 : 1;
    const newQty = item.quantity + (change * step);
    if (newQty <= 0) consumeItem(id);
    else setInventory(prev => prev.map(i => i.id === id ? { ...i, quantity: parseFloat(newQty.toFixed(2)) } : i));
  };

  // --- BACKGROUND RECIPE IMAGE ---
  const backgroundProcessRecipeImage = async (recipeId: string, title: string, keyword: string) => {
      try {
          const prompt = (keyword || title) + " dish meal";
          const imageUrl = await generateGroceryImage(prompt);
          if (imageUrl) {
              setRecipes(prev => prev.map(r => r.id === recipeId ? { ...r, imageUrl } : r));
              setSelectedRecipe(curr => curr && curr.id === recipeId ? { ...curr, imageUrl } : curr);
          }
      } catch (e) {
          console.error("Recipe image generation failed", e);
      }
  };

  const suggestRecipe = async (item: InventoryItem) => {
      // 1. We still need to wait for Text generation (can't show empty recipe)
      setLoadingMessage(`Создаю рецепт из: ${item.name}...`);
      setIsProcessing(true);
      try {
          const recipeData = await generateRecipeForIngredient(item.name);
          const recipeId = Date.now().toString();
          
          // Use fallback image initially
          const initialImageUrl = `https://loremflickr.com/400/300/${encodeURIComponent(recipeData.imageKeyword || 'food')}`;

          const newRecipe: Recipe = {
              id: recipeId,
              title: recipeData.title,
              ingredients: recipeData.ingredients.map(i => ({...i, category: 'Other'})),
              instructions: recipeData.instructions,
              timesCooked: 0,
              cookingTime: recipeData.cookingTime || 30, // Fallback
              rating: 0,
              imageUrl: initialImageUrl
          };
          
          setRecipes(prev => [...prev, newRecipe]);
          setActiveTab(AppTab.Recipes);
          setSelectedRecipe(newRecipe);
          
          setIsProcessing(false); // Hide global loader

          // 2. Trigger Background Image Generation
          backgroundProcessRecipeImage(recipeId, recipeData.title, recipeData.imageKeyword);

      } catch (e) {
          setIsProcessing(false);
          alert("Не удалось создать рецепт. Попробуйте позже.");
      }
  };

  const handleAddRecipe = async (input: string) => {
      setShowAddRecipe(false);
      setLoadingMessage("Анализ рецепта...");
      setIsProcessing(true);
      try {
          const parsedRecipe = await parseRecipe(input);
          const recipeId = Date.now().toString();
          
          const initialImageUrl = parsedRecipe.imageUrl || `https://loremflickr.com/400/300/food`;

          const newRecipe: Recipe = {
              id: recipeId,
              ...parsedRecipe,
              imageUrl: initialImageUrl, 
              timesCooked: 0,
              cookingTime: parsedRecipe.cookingTime || 45,
              rating: 0
          };
          setRecipes(prev => [...prev, newRecipe]);
          setIsProcessing(false);

          // Trigger Background Image Generation if title exists
          if (parsedRecipe.title) {
               backgroundProcessRecipeImage(recipeId, parsedRecipe.title, parsedRecipe.imageKeyword || '');
          }

      } catch (e) {
          console.error(e);
          setIsProcessing(false);
          alert("Не удалось распознать рецепт.");
      }
  };

  const checkIngredientStock = (ingredientName: string) => {
      const item = inventory.find(i => 
          i.name.toLowerCase().includes(ingredientName.toLowerCase()) || 
          ingredientName.toLowerCase().includes(i.name.toLowerCase())
      );
      return item && item.quantity > 0;
  };

  const handleCookRecipe = (recipe: Recipe) => {
      const newInventory = [...inventory];
      let madeChanges = false;
      recipe.ingredients.forEach(ing => {
          const itemIdx = newInventory.findIndex(i => 
              i.name.toLowerCase().includes(ing.name.toLowerCase()) || 
              ing.name.toLowerCase().includes(i.name.toLowerCase())
          );
          if (itemIdx >= 0 && newInventory[itemIdx].quantity > 0) {
              newInventory[itemIdx].quantity = Math.max(0, newInventory[itemIdx].quantity - 1);
              madeChanges = true;
          }
      });
      if(madeChanges) setInventory(newInventory);
      setRecipes(prev => prev.map(r => r.id === recipe.id ? { ...r, timesCooked: r.timesCooked + 1 } : r));
      setSelectedRecipe(null);
      alert(`Приготовлено: ${recipe.title}! Запасы обновлены.`);
  };

  const updateRecipeRating = (id: string, rating: number) => {
    setRecipes(prev => prev.map(r => r.id === id ? { ...r, rating } : r));
    // Also update selected recipe if open
    setSelectedRecipe(curr => curr && curr.id === id ? { ...curr, rating } : curr);
  };

  const addMissingToShop = (recipe: Recipe) => {
      const missing = recipe.ingredients.filter(ing => !checkIngredientStock(ing.name));
      const newShopItems: ShoppingItem[] = missing
        .filter(m => !shoppingList.some(s => s.name === m.name))
        .map(m => ({
          id: Date.now() + m.name,
          name: m.name,
          quantity: 1, 
          checked: false
      }));
      if (newShopItems.length > 0) {
          setShoppingList(prev => [...prev, ...newShopItems]);
          alert(`Добавлено ${newShopItems.length} товаров в список покупок.`);
      } else {
          alert("Все ингредиенты в наличии.");
      }
  };

  const handleQuickAdd = () => {
    if (!quickAddText.trim()) return;
    setShoppingList(prev => [{
        id: `quick-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: quickAddText.trim(),
        quantity: 1,
        checked: false
    }, ...prev]);
    setQuickAddText('');
  };

  const startFinishShopping = () => {
    const checkedItems = shoppingList.filter(i => i.checked);
    if (checkedItems.length === 0) {
        alert("Сначала отметьте купленные товары в списке.");
        return;
    }
    setPendingPurchases(checkedItems.map(i => ({...i, finalPrice: 0})));
    setShowFinishModal(true);
  };

  const confirmFinishShopping = () => {
      const newInventoryItems: InventoryItem[] = pendingPurchases.map((item, idx) => {
        return {
            id: `bought-${Date.now()}-${idx}`,
            name: item.name,
            quantity: item.quantity,
            unit: 'шт',
            category: 'Other', 
            price: item.finalPrice,
            addedDate: new Date().toISOString().split('T')[0],
            imageUrl: `https://loremflickr.com/300/300/food?random=${Date.now() + idx}`
        };
      });

      const newExpenses: ExpenseRecord[] = pendingPurchases.map(item => ({
        date: new Date().toISOString(),
        amount: item.finalPrice * item.quantity,
        category: 'Other'
      }));

      setInventory(prev => [...prev, ...newInventoryItems]);
      setExpenses(prev => [...prev, ...newExpenses]);
      const processedIds = pendingPurchases.map(p => p.id);
      setShoppingList(prev => prev.filter(i => !processedIds.includes(i.id)));
      setShowFinishModal(false);
      setPendingPurchases([]);
      setActiveTab(AppTab.Fridge);

      // Trigger background processing for bought items to fix categories and images
      newInventoryItems.forEach(item => {
          backgroundProcessItem(item.id, item.name, item.category);
      });
  };

  // --- VIEWS ---

  // Reset all data handler (cloud + local)
  const resetAllData = async () => {
    if (!confirm('Это полностью удалит данные на ВСЕХ устройствах (облако + локально). Продолжить?')) {
      return;
    }

    const emptyState: AppState = {
      inventory: [],
      shoppingList: [],
      recipes: [],
      expenses: [],
      updatedAt: Date.now()
    };

    // Immediately reset local state
    setInventory([]);
    setShoppingList([]);
    setRecipes([]);
    setExpenses([]);
    setDismissedItems([]);
    setLastSyncTime(emptyState.updatedAt);
    setSyncStatus('syncing');

    // Force cloud overwrite (single source of truth)
    const success = await updateFamilyData(emptyState);
    setSyncStatus(success ? 'synced' : 'offline');

    alert(
      success
        ? 'Все данные удалены локально и в облаке.'
        : 'Локальные данные очищены, но облако недоступно.'
    );
  };

  const renderDashboard = () => {
    const filteredInventory = inventory.filter(item => {
        const isAvailable = item.quantity > 0;
        const matchesCategory = activeFilter === 'All' || item.category === activeFilter;
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
        return isAvailable && matchesCategory && matchesSearch;
    });
    
    const renderItemsList = (items: InventoryItem[]) => (
        items.map(item => (
            <div key={item.id} onClick={() => setEditingItem(item)} className="bg-white dark:bg-slate-900 rounded-3xl p-3 pr-4 flex items-center gap-3 shadow-sm border border-slate-50 dark:border-slate-800 cursor-pointer active:scale-[0.98] transition-all">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex-shrink-0 relative">
                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover transition-opacity duration-500" />
                    {item.imageUrl?.includes('loremflickr') && (
                        <div className="absolute bottom-1 right-1 bg-white/80 dark:bg-black/60 p-0.5 rounded-full animate-pulse">
                            <Sparkles size={8} className="text-cyan-600 dark:text-cyan-400" />
                        </div>
                    )}
                    <div className="absolute inset-0 bg-black/5 dark:bg-black/20"></div>
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm truncate mb-0.5">{item.name}</h4>
                    <span className="text-[10px] font-bold text-slate-900 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md inline-block mb-1">
                        {item.price ? `${formatUZS(item.price)}` : '0'} UZS
                    </span>
                    {item.category !== 'Other' && (
                        <span className="text-[9px] text-slate-400 font-medium block">{CATEGORY_NAMES[item.category]}</span>
                    )}
                </div>
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-100 dark:border-slate-700" onClick={e => e.stopPropagation()}>
                    <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-700 text-slate-400 dark:text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg shadow-sm border border-slate-100 dark:border-slate-600 active:scale-95 transition-all">
                        {item.quantity <= (item.unit.includes('кг') || item.unit.includes('л') ? 0.5 : 1) ? <Trash2 size={16} /> : <Minus size={16} />}
                    </button>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 min-w-[30px] text-center">{item.quantity} {item.unit}</span>
                    <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-700 text-slate-400 dark:text-slate-300 hover:text-cyan-500 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 rounded-lg shadow-sm border border-slate-100 dark:border-slate-600 active:scale-95 transition-all">
                        <Plus size={16} />
                    </button>
                </div>
                 <button onClick={(e) => { e.stopPropagation(); suggestRecipe(item); }} className="w-8 h-8 flex items-center justify-center bg-violet-50 dark:bg-violet-900/30 text-violet-500 dark:text-violet-400 rounded-xl transition-colors hover:bg-violet-100 dark:hover:bg-violet-900/50 flex-shrink-0">
                    <ChefHat size={16} />
                </button>
            </div>
        ))
    );

    return (
      <div className="pb-40 pt-20 px-6">
        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/50 dark:shadow-slate-950/50 relative overflow-hidden mb-8 border border-slate-50 dark:border-slate-800">
            <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-100/40 dark:bg-cyan-500/10 rounded-full blur-3xl -mr-12 -mt-12 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-teal-100/40 dark:bg-teal-500/10 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none"></div>
            <div className="relative z-10 flex flex-col items-center py-2">
                <span className="text-slate-500 dark:text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-3">Потрачено за месяц</span>
                <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight mb-5">
                    {formatUZS(spentThisMonth)} <span className="text-xl text-slate-400 dark:text-slate-500 font-bold">UZS</span>
                </h2>
                <div className="flex gap-2">
                    <div className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-4 py-1.5 rounded-full text-[10px] font-bold border border-emerald-100 dark:border-emerald-900/50 shadow-sm">
                        В наличии: {inventory.filter(i=>i.quantity>0).length}
                    </div>
                    <div className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 px-4 py-1.5 rounded-full text-[10px] font-bold border border-rose-100 dark:border-rose-900/50 shadow-sm">
                        Закончилось: {inventory.filter(i=>i.quantity===0).length}
                    </div>
                </div>
            </div>
        </div>

        <div className="flex justify-center gap-8 mb-10">
            <label className="flex flex-col items-center gap-2 group cursor-pointer">
                <div className="w-16 h-16 bg-white dark:bg-slate-900 rounded-3xl shadow-lg shadow-cyan-500/10 dark:shadow-cyan-900/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400 border border-cyan-50 dark:border-cyan-900/30 group-hover:scale-105 active:scale-95 transition-all">
                    <Scan size={26} strokeWidth={2.5} />
                    <input type="file" accept="image/*" onChange={handleScanReceipt} className="hidden" />
                </div>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-tight">Чек</span>
            </label>
            <button onClick={handleVoiceInput} className="flex flex-col items-center gap-2 group">
                 <div className={`w-16 h-16 rounded-3xl shadow-lg flex items-center justify-center border transition-all ${isRecording ? 'bg-rose-500 text-white shadow-rose-500/30 border-rose-400 animate-pulse' : 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-violet-500/10 dark:shadow-violet-900/20 border-violet-50 dark:border-violet-900/30 group-hover:scale-105 active:scale-95'}`}>
                    <Mic size={26} strokeWidth={2.5} />
                </div>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-tight">{isRecording ? 'Стоп' : 'Голос'}</span>
            </button>
            <button onClick={() => setShowManualAdd(true)} className="flex flex-col items-center gap-2 group">
                <div className="w-16 h-16 bg-white dark:bg-slate-900 rounded-3xl shadow-lg shadow-emerald-500/10 dark:shadow-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 border border-emerald-50 dark:border-emerald-900/30 group-hover:scale-105 active:scale-95 transition-all">
                    <PlusCircle size={26} strokeWidth={2.5} />
                </div>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-tight">Вручную</span>
            </button>
        </div>

        <div className="relative mb-8 z-10">
            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                <Search size={18} className="text-slate-400" />
            </div>
            <input 
                type="text" 
                placeholder="Найти продукт..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border-none py-4 pl-14 pr-4 rounded-3xl shadow-sm text-sm font-medium focus:ring-2 focus:ring-cyan-500/20 outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600"
            />
        </div>

        <div className="mb-8">
            <div className="flex justify-between items-center mb-4 px-2">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Категории</h3>
                <button onClick={() => setActiveFilter('All')} className="text-cyan-600 dark:text-cyan-400 text-xs font-bold bg-cyan-50 dark:bg-cyan-900/30 px-3 py-1 rounded-full">Все</button>
            </div>
            <div className="grid grid-cols-4 gap-3"> 
                {Object.keys(CATEGORY_NAMES).map((cat) => {
                    const category = cat as Category;
                    const Icon = CATEGORY_ICONS[category];
                    const isActive = activeFilter === category;
                    return (
                        <button 
                            key={category}
                            onClick={() => setActiveFilter(isActive ? 'All' : category)}
                            className={`flex flex-col items-center justify-center p-2 rounded-2xl transition-all aspect-square border duration-200 ${isActive ? 'bg-slate-800 dark:bg-slate-700 text-white shadow-lg transform scale-105' : 'bg-white dark:bg-slate-900 border-transparent shadow-sm hover:shadow-md'}`}
                        >
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-1.5 transition-colors ${isActive ? 'bg-white/10 text-white' : CATEGORY_THEMES[category]}`}>
                                <Icon size={16} strokeWidth={2.5} />
                            </div>
                            <span className={`text-[9px] font-bold text-center leading-tight ${isActive ? 'text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                                {CATEGORY_NAMES[category].split(' ')[0]}
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>

        <div className="min-h-[200px]">
            {filteredInventory.length === 0 ? (
                 <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 text-center border border-dashed border-slate-200 dark:border-slate-800">
                    <p className="text-slate-400 text-xs font-medium">{searchQuery ? 'Ничего не найдено' : 'Здесь пока ничего нет'}</p>
                 </div>
            ) : activeFilter !== 'All' ? (
                // Filtered List (No Headers)
                <div className="space-y-3">
                     <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm mb-4 px-2">{CATEGORY_NAMES[activeFilter]}</h3>
                     {renderItemsList(filteredInventory.sort((a,b) => a.name.localeCompare(b.name)))}
                </div>
            ) : (
                // Grouped List (Headers)
                <div className="space-y-6">
                    {CATEGORY_ORDER.map(cat => {
                        // Strict Alphabetical Sort within Group
                        const items = filteredInventory.filter(i => i.category === cat).sort((a, b) => a.name.localeCompare(b.name));
                        if (items.length === 0) return null;
                        const Icon = CATEGORY_ICONS[cat];
                        return (
                            <div key={cat} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <div className="flex items-center gap-2 mb-3 px-2">
                                     <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${CATEGORY_THEMES[cat]} text-[10px]`}>
                                        <Icon size={14} />
                                     </div>
                                     <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{CATEGORY_NAMES[cat]}</h3>
                                     <span className="text-xs text-slate-400 font-medium">({items.length})</span>
                                </div>
                                <div className="space-y-3">
                                    {renderItemsList(items)}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
      </div>
    );
  };

  const renderRecipes = () => {
      // Sorting Logic
      const sortedRecipes = [...recipes].sort((a, b) => {
          if (recipeSortMode === 'rating') {
              return (b.rating || 0) - (a.rating || 0); // High rating first
          } else if (recipeSortMode === 'fastest') {
              // Usually defined items first, then undefined (treated as very slow/last)
              const timeA = a.cookingTime || 999;
              const timeB = b.cookingTime || 999;
              return timeA - timeB; // Ascending time
          }
          // Default: Popular (timesCooked)
          return b.timesCooked - a.timesCooked;
      });

      return (
      <div className="p-4 pt-20 pb-40 space-y-4">
          <div className="flex justify-between items-center px-1 mb-2">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Книга рецептов</h2>
              <button onClick={() => setShowAddRecipe(true)} className="w-10 h-10 bg-slate-900 dark:bg-slate-700 text-white rounded-full flex items-center justify-center shadow-lg shadow-slate-900/20 active:scale-90 transition-transform"><PlusCircle size={20} /></button>
          </div>

          {/* Sort Controls */}
          {recipes.length > 0 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                  {[
                      { id: 'popular', label: 'Популярные', icon: Utensils },
                      { id: 'fastest', label: 'Быстрые', icon: Clock },
                      { id: 'rating', label: 'Рейтинг', icon: Star },
                  ].map(opt => {
                      const isActive = recipeSortMode === opt.id;
                      const Icon = opt.icon;
                      return (
                          <button 
                            key={opt.id}
                            onClick={() => setRecipeSortMode(opt.id as any)}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap border ${isActive ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-700 dark:border-slate-700' : 'bg-white text-slate-600 border-slate-100 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800'}`}
                          >
                             <Icon size={12} fill={isActive && opt.id === 'rating' ? 'currentColor' : 'none'} /> {opt.label}
                          </button>
                      )
                  })}
              </div>
          )}

          {sortedRecipes.length === 0 && (
               <div className="flex flex-col items-center justify-center py-20 text-slate-300 dark:text-slate-600">
                   <BookOpen size={32} className="mb-4 opacity-50"/>
                   <p className="font-medium text-sm">Нет сохраненных рецептов</p>
               </div>
          )}
          {sortedRecipes.map(recipe => (
              <div key={recipe.id} onClick={() => setSelectedRecipe(recipe)} className="bg-white dark:bg-slate-900 rounded-3xl p-3 shadow-sm hover:shadow-md transition-all border border-slate-50 dark:border-slate-800 flex gap-4 cursor-pointer group">
                  <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden flex-shrink-0 relative">
                      <img src={recipe.imageUrl} alt={recipe.title} className="w-full h-full object-cover transition-opacity duration-500" />
                      {recipe.imageUrl?.includes('loremflickr') && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                              <Sparkles className="text-white animate-pulse" size={20} />
                          </div>
                      )}
                  </div>
                  <div className="flex-1 py-1 flex flex-col justify-center">
                      <h3 className="font-bold text-slate-800 dark:text-slate-200 text-base">{recipe.title}</h3>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 line-clamp-2 leading-relaxed">{recipe.instructions[0]}</p>
                      <div className="flex items-center gap-3 mt-2">
                          <span className="text-[10px] font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full flex items-center border border-amber-100 dark:border-amber-900/50">
                              <Sparkles size={10} className="mr-1" /> {recipe.timesCooked}
                          </span>
                          {recipe.cookingTime && (
                              <span className="text-[10px] font-bold text-slate-400 flex items-center">
                                  <Clock size={10} className="mr-1" /> {recipe.cookingTime} мин
                              </span>
                          )}
                          {recipe.rating ? (
                             <span className="text-[10px] font-bold text-amber-500 flex items-center">
                                  <Star size={10} fill="currentColor" className="mr-1" /> {recipe.rating}
                              </span>
                          ) : null}
                      </div>
                  </div>
                  <div className="self-center pr-2"><ArrowRight size={16} className="text-slate-300 dark:text-slate-600" /></div>
              </div>
          ))}
          {showAddRecipe && (
              <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
                  <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm shadow-2xl transform transition-all scale-100 border border-slate-100 dark:border-slate-800">
                      <h3 className="font-bold text-xl mb-2 text-slate-800 dark:text-slate-200">Новый рецепт</h3>
                      <p className="text-slate-500 text-xs mb-4">Вставьте ссылку, текст или название блюда.</p>
                      <textarea className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 text-sm h-32 mb-4 focus:ring-2 focus:ring-violet-500/20 outline-none resize-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400" placeholder="например, 'Паста Карбонара'..." id="recipeInput" />
                      <div className="flex gap-3">
                          <button onClick={() => setShowAddRecipe(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors text-sm">Отмена</button>
                          <button onClick={() => { const val = (document.getElementById('recipeInput') as HTMLTextAreaElement).value; if(val) handleAddRecipe(val); }} className="flex-1 py-3 bg-violet-600 dark:bg-violet-700 text-white rounded-xl font-bold shadow-lg shadow-violet-200 dark:shadow-none hover:bg-violet-700 dark:hover:bg-violet-600 transition-colors text-sm">Создать</button>
                      </div>
                  </div>
              </div>
          )}
          {selectedRecipe && (
              <div className="fixed inset-0 bg-white dark:bg-slate-950 z-50 overflow-y-auto animate-in slide-in-from-bottom duration-300">
                  <div className="relative h-64">
                    <img src={selectedRecipe.imageUrl} className="w-full h-full object-cover transition-all duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-black/30 dark:from-slate-950"></div>
                    <button onClick={() => setSelectedRecipe(null)} className="absolute top-4 left-4 p-2 bg-white/20 backdrop-blur-md border border-white/30 rounded-full text-white hover:bg-white/40 transition-colors"><ArrowRight className="rotate-180" size={20} /></button>
                    {selectedRecipe.imageUrl?.includes('loremflickr') && (
                        <div className="absolute bottom-4 right-4 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full text-white text-xs font-bold flex items-center">
                            <Sparkles className="animate-spin mr-2" size={12} />
                            Рисую фото...
                        </div>
                    )}
                  </div>
                  <div className="px-6 -mt-8 relative z-10">
                      <div className="bg-white dark:bg-slate-900 rounded-t-3xl shadow-xl p-6 pb-32 min-h-screen border-t border-slate-100 dark:border-slate-800">
                        <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-6"></div>
                        <div className="flex justify-between items-start mb-2">
                             <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white leading-tight flex-1 mr-4">{selectedRecipe.title}</h2>
                             {/* Rating Interaction */}
                             <div className="flex gap-1 bg-slate-50 dark:bg-slate-800 p-2 rounded-xl">
                                {[1, 2, 3, 4, 5].map(star => (
                                    <button 
                                        key={star} 
                                        onClick={() => updateRecipeRating(selectedRecipe.id, star)}
                                        className="active:scale-125 transition-transform"
                                    >
                                        <Star 
                                            size={20} 
                                            className={star <= (selectedRecipe.rating || 0) ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600"} 
                                        />
                                    </button>
                                ))}
                             </div>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-3 mb-6">
                            <span className="flex items-center text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-3 py-1 rounded-full border border-amber-100 dark:border-amber-900/50">
                                <Utensils size={12} className="mr-1.5"/> {selectedRecipe.timesCooked} раз приготовлено
                            </span>
                             {selectedRecipe.cookingTime && (
                                <span className="flex items-center text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-100 dark:border-slate-700">
                                    <Clock size={12} className="mr-1.5"/> {selectedRecipe.cookingTime} мин
                                </span>
                             )}
                        </div>

                        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200 mb-3">Ингредиенты</h3>
                        <div className="space-y-2 mb-8">
                            {selectedRecipe.ingredients.map((ing, i) => {
                                const inStock = checkIngredientStock(ing.name);
                                return (
                                    <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                                        <div><p className="font-bold text-slate-700 dark:text-slate-300 text-sm">{ing.name}</p><p className="text-xs text-slate-400 dark:text-slate-500 font-medium mt-0.5">{ing.quantity}</p></div>
                                        {inStock ? <div className="text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 p-1 rounded-full"><CheckCircle2 size={14} strokeWidth={3} /></div> : <div className="text-rose-400 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-400 p-1 rounded-full"><AlertCircle size={14} strokeWidth={3} /></div>}
                                    </div>
                                )
                            })}
                            <button onClick={() => addMissingToShop(selectedRecipe)} className="w-full py-3 mt-2 text-violet-600 dark:text-violet-400 text-sm font-bold border border-violet-100 dark:border-violet-900 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors">Добавить недостающее в список</button>
                        </div>
                        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200 mb-3">Инструкция</h3>
                        <div className="space-y-6 relative pl-4 border-l-2 border-slate-100 dark:border-slate-800 ml-2 mb-10">
                            {selectedRecipe.instructions.map((step, i) => (
                                <div key={i} className="relative pl-6"><span className="absolute -left-[29px] top-0 w-6 h-6 rounded-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-[10px] font-bold flex items-center justify-center text-slate-400 dark:text-slate-500">{i + 1}</span><p className="text-slate-600 dark:text-slate-400 leading-relaxed font-medium text-sm">{step}</p></div>
                            ))}
                        </div>
                        <button onClick={() => handleCookRecipe(selectedRecipe)} className="w-full py-4 bg-slate-900 dark:bg-slate-700 text-white rounded-xl font-bold shadow-xl shadow-slate-900/20 dark:shadow-none flex items-center justify-center active:scale-95 transition-transform hover:bg-slate-800 dark:hover:bg-slate-600"><ChefHat size={20} className="mr-2" /> Начать готовить</button>
                      </div>
                  </div>
              </div>
          )}
      </div>
    );
  };

  const renderList = () => (
    <div className="p-4 pt-20 pb-40">
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-xl shadow-slate-200/50 dark:shadow-slate-950/50 border border-slate-50 dark:border-slate-800 overflow-hidden min-h-[50vh]">
        <div className="p-6 border-b border-slate-50 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Список покупок</h2>
            <p className="text-xs text-slate-400 font-medium mt-1">{shoppingList.filter(i => !i.checked).length} осталось купить</p>
        </div>
        
        {/* Quick Add Input */}
        <div className="px-6 pt-6 pb-2">
            <div className="relative flex items-center shadow-sm rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 focus-within:ring-2 focus-within:ring-cyan-500/20 outline-none transition-all">
                <input 
                    value={quickAddText}
                    onChange={(e) => setQuickAddText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
                    placeholder="Быстро добавить (Enter)..."
                    className="w-full bg-transparent rounded-2xl pl-4 pr-12 py-3.5 text-sm font-medium outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-500"
                />
                <button onClick={handleQuickAdd} className="absolute right-2 p-2 bg-slate-900 dark:bg-slate-700 text-white rounded-xl shadow-md active:scale-95 transition-transform hover:bg-slate-800 dark:hover:bg-slate-600">
                    <Plus size={18} />
                </button>
            </div>
        </div>

        <div className="p-4">
            {shoppingList.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-20 text-slate-300 dark:text-slate-600"><ShoppingCart size={40} className="mb-4 opacity-50"/><p className="font-medium text-sm">Список пуст</p></div>
            ) : (
               shoppingList.map((item, idx) => (
                <div key={item.id} className={`flex items-center p-4 rounded-3xl transition-all mb-2 ${item.checked ? 'bg-slate-50 dark:bg-slate-800/50 opacity-50' : 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm'}`}>
                  <button onClick={() => { const newList = [...shoppingList]; newList[idx].checked = !newList[idx].checked; setShoppingList(newList); }} className={`w-6 h-6 rounded-full border-2 mr-4 flex items-center justify-center transition-colors flex-shrink-0 ${item.checked ? 'border-cyan-500 bg-cyan-500 dark:border-cyan-600 dark:bg-cyan-600' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'}`}>
                    {item.checked && <CheckCircle2 size={14} className="text-white" strokeWidth={3} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-sm transition-all truncate ${item.checked ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}`}>{item.name}</p>
                    {item.id.includes('auto') || item.id.includes('smart') ? <span className="text-[9px] bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider mt-1 inline-block">Авто</span> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-xl">{item.quantity}</span>
                    <button onClick={() => { setShoppingList(shoppingList.filter(i => i.id !== item.id)); if (item.id.startsWith('auto-') || item.id.startsWith('smart-')) { setDismissedItems(prev => [...prev, item.name]); }}} className="w-10 h-10 flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-full transition-colors active:scale-95"><Trash2 size={18} /></button>
                  </div>
                </div>
              ))
            )}
        </div>
      </div>
      <button onClick={startFinishShopping} className="mt-4 w-full py-5 bg-slate-900 dark:bg-slate-700 text-white rounded-3xl font-bold shadow-xl shadow-slate-900/10 dark:shadow-none flex items-center justify-center active:scale-95 transition-transform hover:bg-slate-800 dark:hover:bg-slate-600 text-sm">Завершить покупки <ArrowRight size={16} className="ml-2" /></button>
    </div>
  );

  const renderStats = () => (
    <div className="p-4 pt-20 pb-40 space-y-6">
      <ExpenseAnalytics expenses={expenses} recipes={recipes} />

      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-rose-100 dark:border-rose-900/40">
        <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-2">
          Сброс данных
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Это действие полностью очистит холодильник, список покупок, рецепты и статистику.
        </p>
        <button
          onClick={resetAllData}
          className="w-full py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-bold shadow-lg shadow-rose-500/20 transition-colors text-sm"
        >
          Сбросить данные приложения
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen font-sans bg-[#F8FAFC] dark:bg-slate-950 transition-colors duration-300">
      <Header 
        title="Умный Холодильник" 
        onAssistant={() => setLiveAssistantOpen(true)} 
        onSmartOrganize={handleSmartOrganize} 
        onRetrySync={() => updateFamilyData({
          inventory,
          shoppingList,
          recipes,
          expenses,
          updatedAt: Date.now()
        })}
        syncStatus={syncStatus}
        theme={theme}
        toggleTheme={toggleTheme}
      />
      
      <main className="max-w-md mx-auto relative z-10">
        {activeTab === AppTab.Fridge && renderDashboard()}
        {activeTab === AppTab.Recipes && renderRecipes()}
        {activeTab === AppTab.List && renderList()}
        {activeTab === AppTab.Stats && renderStats()}
      </main>

      {/* Floating Modern Navigation */}
      <nav className="fixed bottom-6 left-6 right-6 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl border border-white/40 dark:border-slate-800 rounded-[2rem] shadow-2xl shadow-slate-200/50 dark:shadow-black/50 p-2 z-40 max-w-md mx-auto flex justify-between items-center">
        {[
          { id: AppTab.Fridge, icon: LayoutGrid, label: 'Главная' },
          { id: AppTab.Recipes, icon: BookOpen, label: 'Рецепты' },
          { id: AppTab.List, icon: ShoppingCart, label: 'Корзина' },
          { id: AppTab.Stats, icon: PieChart, label: 'Инфо' },
        ].map(tab => {
             const isActive = activeTab === tab.id;
             return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl transition-all duration-300 relative ${isActive ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              >
                {isActive && <div className="absolute -top-2 w-8 h-1 bg-cyan-500 dark:bg-cyan-400 rounded-b-full shadow-lg shadow-cyan-500/50 dark:shadow-cyan-400/50"></div>}
                <tab.icon size={24} strokeWidth={isActive ? 2.5 : 2} className="transition-transform duration-300" />
              </button>
            )
        })}
      </nav>

      {/* Manual Add Modal (Smart Auto-Category) */}
      {showManualAdd && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-200">
             <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 w-full max-w-sm shadow-2xl border border-slate-100 dark:border-slate-800">
                 <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-xl text-slate-800 dark:text-slate-200">Добавить продукт</h3>
                    <button onClick={() => setShowManualAdd(false)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                        <X size={20} />
                    </button>
                 </div>
                 <form onSubmit={handleManualSubmit} className="space-y-4">
                     <div>
                         <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Название</label>
                         <input 
                            name="name" 
                            required 
                            placeholder="например, Молоко" 
                            className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-cyan-500/20 outline-none font-medium placeholder:text-slate-300 dark:placeholder:text-slate-600 text-slate-900 dark:text-white" 
                            autoFocus 
                            value={manualAddName}
                            onChange={(e) => {
                                const val = e.target.value;
                                setManualAddName(val);
                                // No manual auto-cat anymore, fully async on submit
                            }}
                         />
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Количество</label>
                            <input type="number" step="0.1" name="quantity" defaultValue="1" className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-cyan-500/20 outline-none font-medium text-slate-900 dark:text-white" />
                         </div>
                         <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Ед. изм.</label>
                            <input name="unit" list="units" defaultValue="шт" className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-cyan-500/20 outline-none font-medium text-slate-900 dark:text-white" />
                            <datalist id="units"><option value="шт" /><option value="кг" /><option value="л" /><option value="уп" /></datalist>
                         </div>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Категория</label>
                        <div className="relative">
                            <select 
                                name="category" 
                                className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-cyan-500/20 outline-none font-medium appearance-none text-slate-900 dark:text-white"
                                value={manualAddCategory}
                                onChange={(e) => setManualAddCategory(e.target.value as Category)}
                            >
                                <option value="Other">Авто (ИИ определит)</option>
                                {Object.entries(CATEGORY_NAMES).map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><ArrowRight size={14} className="rotate-90" /></div>
                        </div>
                     </div>
                     <div>
                         <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Цена (UZS)</label>
                         <input type="number" step="100" name="price" placeholder="0" className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-cyan-500/20 outline-none font-medium placeholder:text-slate-300 dark:placeholder:text-slate-600 text-slate-900 dark:text-white" />
                     </div>
                     <button type="submit" className="w-full py-4 bg-slate-900 dark:bg-slate-700 text-white rounded-2xl font-bold shadow-xl shadow-slate-900/10 dark:shadow-none hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors mt-4 text-sm flex items-center justify-center">
                        {isProcessing ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
                        Добавить
                     </button>
                 </form>
             </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-200">
             <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 w-full max-w-sm shadow-2xl border border-slate-100 dark:border-slate-800">
                 <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-xl text-slate-800 dark:text-slate-200 flex items-center gap-2"><Edit2 size={18} /> Редактировать</h3>
                    <button onClick={() => setEditingItem(null)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                        <X size={20} />
                    </button>
                 </div>
                 <form onSubmit={handleEditSubmit} className="space-y-4">
                     <div>
                         <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Название</label>
                         <input name="name" defaultValue={editingItem.name} className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-cyan-500/20 outline-none font-medium text-slate-900 dark:text-white" />
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Количество</label>
                            <input type="number" step="0.1" name="quantity" defaultValue={editingItem.quantity} className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-cyan-500/20 outline-none font-medium text-slate-900 dark:text-white" />
                         </div>
                         <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Ед. изм.</label>
                            <input name="unit" defaultValue={editingItem.unit} className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-cyan-500/20 outline-none font-medium text-slate-900 dark:text-white" />
                         </div>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Категория</label>
                        <div className="relative">
                            <select name="category" defaultValue={editingItem.category} className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-cyan-500/20 outline-none font-medium appearance-none text-slate-900 dark:text-white">
                                {Object.entries(CATEGORY_NAMES).map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><ArrowRight size={14} className="rotate-90" /></div>
                        </div>
                     </div>
                     <div>
                         <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Цена (UZS)</label>
                         <input type="number" step="100" name="price" defaultValue={editingItem.price || 0} className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-cyan-500/20 outline-none font-medium text-slate-900 dark:text-white" />
                     </div>
                     <button type="submit" className="w-full py-4 bg-slate-900 dark:bg-slate-700 text-white rounded-2xl font-bold shadow-xl shadow-slate-900/10 dark:shadow-none hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors mt-4 text-sm">Сохранить</button>
                     <button type="button" onClick={handleRegenerateImage} className="w-full py-3 bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-2xl font-bold hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors text-xs flex items-center justify-center gap-2">
                        <ImageIcon size={16} /> Сгенерировать новое фото
                     </button>
                 </form>
             </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isProcessing && <LoadingOverlay message={loadingMessage} />}

      {/* Finish Shopping Modal */}
      {showFinishModal && (
          <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200">
             <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl border border-slate-100 dark:border-slate-800 text-center">
                 <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-600 dark:text-emerald-400">
                     <CheckCircle2 size={40} />
                 </div>
                 <h3 className="font-bold text-2xl text-slate-800 dark:text-slate-200 mb-2">Покупки завершены!</h3>
                 <p className="text-slate-500 mb-8">Вы купили {pendingPurchases.length} товаров. Они добавлены в холодильник.</p>
                 <button onClick={confirmFinishShopping} className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold shadow-xl shadow-emerald-500/20 transition-all text-sm">Отлично</button>
             </div>
          </div>
      )}
      
      {/* LIVE ASSISTANT COMPONENT */}
      {isLiveAssistantOpen && (
        <LiveAssistant 
            isActive={isLiveAssistantOpen}
            onClose={() => setLiveAssistantOpen(false)}
            onToolUse={handleVoiceToolUse}
        />
      )}

    </div>
  );
}