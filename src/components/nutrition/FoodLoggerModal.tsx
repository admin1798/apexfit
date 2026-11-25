import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertCircle,
  BookmarkPlus,
  Check,
  ChefHat,
  Database,
  Loader2,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import { useState } from 'react';
import {
  OFFLINE_FOOD_DATABASE,
  computeUnitMultiplier,
  parseMealOffline,
  type FoodCategory,
} from '../../data/offlineFoods';
import { db } from '../../db/database';
import { DEFAULT_PROFILE_ID } from '../../db/seed';
import { parseMealWithGemini } from '../../services/geminiFoodParser';
import { enqueueSyncMutation } from '../../services/syncService';
import type { CustomFoodItem, FoodUnit, MealSlot, ParsedFoodItem, SavedMeal } from '../../types';
import { ModalShell } from '../ui/Overlay';
import { Badge, Button, Input, SearchInput } from '../ui/primitives';
import { useToast } from '../ui/toastContext';

interface FoodLoggerModalProps {
  isOpen: boolean;
  dateKey: string;
  initialSlot: MealSlot;
  onClose: () => void;
  onOpenSettings: () => void;
}

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks / Pre-Post',
  custom: 'Custom Meal',
};

const CATEGORIES: Array<FoodCategory | 'All' | 'Custom'> = [
  'All',
  'Bengali Foods',
  'Indian Staples',
  'Rice, Roti & Dal',
  'Protein & Meat',
  'Fish & Eggs',
  'Dairy & Fats',
  'Fruits & Veg',
  'Packaged & Snacks',
  'International',
  'Custom',
];

const FOOD_UNITS: Array<{ id: FoodUnit; label: string }> = [
  { id: 'serving', label: 'Serving' },
  { id: '100g', label: '100g' },
  { id: 'piece', label: 'Piece' },
  { id: 'bowl', label: 'Bowl' },
  { id: 'cup', label: 'Cup' },
  { id: 'custom', label: 'Grams' },
];

