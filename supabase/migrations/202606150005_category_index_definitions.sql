insert into public.index_definitions (code, name, description, weighting_method)
values
  ('agriculture_only', 'Agriculture', 'Agriculture resources weighted by daily market activity.', 'market_value'),
  ('fashion_only', 'Fashion', 'Fashion resources weighted by daily market activity.', 'market_value'),
  ('energy_only', 'Energy', 'Energy resources weighted by daily market activity.', 'market_value'),
  ('electronics_only', 'Electronics', 'Electronics resources weighted by daily market activity.', 'market_value'),
  ('automotive_only', 'Automotive', 'Automotive resources weighted by daily market activity.', 'market_value'),
  ('aerospace_only', 'Aerospace', 'Aerospace resources weighted by daily market activity.', 'market_value'),
  ('resources_only', 'Resources', 'Raw and industrial resource inputs weighted by daily market activity.', 'market_value'),
  ('seasonal_only', 'Seasonal', 'Seasonal resources weighted by daily market activity.', 'market_value'),
  ('food_only', 'Food', 'Food resources weighted by daily market activity.', 'market_value'),
  ('construction_only', 'Construction', 'Construction resources weighted by daily market activity.', 'market_value'),
  ('research_only', 'Research', 'Research resources weighted by daily market activity.', 'market_value')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  weighting_method = excluded.weighting_method;
