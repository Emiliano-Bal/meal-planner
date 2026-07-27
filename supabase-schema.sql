-- Run this in Supabase → SQL Editor

-- Profiles (auto-created on signup via trigger)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  created_at timestamptz default now()
);

-- Auto-create profile when user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Weekly menus
create table if not exists menus (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  week_start date not null,
  created_at timestamptz default now(),
  unique(user_id, week_start)
);

-- Meals: one per day slot in a menu
create table if not exists meals (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid references menus(id) on delete cascade not null,
  day_of_week int not null check (day_of_week between 0 and 6),
  meal_name text,
  recipe_id text,
  recipe_data jsonb,
  created_at timestamptz default now(),
  unique(menu_id, day_of_week)
);

-- Shopping list items
create table if not exists shopping_items (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid references menus(id) on delete cascade not null,
  ingredient text not null,
  quantity text,
  checked boolean default false
);

-- Row Level Security
alter table profiles enable row level security;
alter table menus enable row level security;
alter table meals enable row level security;
alter table shopping_items enable row level security;

-- Profiles: users can only see and edit their own
create policy "profiles_select" on profiles for select using (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- Menus: users own their menus
create policy "menus_select" on menus for select using (auth.uid() = user_id);
create policy "menus_insert" on menus for insert with check (auth.uid() = user_id);
create policy "menus_update" on menus for update using (auth.uid() = user_id);
create policy "menus_delete" on menus for delete using (auth.uid() = user_id);

-- Meals: accessible via menu ownership
create policy "meals_select" on meals for select using (
  exists (select 1 from menus where menus.id = meals.menu_id and menus.user_id = auth.uid())
);
create policy "meals_insert" on meals for insert with check (
  exists (select 1 from menus where menus.id = meals.menu_id and menus.user_id = auth.uid())
);
create policy "meals_update" on meals for update using (
  exists (select 1 from menus where menus.id = meals.menu_id and menus.user_id = auth.uid())
);
create policy "meals_delete" on meals for delete using (
  exists (select 1 from menus where menus.id = meals.menu_id and menus.user_id = auth.uid())
);

-- Shopping items: accessible via menu ownership
create policy "shopping_select" on shopping_items for select using (
  exists (select 1 from menus where menus.id = shopping_items.menu_id and menus.user_id = auth.uid())
);
create policy "shopping_insert" on shopping_items for insert with check (
  exists (select 1 from menus where menus.id = shopping_items.menu_id and menus.user_id = auth.uid())
);
create policy "shopping_update" on shopping_items for update using (
  exists (select 1 from menus where menus.id = shopping_items.menu_id and menus.user_id = auth.uid())
);
create policy "shopping_delete" on shopping_items for delete using (
  exists (select 1 from menus where menus.id = shopping_items.menu_id and menus.user_id = auth.uid())
);

-- ============================================================
-- MIGRATION: Run this block after the initial schema above
-- ============================================================

-- 1. Household size on profiles
alter table profiles add column if not exists household_size integer not null default 4;

-- 2. Meal type on meals (breakfast / lunch / dinner)
alter table meals add column if not exists meal_type text not null default 'dinner';

-- 3. Replace the unique constraint to include meal_type
alter table meals drop constraint if exists meals_menu_id_day_of_week_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'meals_menu_id_day_of_week_meal_type_key'
  ) then
    alter table meals
      add constraint meals_menu_id_day_of_week_meal_type_key
      unique (menu_id, day_of_week, meal_type);
  end if;
end $$;

-- 4. Custom recipes table
create table if not exists custom_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  description text,
  servings integer not null default 4,
  is_healthy boolean not null default false,
  ingredients jsonb not null default '[]'::jsonb,
  instructions text,
  thumbnail text,
  category text,
  created_at timestamptz default now()
);

alter table custom_recipes enable row level security;

drop policy if exists "custom_recipes_select" on custom_recipes;
drop policy if exists "custom_recipes_insert" on custom_recipes;
drop policy if exists "custom_recipes_update" on custom_recipes;
drop policy if exists "custom_recipes_delete" on custom_recipes;

create policy "custom_recipes_select" on custom_recipes for select using (auth.uid() = user_id);
create policy "custom_recipes_insert" on custom_recipes for insert with check (auth.uid() = user_id);
create policy "custom_recipes_update" on custom_recipes for update using (auth.uid() = user_id);
create policy "custom_recipes_delete" on custom_recipes for delete using (auth.uid() = user_id);

-- ============================================================
-- MIGRATION 2: Lunch sections
-- Run this block in Supabase → SQL Editor
-- ============================================================

-- 1. Add section column (default 'main' keeps all existing meals intact)
alter table meals add column if not exists section text not null default 'main';

-- 2. Replace unique constraint to include section
alter table meals drop constraint if exists meals_menu_id_day_of_week_meal_type_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'meals_menu_id_day_of_week_meal_type_section_key'
  ) then
    alter table meals
      add constraint meals_menu_id_day_of_week_meal_type_section_key
      unique (menu_id, day_of_week, meal_type, section);
  end if;
end $$;
