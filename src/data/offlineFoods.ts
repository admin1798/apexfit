import type { FoodUnit, ParsedFoodItem } from '../types';

export type FoodCategory =
  | 'Indian Staples'
  | 'Bengali Foods'
  | 'Protein & Meat'
  | 'Fish & Eggs'
  | 'Dairy & Fats'
  | 'Rice, Roti & Dal'
  | 'Fruits & Veg'
  | 'Packaged & Snacks'
  | 'International';

export interface OfflineFoodItem extends ParsedFoodItem {
  id: string;
  category: FoodCategory;
  aliases: string[];
  baseUnit: FoodUnit;
  gramsPerServing: number;
  fiber: number;
}

export const OFFLINE_FOOD_DATABASE: OfflineFoodItem[] = [
  // Rice, Roti & Dal + Indian Staples
  {
    id: 'roti-wheat',
    name: 'Whole Wheat Roti / Chapati',
    category: 'Rice, Roti & Dal',
    servingSize: '1 piece (35g)',
    baseUnit: 'piece',
    gramsPerServing: 35,
    calories: 105,
    protein: 3.5,
    carbs: 20,
    fats: 1.2,
    fiber: 2.8,
    aliases: ['roti', 'rotis', 'chapati', 'chapatis', 'phulka', 'phulkas'],
  },
  {
    id: 'dal-tadka',
    name: 'Dal Tadka (Yellow Toor Dal)',
    category: 'Rice, Roti & Dal',
    servingSize: '1 bowl (200g)',
    baseUnit: 'bowl',
    gramsPerServing: 200,
    calories: 215,
    protein: 11,
    carbs: 28,
    fats: 6.5,
    fiber: 6.2,
    aliases: ['dal', 'dal tadka', 'toor dal', 'yellow dal', 'lentils'],
  },
  {
    id: 'masoor-dal-bengali',
    name: 'Bengali Masoor Dal (Red Lentil Soup)',
    category: 'Bengali Foods',
    servingSize: '1 bowl (200g)',
    baseUnit: 'bowl',
    gramsPerServing: 200,
    calories: 175,
    protein: 11.5,
    carbs: 26,
    fats: 2.5,
    fiber: 5.8,
    aliases: ['masoor dal', 'mushur dal', 'red lentil', 'bengali dal'],
  },
  {
    id: 'steamed-rice',
    name: 'Steamed White / Basmati Rice (Bhat)',
    category: 'Rice, Roti & Dal',
    servingSize: '1 cup cooked (158g)',
    baseUnit: 'cup',
    gramsPerServing: 158,
    calories: 205,
    protein: 4.3,
    carbs: 44.5,
    fats: 0.4,
    fiber: 0.6,
    aliases: ['rice', 'white rice', 'basmati rice', 'steamed rice', 'chawal', 'bhat'],
  },
  {
    id: 'gobindobhog-khichuri',
    name: 'Bengali Moong Dal Khichuri',
    category: 'Bengali Foods',
    servingSize: '1 bowl (250g)',
    baseUnit: 'bowl',
    gramsPerServing: 250,
    calories: 325,
    protein: 10.5,
    carbs: 52,
    fats: 8,
    fiber: 4.8,
    aliases: ['khichuri', 'khichdi', 'bengali khichuri'],
  },
  {
    id: 'brown-rice',
    name: 'Cooked Brown Rice',
    category: 'Rice, Roti & Dal',
    servingSize: '1 cup cooked (195g)',
    baseUnit: 'cup',
    gramsPerServing: 195,
    calories: 218,
    protein: 4.5,
    carbs: 45.8,
    fats: 1.6,
    fiber: 3.5,
    aliases: ['brown rice'],
  },

  // Bengali Foods
  {
    id: 'macher-jhol-rohu',
    name: 'Bengali Rohu Machher Jhol (Light Fish Curry)',
    category: 'Bengali Foods',
    servingSize: '1 bowl (2 pieces + gravy, 220g)',
    baseUnit: 'bowl',
    gramsPerServing: 220,
    calories: 245,
    protein: 24,
    carbs: 8,
    fats: 12.5,
    fiber: 1.4,
    aliases: ['macher jhol', 'machher jhol', 'rohu', 'rui mach', 'fish curry', 'bengali fish'],
  },
  {
    id: 'shorshe-maach',
    name: 'Shorshe Maach (Mustard Fish)',
    category: 'Bengali Foods',
    servingSize: '1 serving (180g)',
    baseUnit: 'serving',
    gramsPerServing: 180,
    calories: 310,
    protein: 22,
    carbs: 4.5,
    fats: 22,
    fiber: 1.2,
    aliases: ['shorshe', 'shorshe ilish', 'shorshe maach', 'mustard fish'],
  },
  {
    id: 'chicken-kosha',
    name: 'Bengali Chicken Kosha',
    category: 'Bengali Foods',
    servingSize: '1 bowl (200g)',
    baseUnit: 'bowl',
    gramsPerServing: 200,
    calories: 320,
    protein: 31,
    carbs: 9,
    fats: 17.5,
    fiber: 1.8,
    aliases: ['chicken kosha', 'kosha mangsho'],
  },
  {
    id: 'aloo-posto',
    name: 'Aloo Posto (Potato & Poppy Seed)',
    category: 'Bengali Foods',
    servingSize: '1 bowl (160g)',
    baseUnit: 'bowl',
    gramsPerServing: 160,
    calories: 235,
    protein: 4.5,
    carbs: 26,
    fats: 12.5,
    fiber: 3.2,
    aliases: ['aloo posto', 'posto'],
  },
  {
    id: 'dimer-dalna',
    name: 'Bengali Dimer Dalna (Egg Curry, 2 Eggs)',
    category: 'Bengali Foods',
    servingSize: '1 bowl (220g)',
    baseUnit: 'bowl',
    gramsPerServing: 220,
    calories: 280,
    protein: 14.5,
    carbs: 14,
    fats: 18,
    fiber: 2.1,
    aliases: ['dimer dalna', 'egg curry', 'dim curry'],
  },
  {
    id: 'begun-bhaja',
    name: 'Begun Bhaja (Pan-Fried Eggplant)',
    category: 'Bengali Foods',
    servingSize: '2 pieces (100g)',
    baseUnit: 'serving',
    gramsPerServing: 100,
    calories: 145,
    protein: 1.8,
    carbs: 11,
    fats: 10.5,
    fiber: 3.4,
    aliases: ['begun bhaja', 'eggplant'],
  },
  {
    id: 'mishti-doi',
    name: 'Mishti Doi (Sweetened Yogurt)',
    category: 'Bengali Foods',
    servingSize: '1 cup (100g)',
    baseUnit: 'cup',
    gramsPerServing: 100,
    calories: 152,
    protein: 4.2,
    carbs: 22,
    fats: 5.2,
    fiber: 0,
    aliases: ['mishti doi', 'sweet curd'],
  },

  // Protein, Chicken, Fish & Eggs
  {
    id: 'chicken-breast',
    name: 'Grilled Chicken Breast (Cooked)',
    category: 'Protein & Meat',
    servingSize: '150g',
    baseUnit: '100g',
    gramsPerServing: 150,
    calories: 248,
    protein: 46.5,
    carbs: 0,
    fats: 5.4,
    fiber: 0,
    aliases: ['chicken', 'chicken breast', 'grilled chicken', 'tandoori chicken'],
  },
  {
    id: 'whole-egg',
    name: 'Boiled / Whole Egg',
    category: 'Fish & Eggs',
    servingSize: '1 piece (50g)',
    baseUnit: 'piece',
    gramsPerServing: 50,
    calories: 72,
    protein: 6.3,
    carbs: 0.4,
    fats: 5,
    fiber: 0,
    aliases: ['egg', 'eggs', 'boiled egg', 'boiled eggs', 'omelette', 'anda', 'dim'],
  },
  {
    id: 'egg-whites',
    name: 'Egg Whites',
    category: 'Fish & Eggs',
    servingSize: '4 pieces (132g)',
    baseUnit: 'serving',
    gramsPerServing: 132,
    calories: 68,
    protein: 14.4,
    carbs: 1,
    fats: 0.2,
    fiber: 0,
    aliases: ['egg white', 'egg whites', 'whites'],
  },
  {
    id: 'katla-rohu-steamed',
    name: 'Grilled / Steamed Rohu or Katla Fillet',
    category: 'Fish & Eggs',
    servingSize: '150g',
    baseUnit: '100g',
    gramsPerServing: 150,
    calories: 176,
    protein: 28.5,
    carbs: 0,
    fats: 6.2,
    fiber: 0,
    aliases: ['fish', 'katla', 'rohu fillet', 'grilled fish'],
  },
  {
    id: 'grilled-paneer',
    name: 'Grilled Paneer (Cottage Cheese)',
    category: 'Protein & Meat',
    servingSize: '100g',
    baseUnit: '100g',
    gramsPerServing: 100,
    calories: 265,
    protein: 18,
    carbs: 3.5,
    fats: 20,
    fiber: 0,
    aliases: ['paneer', 'grilled paneer', 'cottage cheese', 'paneer tikka', 'chhana'],
  },
  {
    id: 'soya-chunks',
    name: 'Soya Chunks (Dry Weight)',
    category: 'Protein & Meat',
    servingSize: '50g dry',
    baseUnit: 'serving',
    gramsPerServing: 50,
    calories: 172,
    protein: 26,
    carbs: 16.5,
    fats: 0.3,
    fiber: 6.5,
    aliases: ['soya', 'soya chunks', 'soy chunks', 'nutrela'],
  },

  // Dairy & Fats
  {
    id: 'curd-dahi',
    name: 'Plain Curd / Tok Doi',
    category: 'Dairy & Fats',
    servingSize: '1 cup (150g)',
    baseUnit: 'cup',
    gramsPerServing: 150,
    calories: 98,
    protein: 5.5,
    carbs: 7.5,
    fats: 5,
    fiber: 0,
    aliases: ['curd', 'dahi', 'tok doi', 'yogurt', 'raita'],
  },
  {
    id: 'greek-yogurt',
    name: 'High-Protein Greek Yogurt',
    category: 'Dairy & Fats',
    servingSize: '1 cup (150g)',
    baseUnit: 'cup',
    gramsPerServing: 150,
    calories: 105,
    protein: 15,
    carbs: 6,
    fats: 2,
    fiber: 0,
    aliases: ['greek yogurt', 'hung curd'],
  },
  {
    id: 'milk-toned',
    name: 'Toned Milk',
    category: 'Dairy & Fats',
    servingSize: '1 cup (250ml)',
    baseUnit: 'cup',
    gramsPerServing: 250,
    calories: 150,
    protein: 8,
    carbs: 12,
    fats: 7.5,
    fiber: 0,
    aliases: ['milk', 'toned milk', 'doodh'],
  },
  {
    id: 'peanut-butter',
    name: 'Unsweetened Peanut Butter',
    category: 'Dairy & Fats',
    servingSize: '1 tbsp (16g)',
    baseUnit: 'serving',
    gramsPerServing: 16,
    calories: 95,
    protein: 4,
    carbs: 3,
    fats: 8,
    fiber: 1.4,
    aliases: ['peanut butter', 'pb'],
  },
  {
    id: 'ghee',
    name: 'Cow Ghee',
    category: 'Dairy & Fats',
    servingSize: '1 tsp (5g)',
    baseUnit: 'serving',
    gramsPerServing: 5,
    calories: 45,
    protein: 0,
    carbs: 0,
    fats: 5,
    fiber: 0,
    aliases: ['ghee', 'butter'],
  },

  // Indian Staples
  {
    id: 'rajma-masala',
    name: 'Rajma Masala (Kidney Beans)',
    category: 'Indian Staples',
    servingSize: '1 bowl (200g)',
    baseUnit: 'bowl',
    gramsPerServing: 200,
    calories: 245,
    protein: 12,
    carbs: 34,
    fats: 6.5,
    fiber: 8.5,
    aliases: ['rajma', 'kidney beans'],
  },
  {
    id: 'chole-masala',
    name: 'Chole / Chana Masala',
    category: 'Indian Staples',
    servingSize: '1 bowl (200g)',
    baseUnit: 'bowl',
    gramsPerServing: 200,
    calories: 265,
    protein: 11.5,
    carbs: 36,
    fats: 8,
    fiber: 7.8,
    aliases: ['chole', 'chana', 'chickpeas'],
  },
  {
    id: 'poha',
    name: 'Kanda Poha with Peanuts',
    category: 'Indian Staples',
    servingSize: '1 bowl (180g)',
    baseUnit: 'bowl',
    gramsPerServing: 180,
    calories: 250,
    protein: 5.5,
    carbs: 42,
    fats: 6.5,
    fiber: 3.1,
    aliases: ['poha', 'chire'],
  },
  {
    id: 'moong-chilla',
    name: 'Moong Dal Chilla',
    category: 'Indian Staples',
    servingSize: '2 pieces (140g)',
    baseUnit: 'serving',
    gramsPerServing: 140,
    calories: 230,
    protein: 14,
    carbs: 28,
    fats: 6,
    fiber: 5.2,
    aliases: ['chilla', 'moong chilla', 'cheela'],
  },
  {
    id: 'idli-sambar',
    name: 'Steamed Idli',
    category: 'Indian Staples',
    servingSize: '2 pieces (120g)',
    baseUnit: 'serving',
    gramsPerServing: 120,
    calories: 145,
    protein: 4.5,
    carbs: 30,
    fats: 0.6,
    fiber: 1.8,
    aliases: ['idli', 'idlis'],
  },

  // Packaged & Snacks + International + Fruits & Veg
  {
    id: 'whey-scoop',
    name: 'Whey Protein Isolate / Concentrate',
    category: 'Packaged & Snacks',
    servingSize: '1 scoop (32g)',
    baseUnit: 'serving',
    gramsPerServing: 32,
    calories: 122,
    protein: 25,
    carbs: 2.5,
    fats: 1.5,
    fiber: 0.5,
    aliases: ['whey', 'whey protein', 'protein shake', 'scoop'],
  },
  {
    id: 'protein-bar',
    name: 'Packaged Protein Bar (20g Protein)',
    category: 'Packaged & Snacks',
    servingSize: '1 bar (60g)',
    baseUnit: 'piece',
    gramsPerServing: 60,
    calories: 215,
    protein: 20,
    carbs: 21,
    fats: 6.5,
    fiber: 5,
    aliases: ['protein bar', 'bar'],
  },
  {
    id: 'roasted-makhana',
    name: 'Roasted Makhana (Fox Nuts)',
    category: 'Packaged & Snacks',
    servingSize: '1 cup (30g)',
    baseUnit: 'cup',
    gramsPerServing: 30,
    calories: 108,
    protein: 3,
    carbs: 22,
    fats: 0.5,
    fiber: 2.2,
    aliases: ['makhana', 'fox nuts'],
  },
  {
    id: 'rolled-oats',
    name: 'Rolled Oats (Dry)',
    category: 'International',
    servingSize: '50g',
    baseUnit: 'serving',
    gramsPerServing: 50,
    calories: 190,
    protein: 6.8,
    carbs: 33.5,
    fats: 3.4,
    fiber: 5.1,
    aliases: ['oats', 'oatmeal', 'rolled oats'],
  },
  {
    id: 'salmon-grilled',
    name: 'Grilled Atlantic Salmon',
    category: 'International',
    servingSize: '150g',
    baseUnit: '100g',
    gramsPerServing: 150,
    calories: 312,
    protein: 33,
    carbs: 0,
    fats: 19.5,
    fiber: 0,
    aliases: ['salmon'],
  },
  {
    id: 'banana',
    name: 'Banana (Medium)',
    category: 'Fruits & Veg',
    servingSize: '1 piece (118g)',
    baseUnit: 'piece',
    gramsPerServing: 118,
    calories: 105,
    protein: 1.3,
    carbs: 27,
    fats: 0.4,
    fiber: 3.1,
    aliases: ['banana', 'bananas', 'kela', 'kola'],
  },
  {
    id: 'apple',
    name: 'Apple (Medium)',
    category: 'Fruits & Veg',
    servingSize: '1 piece (182g)',
    baseUnit: 'piece',
    gramsPerServing: 182,
    calories: 95,
    protein: 0.5,
    carbs: 25,
    fats: 0.3,
    fiber: 4.4,
    aliases: ['apple'],
  },
  {
    id: 'mixed-greens-veg',
    name: 'Steamed Broccoli & Mixed Vegetables',
    category: 'Fruits & Veg',
    servingSize: '1 bowl (150g)',
    baseUnit: 'bowl',
    gramsPerServing: 150,
    calories: 56,
    protein: 3.8,
    carbs: 10.5,
    fats: 0.5,
    fiber: 4.5,
    aliases: ['broccoli', 'salad', 'vegetables', 'sabzi'],
  },
  {
    id: 'sweet-potato',
    name: 'Boiled Sweet Potato',
    category: 'Fruits & Veg',
    servingSize: '150g',
    baseUnit: '100g',
    gramsPerServing: 150,
    calories: 135,
    protein: 2.5,
    carbs: 31,
    fats: 0.2,
    fiber: 4.5,
    aliases: ['sweet potato'],
  },
  {
    id: 'almonds',
    name: 'Almonds (Raw/Roasted)',
    category: 'Packaged & Snacks',
    servingSize: '15 pieces (18g)',
    baseUnit: 'serving',
    gramsPerServing: 18,
    calories: 104,
    protein: 3.8,
    carbs: 3.9,
    fats: 9,
    fiber: 2.2,
    aliases: ['almonds', 'badam'],
  },
];

