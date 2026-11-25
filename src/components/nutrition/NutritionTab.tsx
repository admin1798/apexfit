import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bookmark,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { OFFLINE_FOOD_DATABASE } from '../../data/offlineFoods';
import { db } from '../../db/database';
import { DEFAULT_PROFILE_ID } from '../../db/seed';
import { enqueueSyncMutation } from '../../services/syncService';
import { offsetDateKey, toLocalDateKey } from '../../services/workoutMetrics';
import type { FoodLogEntry, MealSlot, ParsedFoodItem, SavedMeal } from '../../types';
import { ModalShell } from '../ui/Overlay';
import { Button, Card, Input, MetricCard, ProgressBar, Tabs } from '../ui/primitives';
import { useToast } from '../ui/toastContext';
import { FoodLoggerModal } from './FoodLoggerModal';

interface NutritionTabProps {
  onOpenSettings: () => void;
}

const SLOTS: Array<{ id: MealSlot; title: string; subtitle: string }> = [
  { id: 'breakfast', title: 'Breakfast', subtitle: 'Morning fuel' },
  { id: 'lunch', title: 'Lunch', subtitle: 'Midday meal' },
  { id: 'dinner', title: 'Dinner', subtitle: 'Evening recovery' },
  { id: 'snacks', title: 'Snacks / Pre-Post', subtitle: 'Shakes & peri-workout' },
  { id: 'custom', title: 'Custom Meals', subtitle: 'Extra meals & shakes' },
];