export function FoodLoggerModal({
  isOpen,
  dateKey,
  initialSlot,
  onClose,
  onOpenSettings,
}: FoodLoggerModalProps) {
  const [slot, setSlot] = useState<MealSlot>(initialSlot);
  const [customMealName, setCustomMealName] = useState('Post-Workout Meal');
  const [mode, setMode] = useState<'ai' | 'database' | 'meals' | 'custom'>('ai');
  const [nlText, setNlText] = useState('');
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<ParsedFoodItem[]>([]);
  const [previewSource, setPreviewSource] = useState<'ai' | 'offline'>('ai');

  // Database search & unit selection
  const [searchQuery, setSearchQuery] = useState('');
  const [catFilter, setCatFilter] = useState<FoodCategory | 'All' | 'Custom'>('All');
  const [unitMap, setUnitMap] = useState<Record<string, FoodUnit>>({});
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});

  // Custom food form
  const [customName, setCustomName] = useState('');
  const [customServing, setCustomServing] = useState('1 serving (100g)');
  const [customCalories, setCustomCalories] = useState('');
  const [customProtein, setCustomProtein] = useState('');
  const [customCarbs, setCustomCarbs] = useState('');
  const [customFats, setCustomFats] = useState('');
  const [customFiber, setCustomFiber] = useState('');

  const { showToast } = useToast();
  const profile = useLiveQuery(() => db.profile.get(DEFAULT_PROFILE_ID), []);
  const customFoods = useLiveQuery(() => db.customFoods.toArray(), [], []);
  const savedMeals = useLiveQuery(() => db.savedMeals.toArray(), [], []);

  if (!isOpen) return null;

  const hasApiKey = Boolean(profile?.geminiApiKey?.trim());

  async function handleParseWithGemini() {
    if (!nlText.trim()) return;
    setIsLoadingAi(true);
    setAiError(null);
    setParsedPreview([]);

    try {
      const items = await parseMealWithGemini(nlText, profile?.geminiApiKey ?? '');
      setParsedPreview(items);
      setPreviewSource('ai');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to parse meal.';
      if (msg === 'NO_API_KEY') {
        setAiError('NO_API_KEY');
      } else if (msg === 'OFFLINE') {
        setAiError('Offline mode: tap "Parse Offline" below to log using the built-in Bengali, Indian & gym food database.');
      } else {
        setAiError(msg);
      }
    } finally {
      setIsLoadingAi(false);
    }
  }

  function handleParseOffline() {
    if (!nlText.trim()) return;
    setAiError(null);
    const items = parseMealOffline(nlText);
    if (items.length === 0) {
      setAiError(
        'No offline food matched that phrase. Try e.g. "2 rotis, 1 bowl dal tadka, 150g paneer" or browse the Food DB tab.'
      );
      setParsedPreview([]);
      return;
    }
    setParsedPreview(items);
    setPreviewSource('offline');
  }

  async function handleCommitPreview() {
    if (parsedPreview.length === 0) return;
    const now = new Date().toISOString();
    const entries = parsedPreview.map((item, idx) => ({
      id: `food-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      date: dateKey,
      mealSlot: slot,
      customMealName: slot === 'custom' ? customMealName.trim() || 'Custom Meal' : undefined,
      name: item.name,
      servingSize: item.servingSize,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fats: item.fats,
      fiber: item.fiber ?? 0,
      source: previewSource,
      createdAt: now,
    }));

    await db.foodLogs.bulkAdd(entries);
    for (const e of entries) {
      await enqueueSyncMutation('foodLog', e.id, 'upsert', e);
    }
    showToast(`Added ${entries.length} item(s) to ${SLOT_LABELS[slot]}`, 'success');
    setNlText('');
    setParsedPreview([]);
    onClose();
  }

  async function handleAddDatabaseFood(
    foodId: string,
    foodData: {
      name: string;
      servingSize: string;
      gramsPerServing: number;
      baseUnit: FoodUnit;
      calories: number;
      protein: number;
      carbs: number;
      fats: number;
      fiber: number;
    }
  ) {
    const chosenUnit = unitMap[foodId] ?? foodData.baseUnit;
    const chosenQty = Math.max(0.1, parseFloat(qtyMap[foodId] ?? '1') || 1);
    const { multiplier, label } = computeUnitMultiplier(foodData, chosenUnit, chosenQty);

    const entry = {
      id: `food-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      date: dateKey,
      mealSlot: slot,
      customMealName: slot === 'custom' ? customMealName.trim() || 'Custom Meal' : undefined,
      name: foodData.name,
      servingSize: chosenUnit === foodData.baseUnit && chosenQty === 1 ? foodData.servingSize : label,
      unit: chosenUnit,
      quantity: chosenQty,
      calories: Math.round(foodData.calories * multiplier),
      protein: Math.round(foodData.protein * multiplier * 10) / 10,
      carbs: Math.round(foodData.carbs * multiplier * 10) / 10,
      fats: Math.round(foodData.fats * multiplier * 10) / 10,
      fiber: Math.round(foodData.fiber * multiplier * 10) / 10,
      source: 'offline' as const,
      createdAt: new Date().toISOString(),
    };

    await db.foodLogs.add(entry);
    await enqueueSyncMutation('foodLog', entry.id, 'upsert', entry);
    showToast(`Added ${entry.name}`, 'success');
    onClose();
  }

  async function handleLogSavedMeal(meal: SavedMeal) {
    const divisor = meal.isRecipe ? Math.max(1, meal.servingsYield) : 1;
    const entry = {
      id: `food-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      date: dateKey,
      mealSlot: slot,
      customMealName: slot === 'custom' ? customMealName.trim() || 'Custom Meal' : undefined,
      name: meal.name,
      servingSize: meal.isRecipe ? `1 of ${meal.servingsYield} recipe servings` : '1 saved meal',
      calories: Math.round(meal.totalCalories / divisor),
      protein: Math.round((meal.totalProtein / divisor) * 10) / 10,
      carbs: Math.round((meal.totalCarbs / divisor) * 10) / 10,
      fats: Math.round((meal.totalFats / divisor) * 10) / 10,
      fiber: Math.round((meal.totalFiber / divisor) * 10) / 10,
      source: meal.isRecipe ? ('recipe' as const) : ('offline' as const),
      createdAt: new Date().toISOString(),
    };

    await db.foodLogs.add(entry);
    await enqueueSyncMutation('foodLog', entry.id, 'upsert', entry);
    showToast(`Logged ${meal.name}`, 'success');
    onClose();
  }

  async function handleCreateCustomFood(e: React.FormEvent) {
    e.preventDefault();
    if (!customName.trim()) return;
    const p = parseFloat(customProtein) || 0;
    const c = parseFloat(customCarbs) || 0;
    const f = parseFloat(customFats) || 0;
    const fib = parseFloat(customFiber) || 0;
    const cal = parseFloat(customCalories) || Math.round(p * 4 + c * 4 + f * 9);

    const newFood: CustomFoodItem = {
      id: `cfood-${Date.now()}`,
      name: customName.trim(),
      category: 'Custom',
      servingSize: customServing.trim() || '1 serving',
      baseUnit: 'serving',
      gramsPerServing: 100,
      calories: Math.round(cal),
      protein: Math.round(p * 10) / 10,
      carbs: Math.round(c * 10) / 10,
      fats: Math.round(f * 10) / 10,
      fiber: Math.round(fib * 10) / 10,
      createdAt: new Date().toISOString(),
    };

    await db.customFoods.put(newFood);
    await enqueueSyncMutation('customFood', newFood.id, 'upsert', newFood);

    // Also log immediately to current slot
    await handleAddDatabaseFood(newFood.id, {
      name: newFood.name,
      servingSize: newFood.servingSize,
      gramsPerServing: 100,
      baseUnit: 'serving',
      calories: newFood.calories,
      protein: newFood.protein,
      carbs: newFood.carbs,
      fats: newFood.fats,
      fiber: newFood.fiber ?? 0,
    });
  }

  const combinedDatabase = [
    ...customFoods.map((cf) => ({
      id: cf.id,
      name: cf.name,
      category: 'Custom' as const,
      servingSize: cf.servingSize,
      baseUnit: cf.baseUnit,
      gramsPerServing: cf.gramsPerServing ?? 100,
      calories: cf.calories,
      protein: cf.protein,
      carbs: cf.carbs,
      fats: cf.fats,
      fiber: cf.fiber ?? 0,
      aliases: [] as string[],
    })),
    ...OFFLINE_FOOD_DATABASE,
  ].filter((f) => {
    const catOk = catFilter === 'All' || f.category === catFilter;
    const qOk =
      searchQuery.trim() === '' ||
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.aliases.some((a) => a.includes(searchQuery.toLowerCase()));
    return catOk && qOk;
  });

  return (
    <ModalShell
      isOpen={isOpen}
      title="Log Nutrition"
      subtitle={`${dateKey} • ${SLOT_LABELS[slot]}`}
      onClose={onClose}
    >
      <div className="space-y-3.5">
        {/* Meal Slot Pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {(Object.keys(SLOT_LABELS) as MealSlot[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSlot(s)}
              className={`min-h-[36px] shrink-0 rounded-full px-3 text-xs font-semibold transition ${
                slot === s
                  ? 'bg-[#B7F36B] text-[#101211]'
                  : 'border border-[#303832] bg-[#1D221F] text-[#A1AAA3]'
              }`}
            >
              {SLOT_LABELS[s]}
            </button>
          ))}
        </div>

        {slot === 'custom' && (
          <Input
            label="Custom Meal Name"
            value={customMealName}
            onChange={(e) => setCustomMealName(e.target.value)}
            placeholder="e.g. Pre-Workout Shake"
          />
        )}

        {/* Mode Switcher */}
        <div className="grid grid-cols-4 rounded-2xl border border-[#303832] bg-[#171A18] p-1">
          {[
            { id: 'ai' as const, label: 'AI / NL', icon: Sparkles },
            { id: 'database' as const, label: 'Food DB', icon: Database },
            { id: 'meals' as const, label: 'Recipes', icon: ChefHat },
            { id: 'custom' as const, label: 'Custom', icon: Plus },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`flex min-h-[38px] items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition ${
                mode === id ? 'bg-[#252B27] text-[#B7F36B]' : 'text-[#A1AAA3]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {mode === 'ai' && (
          <div className="space-y-3">
            <div className="rounded-3xl border border-[#252B28] bg-[#1D221F] p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B7F36B]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Gemini 2.5 Flash Meal Parser
                </span>
                <Badge tone={hasApiKey ? 'success' : 'warning'}>
                  {hasApiKey ? 'API Key Ready' : 'No API Key'}
                </Badge>
              </div>

              <textarea
                rows={3}
                value={nlText}
                onChange={(e) => setNlText(e.target.value)}
                placeholder='e.g. "2 rotis, 1 bowl dal tadka, 150g grilled paneer, and 1 cup curd"'
                className="w-full rounded-2xl border border-[#303832] bg-[#171A18] p-3 text-sm text-[#F3F5F2] placeholder:text-[#727B74] focus:border-[#B7F36B] focus:outline-none"
              />

              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setNlText('2 rotis, 1 bowl dal tadka, 150g grilled paneer, and 1 cup curd')
                  }
                  className="rounded-lg bg-[#252B27] px-2.5 py-1 text-[11px] text-[#A1AAA3] hover:text-[#F3F5F2]"
                >
                  Sample Indian Dinner
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setNlText('1 cup rice, 1 bowl masoor dal, 1 bowl macher jhol')
                  }
                  className="rounded-lg bg-[#252B27] px-2.5 py-1 text-[11px] text-[#A1AAA3] hover:text-[#F3F5F2]"
                >
                  Sample Bengali Lunch
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  onClick={handleParseWithGemini}
                  disabled={isLoadingAi || !nlText.trim()}
                >
                  {isLoadingAi ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Parse with Gemini
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleParseOffline}
                  disabled={!nlText.trim()}
                >
                  <Database className="h-4 w-4 text-[#79B8F5]" />
                  Parse Offline
                </Button>
              </div>
            </div>

            {aiError && (
              <div className="rounded-2xl border border-[#EAB765]/30 bg-[#EAB765]/10 p-3.5 text-xs text-[#F3F5F2]">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#EAB765]" />
                  <div className="space-y-2">
                    {aiError === 'NO_API_KEY' ? (
                      <>
                        <p>
                          Add your Gemini API key in Settings for cloud AI parsing, or tap{' '}
                          <strong>Parse Offline</strong> right now.
                        </p>
                        <Button
                          size="sm"
                          onClick={() => {
                            onClose();
                            onOpenSettings();
                          }}
                        >
                          Add Gemini Key in Settings
                        </Button>
                      </>
                    ) : (
                      <p>{aiError}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {parsedPreview.length > 0 && (
              <div className="space-y-2.5 rounded-3xl border border-[#B7F36B]/30 bg-[#1D221F] p-3.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#B7F36B]">
                    Parsed Items ({parsedPreview.length}) • {previewSource.toUpperCase()}
                  </h3>
                  <span className="tabular-nums text-xs font-semibold text-[#F3F5F2]">
                    {parsedPreview.reduce((s, i) => s + i.calories, 0)} kcal
                  </span>
                </div>

                {parsedPreview.map((item, idx) => (
                  <div
                    key={`${item.name}-${idx}`}
                    className="rounded-2xl border border-[#252B28] bg-[#171A18] p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#F3F5F2]">{item.name}</p>
                        <p className="text-xs text-[#A1AAA3]">{item.servingSize}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setParsedPreview((prev) => prev.filter((_, i) => i !== idx))
                        }
                        aria-label="Remove parsed item"
                        className="text-[#727B74] hover:text-[#E87979]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 tabular-nums text-xs">
                      <span className="font-bold text-[#F3F5F2]">{item.calories} kcal</span>
                      <span className="text-[#B7F36B]">P {item.protein}g</span>
                      <span className="text-[#79B8F5]">C {item.carbs}g</span>
                      <span className="text-[#EAB765]">F {item.fats}g</span>
                      <span className="text-[#75D69A]">Fib {item.fiber ?? 0}g</span>
                    </div>
                  </div>
                ))}

                <Button className="w-full" size="lg" onClick={handleCommitPreview}>
                  <Check className="h-4 w-4" />
                  Add All to {SLOT_LABELS[slot]}
                </Button>
              </div>
            )}
          </div>
        )}

        {mode === 'database' && (
          <div className="space-y-3">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search Bengali, Indian, packaged, fish, eggs..."
            />

            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCatFilter(cat)}
                  className={`min-h-[34px] shrink-0 rounded-full px-3 text-[11px] font-semibold transition ${
                    catFilter === cat
                      ? 'bg-[#B7F36B] text-[#101211]'
                      : 'border border-[#303832] bg-[#1D221F] text-[#A1AAA3]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {combinedDatabase.map((food) => {
                const chosenUnit = unitMap[food.id] ?? food.baseUnit;
                const chosenQty = parseFloat(qtyMap[food.id] ?? '1') || 1;
                const { multiplier } = computeUnitMultiplier(food, chosenUnit, chosenQty);

                return (
                  <div
                    key={food.id}
                    className="rounded-2xl border border-[#252B28] bg-[#1D221F] p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#B7F36B]">
                          {food.category}
                        </span>
                        <h4 className="truncate text-sm font-semibold text-[#F3F5F2]">{food.name}</h4>
                        <p className="text-xs text-[#A1AAA3]">Base: {food.servingSize}</p>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handleAddDatabaseFood(food.id, food)}
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </Button>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#252B28] pt-2">
                      <div className="flex items-center gap-2.5 tabular-nums text-xs">
                        <span className="font-bold text-[#F3F5F2]">
                          {Math.round(food.calories * multiplier)} kcal
                        </span>
                        <span className="text-[#B7F36B]">
                          P {Math.round(food.protein * multiplier * 10) / 10}g
                        </span>
                        <span className="text-[#79B8F5]">
                          C {Math.round(food.carbs * multiplier * 10) / 10}g
                        </span>
                        <span className="text-[#EAB765]">
                          F {Math.round(food.fats * multiplier * 10) / 10}g
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={qtyMap[food.id] ?? '1'}
                          onChange={(e) => setQtyMap((p) => ({ ...p, [food.id]: e.target.value }))}
                          aria-label={`Quantity for ${food.name}`}
                          className="min-h-[34px] w-14 rounded-lg border border-[#303832] bg-[#171A18] text-center text-xs font-semibold text-[#F3F5F2]"
                        />
                        <select
                          value={chosenUnit}
                          onChange={(e) =>
                            setUnitMap((p) => ({ ...p, [food.id]: e.target.value as FoodUnit }))
                          }
                          aria-label={`Unit for ${food.name}`}
                          className="min-h-[34px] rounded-lg border border-[#303832] bg-[#171A18] px-2 text-xs text-[#F3F5F2]"
                        >
                          {FOOD_UNITS.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {mode === 'meals' && (
          <div className="space-y-2.5">
            {savedMeals.map((meal) => {
              const div = meal.isRecipe ? Math.max(1, meal.servingsYield) : 1;
              return (
                <div
                  key={meal.id}
                  className="rounded-2xl border border-[#252B28] bg-[#1D221F] p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Badge tone={meal.isRecipe ? 'lime' : 'info'}>
                        {meal.isRecipe ? `Recipe (${meal.servingsYield} serv)` : 'Saved Meal'}
                      </Badge>
                      <h4 className="mt-1.5 truncate text-sm font-bold text-[#F3F5F2]">
                        {meal.name}
                      </h4>
                      <p className="mt-0.5 tabular-nums text-xs text-[#A1AAA3]">
                        Per serving: {Math.round(meal.totalCalories / div)} kcal • P{' '}
                        {Math.round((meal.totalProtein / div) * 10) / 10}g • C{' '}
                        {Math.round((meal.totalCarbs / div) * 10) / 10}g • F{' '}
                        {Math.round((meal.totalFats / div) * 10) / 10}g
                      </p>
                    </div>
                    <Button size="sm" onClick={() => handleLogSavedMeal(meal)}>
                      <Plus className="h-4 w-4" />
                      Log
                    </Button>
                  </div>
                </div>
              );
            })}
            {savedMeals.length === 0 && (
              <p className="py-8 text-center text-xs text-[#727B74]">
                No saved meals or recipes yet. Create recipes in the Nutrition → Recipes tab.
              </p>
            )}
          </div>
        )}

        {mode === 'custom' && (
          <form
            onSubmit={handleCreateCustomFood}
            className="space-y-3 rounded-3xl border border-[#252B28] bg-[#1D221F] p-4"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-[#B7F36B]">
              <BookmarkPlus className="h-4 w-4" />
              Save to Custom Food Library &amp; Log
            </div>

            <Input
              label="Food Name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Homemade Rohu Curry"
              required
            />
            <Input
              label="Serving Size"
              value={customServing}
              onChange={(e) => setCustomServing(e.target.value)}
              placeholder="e.g. 1 bowl (200g)"
            />

            <div className="grid grid-cols-2 gap-2.5">
              <Input
                label="Protein (g)"
                inputMode="decimal"
                value={customProtein}
                onChange={(e) => setCustomProtein(e.target.value)}
                placeholder="25"
              />
              <Input
                label="Carbs (g)"
                inputMode="decimal"
                value={customCarbs}
                onChange={(e) => setCustomCarbs(e.target.value)}
                placeholder="30"
              />
              <Input
                label="Fats (g)"
                inputMode="decimal"
                value={customFats}
                onChange={(e) => setCustomFats(e.target.value)}
                placeholder="10"
              />
              <Input
                label="Fiber (g)"
                inputMode="decimal"
                value={customFiber}
                onChange={(e) => setCustomFiber(e.target.value)}
                placeholder="4"
              />
            </div>

            <Input
              label="Calories (auto-calculated if blank)"
              inputMode="numeric"
              value={customCalories}
              onChange={(e) => setCustomCalories(e.target.value)}
              placeholder="310"
            />

            <Button type="submit" className="w-full" size="lg">
              Save Custom Food &amp; Log
            </Button>
          </form>
        )}
      </div>
    </ModalShell>
  );
}