export function computeUnitMultiplier(
  food: Pick<OfflineFoodItem, 'gramsPerServing'>,
  unit: FoodUnit,
  quantity: number
): { multiplier: number; label: string } {
  const safeQty = Math.max(0.1, quantity || 1);
  if (unit === '100g') {
    const mult = (safeQty * 100) / Math.max(1, food.gramsPerServing);
    return { multiplier: mult, label: `${safeQty * 100}g` };
  }
  if (unit === 'custom') {
    const mult = safeQty / Math.max(1, food.gramsPerServing);
    return { multiplier: mult, label: `${safeQty}g` };
  }
  return {
    multiplier: safeQty,
    label: safeQty === 1 ? `1 ${unit}` : `${safeQty} ${unit}s`,
  };
}

function scaleFood(food: OfflineFoodItem, multiplier: number, customServing?: string): ParsedFoodItem {
  const safeMult = Math.max(0.1, Math.min(20, multiplier));
  return {
    name: food.name,
    servingSize:
      customServing ??
      (safeMult === 1 ? food.servingSize : `${Number(safeMult.toFixed(2))} × ${food.servingSize}`),
    calories: Math.round(food.calories * safeMult),
    protein: Math.round(food.protein * safeMult * 10) / 10,
    carbs: Math.round(food.carbs * safeMult * 10) / 10,
    fats: Math.round(food.fats * safeMult * 10) / 10,
    fiber: Math.round(food.fiber * safeMult * 10) / 10,
  };
}