export function NutritionTab({ onOpenSettings }: NutritionTabProps) {
  const [todayKey] = useState(() => toLocalDateKey(new Date()));
  const [subTab, setSubTab] = useState<'log' | 'recipes' | 'analytics'>('log');
  const [dateKey, setDateKey] = useState(todayKey);
  const [loggerSlot, setLoggerSlot] = useState<MealSlot | null>(null);
  const [editingEntry, setEditingEntry] = useState<FoodLogEntry | null>(null);
  const [editScale, setEditScale] = useState('1');

  // Recipe Builder State
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const [recipeYield, setRecipeYield] = useState('2');
  const [recipeItems, setRecipeItems] = useState<ParsedFoodItem[]>([]);
  const [selectedIngredientId, setSelectedIngredientId] = useState(OFFLINE_FOOD_DATABASE[0].id);
  const [ingredientMult, setIngredientMult] = useState('1');

  const { showToast } = useToast();
  const profile = useLiveQuery(() => db.profile.get(DEFAULT_PROFILE_ID), []);
  const dayFoods = useLiveQuery(
    () => db.foodLogs.where('date').equals(dateKey).toArray(),
    [dateKey],
    []
  );
  const yesterdayKey = offsetDateKey(dateKey, -1);
  const yesterdayFoods = useLiveQuery(
    () => db.foodLogs.where('date').equals(yesterdayKey).toArray(),
    [yesterdayKey],
    []
  );
  const allFoods = useLiveQuery(() => db.foodLogs.toArray(), [], []);
  const savedMeals = useLiveQuery(() => db.savedMeals.toArray(), [], []);

  const nutrition7d = useMemo(() => {
    const days: Array<{ date: string; calories: number; protein: number; fiber: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const k = offsetDateKey(todayKey, -i);
      const items = allFoods.filter((f) => f.date === k);
      days.push({
        date: k.slice(5),
        calories: Math.round(items.reduce((s, x) => s + x.calories, 0)),
        protein: Math.round(items.reduce((s, x) => s + x.protein, 0)),
        fiber: Math.round(items.reduce((s, x) => s + (x.fiber ?? 0), 0)),
      });
    }
    return days;
  }, [allFoods, todayKey]);

  if (!profile) return null;

  const totals = dayFoods.reduce(
    (acc, f) => ({
      calories: acc.calories + f.calories,
      protein: acc.protein + f.protein,
      carbs: acc.carbs + f.carbs,
      fats: acc.fats + f.fats,
      fiber: acc.fiber + (f.fiber ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
  );

  const loggedDays7d = nutrition7d.filter((d) => d.calories > 0);
  const avgCal7d = loggedDays7d.length
    ? Math.round(loggedDays7d.reduce((s, d) => s + d.calories, 0) / loggedDays7d.length)
    : 0;
  const avgProt7d = loggedDays7d.length
    ? Math.round(loggedDays7d.reduce((s, d) => s + d.protein, 0) / loggedDays7d.length)
    : 0;
  const consistencyPct = Math.round((loggedDays7d.length / 7) * 100);

  async function handleCopyYesterday(slot: MealSlot) {
    const sourceItems = yesterdayFoods.filter((f) => f.mealSlot === slot);
    if (sourceItems.length === 0) return;
    const now = new Date().toISOString();
    const clones = sourceItems.map((item, idx) => ({
      id: `food-copy-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      date: dateKey,
      mealSlot: slot,
      customMealName: item.customMealName,
      name: item.name,
      servingSize: item.servingSize,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fats: item.fats,
      fiber: item.fiber ?? 0,
      source: item.source,
      createdAt: now,
    }));
    await db.foodLogs.bulkAdd(clones);
    for (const c of clones) {
      await enqueueSyncMutation('foodLog', c.id, 'upsert', c);
    }
    showToast(`Repeated yesterday's ${slot}`, 'success');
  }

  async function handleSaveSlotAsMeal(slot: MealSlot) {
    const items = dayFoods.filter((f) => f.mealSlot === slot);
    if (items.length === 0) return;
    const meal: SavedMeal = {
      id: `meal-${Date.now()}`,
      name: `${slot.charAt(0).toUpperCase() + slot.slice(1)} Template (${dateKey.slice(5)})`,
      isRecipe: false,
      servingsYield: 1,
      items: items.map((i) => ({
        name: i.name,
        servingSize: i.servingSize,
        calories: i.calories,
        protein: i.protein,
        carbs: i.carbs,
        fats: i.fats,
        fiber: i.fiber ?? 0,
      })),
      totalCalories: Math.round(items.reduce((s, i) => s + i.calories, 0)),
      totalProtein: Math.round(items.reduce((s, i) => s + i.protein, 0) * 10) / 10,
      totalCarbs: Math.round(items.reduce((s, i) => s + i.carbs, 0) * 10) / 10,
      totalFats: Math.round(items.reduce((s, i) => s + i.fats, 0) * 10) / 10,
      totalFiber: Math.round(items.reduce((s, i) => s + (i.fiber ?? 0), 0) * 10) / 10,
      createdAt: new Date().toISOString(),
    };
    await db.savedMeals.put(meal);
    await enqueueSyncMutation('savedMeal', meal.id, 'upsert', meal);
    showToast('Saved meal template', 'success');
  }

  async function handleDeleteFood(id: string) {
    await db.foodLogs.delete(id);
    await enqueueSyncMutation('foodLog', id, 'delete');
    showToast('Removed food entry', 'info');
  }

  async function handleSaveQuantityEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEntry) return;
    const mult = Math.max(0.1, parseFloat(editScale) || 1);
    const updated: FoodLogEntry = {
      ...editingEntry,
      servingSize: mult === 1 ? editingEntry.servingSize : `${mult}× (${editingEntry.servingSize})`,
      calories: Math.round(editingEntry.calories * mult),
      protein: Math.round(editingEntry.protein * mult * 10) / 10,
      carbs: Math.round(editingEntry.carbs * mult * 10) / 10,
      fats: Math.round(editingEntry.fats * mult * 10) / 10,
      fiber: Math.round((editingEntry.fiber ?? 0) * mult * 10) / 10,
    };
    await db.foodLogs.put(updated);
    await enqueueSyncMutation('foodLog', updated.id, 'upsert', updated);
    setEditingEntry(null);
    showToast('Updated serving quantity', 'success');
  }

  function handleAddIngredientToRecipe() {
    const food = OFFLINE_FOOD_DATABASE.find((f) => f.id === selectedIngredientId);
    if (!food) return;
    const mult = Math.max(0.25, parseFloat(ingredientMult) || 1);
    setRecipeItems((prev) => [
      ...prev,
      {
        name: food.name,
        servingSize: mult === 1 ? food.servingSize : `${mult}× ${food.servingSize}`,
        calories: Math.round(food.calories * mult),
        protein: Math.round(food.protein * mult * 10) / 10,
        carbs: Math.round(food.carbs * mult * 10) / 10,
        fats: Math.round(food.fats * mult * 10) / 10,
        fiber: Math.round(food.fiber * mult * 10) / 10,
      },
    ]);
  }

  async function handleSaveRecipe(e: React.FormEvent) {
    e.preventDefault();
    if (!recipeName.trim() || recipeItems.length === 0) return;
    const yields = Math.max(1, parseInt(recipeYield, 10) || 1);
    const meal: SavedMeal = {
      id: `recipe-${Date.now()}`,
      name: recipeName.trim(),
      isRecipe: true,
      servingsYield: yields,
      items: recipeItems,
      totalCalories: Math.round(recipeItems.reduce((s, i) => s + i.calories, 0)),
      totalProtein: Math.round(recipeItems.reduce((s, i) => s + i.protein, 0) * 10) / 10,
      totalCarbs: Math.round(recipeItems.reduce((s, i) => s + i.carbs, 0) * 10) / 10,
      totalFats: Math.round(recipeItems.reduce((s, i) => s + i.fats, 0) * 10) / 10,
      totalFiber: Math.round(recipeItems.reduce((s, i) => s + (i.fiber ?? 0), 0) * 10) / 10,
      createdAt: new Date().toISOString(),
    };
    await db.savedMeals.put(meal);
    await enqueueSyncMutation('savedMeal', meal.id, 'upsert', meal);
    setRecipeModalOpen(false);
    setRecipeName('');
    setRecipeItems([]);
    showToast(`Saved recipe "${meal.name}"`, 'success');
  }

  const displayDate =
    dateKey === todayKey
      ? 'Today'
      : dateKey === offsetDateKey(todayKey, -1)
        ? 'Yesterday'
        : new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });

  return (
    <div className="space-y-4 px-4 pt-4">
      <Tabs
        value={subTab}
        onChange={setSubTab}
        options={[
          { id: 'log', label: 'Daily Log' },
          { id: 'recipes', label: 'Meals & Recipes', count: savedMeals.length },
          { id: 'analytics', label: 'Nutrition Stats' },
        ]}
      />

      {subTab === 'log' && (
        <>
          <div className="flex items-center justify-between rounded-2xl border border-[#252B28] bg-[#1D221F] px-2 py-1.5">
            <button
              type="button"
              onClick={() => setDateKey(offsetDateKey(dateKey, -1))}
              aria-label="Previous day"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#F3F5F2] active:bg-[#252B27]"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="text-center">
              <p className="text-sm font-bold text-[#F3F5F2]">{displayDate}</p>
              <p className="text-[11px] text-[#A1AAA3]">{dateKey}</p>
            </div>

            <button
              type="button"
              onClick={() => setDateKey(offsetDateKey(dateKey, 1))}
              disabled={dateKey >= todayKey}
              aria-label="Next day"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#F3F5F2] active:bg-[#252B27] disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <Card>
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <p className="text-xs text-[#A1AAA3]">Calories Consumed</p>
                <p className="tabular-nums text-2xl font-bold text-[#F3F5F2]">
                  {Math.round(totals.calories).toLocaleString()}
                  <span className="ml-1 text-sm font-normal text-[#A1AAA3]">
                    / {profile.calorieTarget.toLocaleString()} kcal
                  </span>
                </p>
              </div>
              <Button size="sm" onClick={() => setLoggerSlot('dinner')}>
                <Sparkles className="h-3.5 w-3.5" />
                AI Log Meal
              </Button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'Protein', val: totals.protein, target: profile.proteinTarget, tone: 'lime' as const },
                { label: 'Carbs', val: totals.carbs, target: profile.carbsTarget, tone: 'info' as const },
                { label: 'Fats', val: totals.fats, target: profile.fatsTarget, tone: 'warning' as const },
                { label: 'Fiber', val: totals.fiber, target: profile.fiberTarget ?? 34, tone: 'success' as const },
              ].map((m) => (
                <div key={m.label} className="rounded-2xl bg-[#171A18] p-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[#F3F5F2]">{m.label}</span>
                    <span className="tabular-nums text-[#A1AAA3]">
                      {Math.round(m.val)}/{m.target}g
                    </span>
                  </div>
                  <ProgressBar value={m.val} max={m.target} tone={m.tone} className="mt-1.5" />
                </div>
              ))}
            </div>
          </Card>

          <div className="space-y-3">
            {SLOTS.map((slotInfo) => {
              const items = dayFoods.filter((f) => f.mealSlot === slotInfo.id);
              const yesterdayHasItems = yesterdayFoods.some((f) => f.mealSlot === slotInfo.id);
              const slotCals = items.reduce((s, i) => s + i.calories, 0);
              const slotProt = items.reduce((s, i) => s + i.protein, 0);

              return (
                <Card key={slotInfo.id}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-[#F3F5F2]">{slotInfo.title}</h3>
                      <p className="tabular-nums text-xs text-[#A1AAA3]">
                        {items.length > 0
                          ? `${Math.round(slotCals)} kcal • ${Math.round(slotProt)}g protein`
                          : slotInfo.subtitle}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {items.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleSaveSlotAsMeal(slotInfo.id)}
                          title="Save meal template"
                          className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl border border-[#303832] bg-[#171A18] text-[#A1AAA3] hover:text-[#B7F36B]"
                        >
                          <Bookmark className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {yesterdayHasItems && (
                        <button
                          type="button"
                          onClick={() => handleCopyYesterday(slotInfo.id)}
                          className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-[#303832] bg-[#171A18] px-2.5 text-[11px] font-semibold text-[#F3F5F2]"
                        >
                          <Copy className="h-3 w-3 text-[#79B8F5]" />
                          Repeat Yest.
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setLoggerSlot(slotInfo.id)}
                        aria-label={`Add food to ${slotInfo.title}`}
                        className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl bg-[#B7F36B]/15 text-[#B7F36B]"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {items.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-[#252B28] pt-2.5">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-2 rounded-2xl bg-[#171A18] px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-sm font-medium text-[#F3F5F2]">
                                {item.name}
                              </p>
                              {item.source === 'ai' && (
                                <span className="rounded bg-[#B7F36B]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#B7F36B]">
                                  AI
                                </span>
                              )}
                            </div>
                            <p className="tabular-nums text-[11px] text-[#A1AAA3]">
                              {item.servingSize} • P {item.protein}g • C {item.carbs}g • F {item.fats}g
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            <span className="tabular-nums text-xs font-bold text-[#F3F5F2]">
                              {item.calories}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEntry(item);
                                setEditScale('1');
                              }}
                              aria-label={`Edit serving for ${item.name}`}
                              className="inline-flex min-h-[38px] min-w-[36px] items-center justify-center rounded-xl text-[#727B74] hover:text-[#B7F36B]"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteFood(item.id)}
                              aria-label={`Delete ${item.name}`}
                              className="inline-flex min-h-[38px] min-w-[36px] items-center justify-center rounded-xl text-[#727B74] hover:text-[#E87979]"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {subTab === 'recipes' && (
        <div className="space-y-3">
          <Button className="w-full" onClick={() => setRecipeModalOpen(true)}>
            <ChefHat className="h-4 w-4" />
            Create Multi-Ingredient Recipe
          </Button>

          {savedMeals.map((meal) => {
            const div = meal.isRecipe ? Math.max(1, meal.servingsYield) : 1;
            return (
              <Card key={meal.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#B7F36B]">
                      {meal.isRecipe ? `Recipe • ${meal.servingsYield} servings` : 'Saved Meal'}
                    </span>
                    <h3 className="mt-0.5 text-base font-bold text-[#F3F5F2]">{meal.name}</h3>
                    <p className="mt-1 text-xs text-[#A1AAA3]">
                      {meal.items.map((i) => i.name).join(' + ')}
                    </p>
                    <p className="mt-1.5 tabular-nums text-xs font-semibold text-[#F3F5F2]">
                      {Math.round(meal.totalCalories / div)} kcal • P{' '}
                      {Math.round((meal.totalProtein / div) * 10) / 10}g • C{' '}
                      {Math.round((meal.totalCarbs / div) * 10) / 10}g • F{' '}
                      {Math.round((meal.totalFats / div) * 10) / 10}g per serving
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await db.savedMeals.delete(meal.id);
                      await enqueueSyncMutation('savedMeal', meal.id, 'delete');
                      showToast('Removed saved meal', 'info');
                    }}
                    aria-label={`Delete ${meal.name}`}
                    className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl text-[#727B74] hover:text-[#E87979]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {subTab === 'analytics' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <MetricCard label="7d Avg Kcal" value={avgCal7d} accent="lime" />
            <MetricCard label="7d Avg Prot" value={`${avgProt7d}g`} accent="success" />
            <MetricCard label="Consistency" value={`${consistencyPct}%`} accent="info" />
          </div>

          <Card>
            <h3 className="mb-3 text-sm font-bold text-[#F3F5F2]">7-Day Calorie Intake</h3>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={nutrition7d} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#252B28" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" stroke="#727B74" fontSize={10} tickLine={false} />
                  <YAxis stroke="#727B74" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#171A18',
                      border: '1px solid #303832',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar
                    dataKey="calories"
                    name="Calories (kcal)"
                    fill="#B7F36B"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 text-sm font-bold text-[#F3F5F2]">7-Day Protein Intake (g)</h3>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={nutrition7d} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#252B28" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" stroke="#727B74" fontSize={10} tickLine={false} />
                  <YAxis stroke="#727B74" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#171A18',
                      border: '1px solid #303832',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar
                    dataKey="protein"
                    name="Protein (g)"
                    fill="#75D69A"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {loggerSlot !== null && (
        <FoodLoggerModal
          isOpen
          dateKey={dateKey}
          initialSlot={loggerSlot}
          onClose={() => setLoggerSlot(null)}
          onOpenSettings={onOpenSettings}
        />
      )}

      {/* Edit Serving Quantity Modal */}
      <ModalShell
        isOpen={Boolean(editingEntry)}
        title="Adjust Serving Multiplier"
        subtitle={editingEntry?.name}
        variant="sheet"
        onClose={() => setEditingEntry(null)}
      >
        <form onSubmit={handleSaveQuantityEdit} className="space-y-4">
          <Input
            label="Serving Multiplier (e.g. 0.5, 1.5, 2)"
            inputMode="decimal"
            value={editScale}
            onChange={(e) => setEditScale(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setEditingEntry(null)}>
              Cancel
            </Button>
            <Button type="submit">Update Entry</Button>
          </div>
        </form>
      </ModalShell>

      {/* Recipe Builder Modal */}
      <ModalShell
        isOpen={recipeModalOpen}
        title="Create Recipe"
        subtitle="Automatic per-serving macro math"
        variant="sheet"
        onClose={() => setRecipeModalOpen(false)}
      >
        <form onSubmit={handleSaveRecipe} className="space-y-3.5">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Input
                label="Recipe Name"
                value={recipeName}
                onChange={(e) => setRecipeName(e.target.value)}
                placeholder="e.g. Bengali Chicken Meal Prep"
                required
              />
            </div>
            <Input
              label="Servings"
              inputMode="numeric"
              value={recipeYield}
              onChange={(e) => setRecipeYield(e.target.value)}
            />
          </div>

          <div className="rounded-2xl border border-[#303832] bg-[#1D221F] p-3">
            <p className="mb-2 text-xs font-semibold text-[#A1AAA3]">Add Ingredients</p>
            <div className="flex gap-2">
              <select
                value={selectedIngredientId}
                onChange={(e) => setSelectedIngredientId(e.target.value)}
                className="min-h-[44px] flex-1 rounded-xl border border-[#303832] bg-[#171A18] px-2.5 text-xs text-[#F3F5F2]"
              >
                {OFFLINE_FOOD_DATABASE.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.calories} kcal)
                  </option>
                ))}
              </select>
              <input
                type="text"
                inputMode="decimal"
                value={ingredientMult}
                onChange={(e) => setIngredientMult(e.target.value)}
                className="min-h-[44px] w-14 rounded-xl border border-[#303832] bg-[#171A18] text-center text-xs font-semibold text-[#F3F5F2]"
              />
              <Button size="sm" onClick={handleAddIngredientToRecipe}>
                Add
              </Button>
            </div>
          </div>

          {recipeItems.length > 0 && (
            <div className="space-y-1.5 rounded-2xl bg-[#101211] p-3">
              {recipeItems.map((it, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <span className="truncate text-[#F3F5F2]">
                    {it.name} ({it.servingSize})
                  </span>
                  <span className="tabular-nums text-[#B7F36B]">{it.calories} kcal</span>
                </div>
              ))}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={!recipeName.trim() || recipeItems.length === 0}>
            Save Recipe
          </Button>
        </form>
      </ModalShell>
    </div>
  );
}
