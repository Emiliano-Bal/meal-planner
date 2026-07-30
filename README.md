# LaCena — AI-Powered Weekly Meal Planner

Plan your week, generate recipes, and build a smart shopping list — all in one place.

---

## Features

**Weekly Menu Planning**
- 7-day calendar grid (Mon–Sun) with Breakfast, Lunch, and Dinner slots
- Lunch supports sub-sections: Main, Side, Veg, and Grain
- Navigate between weeks; today is always highlighted
- Copy any meal to any day or any week with a single click

**Recipe Library**
- Browse thousands of recipes from MealDB by category or keyword
- Save your own custom recipes
- Enhance any recipe with AI: make ingredients more specific and shopable
- Generate a healthy version of any recipe with one click

**AI Recipe Import**
- **From a URL** — paste any recipe page link and Claude extracts it automatically (works on most recipe blogs; also tries Instagram captions)
- **From a photo or screenshot** — upload an image or take a photo on mobile; Claude reads the recipe visually
- **By pasting text** — copy-paste from anywhere and let Claude parse it

**AI Recipe Generation**
- Tap any meal slot that has no recipe to generate one on the fly
- Review and edit every ingredient before saving (swap flour tortillas for corn, change cheese type, etc.)
- Regenerate if the first result isn't what you wanted

**Smart Shopping List**
- Generates from all meals in the week, scaled to your household size
- Automatically deduplicates ingredients across recipes
- Sums quantities with unit conversion
- Filters pantry staples (water, oils) you always have at home
- Translates mixed-language ingredients to English — cached so repeat weeks are instant
- Local product suggestions: enter your city and get brand/store recommendations per ingredient
- Rebuild the list anytime to pick up newly added meals

**Cook View**
- Day-by-day recipe reader — navigate with ‹ › arrows
- Flip cards: tap any recipe card to see the full ingredient list and instructions
- No recipe saved? Tap to generate one, customize it, and save — all from the same card

**Settings**
- Household size (scales all ingredient quantities)
- Region / city (used for local product suggestions)
- Dietary restrictions (vegetarian, vegan, gluten-free, etc.)
- Preferred supermarkets

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Auth & Database | Supabase |
| AI | Anthropic Claude Haiku |
| Styling | Tailwind CSS v4 |
| Language | TypeScript |

---

## Requirements

- Node.js 18+
- A [Supabase](https://supabase.com) project (auth + database)
- An [Anthropic](https://console.anthropic.com) API key

---

## Setup

```bash
# 1. Clone and install
git clone https://github.com/your-username/meal-planner.git
cd meal-planner
npm install

# 2. Create a .env.local file with your credentials
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
ANTHROPIC_API_KEY=your_anthropic_api_key

# 3. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## How to Use

**1. Sign up and configure**
Create an account, then use the top nav to set your **household size** (this scales ingredient quantities throughout the app) and your **region** (city or area, used for local shopping suggestions).

**2. Plan your week**
Go to **Menu**. Use the week arrows to pick a week, then tap any empty cell to add a meal. Search the MealDB recipe library, browse your saved recipes, or add a custom one on the spot.

**3. Add recipes from anywhere**
From the Recipes page or the picker modal, click **Add Recipe** to import from:
- A recipe website URL
- A photo or screenshot (Instagram reels, TikTok, a photo of a cookbook page, etc.)
- Pasted text from any source

**4. Cook**
Go to **Cook** to see today's meals. Tap a card to flip it and read the full ingredients and instructions. If a meal has no recipe attached, tap it to generate one with AI — you can edit every ingredient before saving.

**5. Build the shopping list**
Once your week is planned, click **Generate shopping list** on the Menu page. LaCena will:
- Collect all ingredients from the week's recipes
- Scale quantities to your household size
- Deduplicate and sum overlapping ingredients
- Translate any non-English names
- Filter out pantry staples like oil and water

**6. Shop**
Go to **Shopping**. Check off items as you go. Tap **Get local suggestions** to see recommended products and stores for your region. Use **↺ Rebuild** if you've added meals since generating the list.

**7. Copy meals to next week**
On the Menu page, hover over any meal to reveal **copy**. Click it to open a picker where you choose the target week, day, meal slot, and section.

---

## Project Structure

```
src/
├── app/
│   ├── actions/        # Server actions (AI calls, auth)
│   ├── cook/           # Day-by-day recipe flip-card view
│   ├── dashboard/      # Weekly menu planning grid
│   ├── login/          # Auth page
│   ├── recipes/        # Recipe library
│   └── shopping/       # Shopping list
├── components/         # Shared UI components
├── lib/
│   ├── supabase.ts     # Supabase client helpers
│   └── utils.ts        # Ingredient normalization, quantity math, translation cache
└── types/              # TypeScript interfaces
```

---

## License

MIT
