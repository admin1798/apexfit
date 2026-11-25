import type { ParsedFoodItem } from '../types';

const GEMINI_MODEL = 'gemini-2.5-flash';

export interface GeminiParseResult {
  items: ParsedFoodItem[];
}

export async function parseMealWithGemini(
  mealText: string,
  apiKey: string
): Promise<ParsedFoodItem[]> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    throw new Error('NO_API_KEY');
  }
  if (!navigator.onLine) {
    throw new Error('OFFLINE');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(trimmedKey)}`;

  const systemPrompt = `You are a sports nutritionist and Bengali, Indian, and global food macro database expert.
Parse the user's natural language meal description into individual food items with accurate estimated calories, protein (g), carbs (g), fats (g), and fiber (g).
Always respect explicit quantities and gram weights (e.g. "150g grilled paneer", "2 rotis", "1 bowl dal tadka", "rohu machher jhol").
Return JSON strictly matching the schema.`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${systemPrompt}\n\nMeal description: "${mealText.trim()}"`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          items: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                servingSize: { type: 'STRING' },
                calories: { type: 'NUMBER' },
                protein: { type: 'NUMBER' },
                carbs: { type: 'NUMBER' },
                fats: { type: 'NUMBER' },
                fiber: { type: 'NUMBER' },
              },
              required: ['name', 'servingSize', 'calories', 'protein', 'carbs', 'fats', 'fiber'],
            },
          },
        },
        required: ['items'],
      },
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new Error(`Invalid or unauthorized Gemini API key (${response.status}).`);
    }
    throw new Error(`Gemini API error (${response.status}): ${errText.slice(0, 140)}`);
  }

  const data = await response.json();
  const rawText: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Gemini returned an empty response. Try rephrasing your meal.');
  }

  const parsed = JSON.parse(rawText) as GeminiParseResult;
  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    throw new Error('No food items detected. Try being more specific.');
  }

  return parsed.items.map((item) => ({
    name: String(item.name || 'Food Item'),
    servingSize: String(item.servingSize || '1 serving'),
    calories: Math.max(0, Math.round(Number(item.calories) || 0)),
    protein: Math.max(0, Math.round((Number(item.protein) || 0) * 10) / 10),
    carbs: Math.max(0, Math.round((Number(item.carbs) || 0) * 10) / 10),
    fats: Math.max(0, Math.round((Number(item.fats) || 0) * 10) / 10),
    fiber: Math.max(0, Math.round((Number(item.fiber) || 0) * 10) / 10),
  }));
}