export function parseMealOffline(input: string): ParsedFoodItem[] {
  const chunks = input
    .toLowerCase()
    .split(/,|\band\b|\n|\+/i)
    .map((c) => c.trim())
    .filter(Boolean);

  const results: ParsedFoodItem[] = [];

  for (const chunk of chunks) {
    let matched: OfflineFoodItem | undefined;
    let bestAliasLen = 0;
    for (const food of OFFLINE_FOOD_DATABASE) {
      for (const alias of food.aliases) {
        if (chunk.includes(alias) && alias.length > bestAliasLen) {
          bestAliasLen = alias.length;
          matched = food;
        }
      }
    }
    if (!matched) continue;

    const gramMatch = chunk.match(/(\d+(?:\.\d+)?)\s*(?:g|gm|grams?)\b/);
    const qtyMatch = chunk.match(/(\d+(?:\.\d+)?)/);

    let multiplier = 1;
    let customServing: string | undefined;

    if (gramMatch) {
      const grams = parseFloat(gramMatch[1]);
      multiplier = grams / Math.max(1, matched.gramsPerServing);
      customServing = `${grams}g`;
    } else if (qtyMatch) {
      const qty = parseFloat(qtyMatch[1]);
      if (matched.id === 'egg-whites') {
        multiplier = qty / 4;
        customServing = `${qty} egg whites`;
      } else if (matched.id === 'idli-sambar' || matched.id === 'moong-chilla' || matched.id === 'begun-bhaja') {
        multiplier = qty / 2;
        customServing = `${qty} pieces`;
      } else if (matched.id === 'almonds') {
        multiplier = qty / 15;
        customServing = `${qty} almonds`;
      } else {
        multiplier = qty;
      }
    }

    results.push(scaleFood(matched, multiplier, customServing));
  }

  return results;
}
