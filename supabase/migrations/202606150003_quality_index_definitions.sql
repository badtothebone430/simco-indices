insert into public.index_definitions (code, name, description, weighting_method)
values
  ('quality_0', 'Q0', 'Quality 0 resources excluding research, weighted by daily activity.', 'market_value'),
  ('quality_0_with_research', 'Q0 + Research', 'Quality 0 resources including research, weighted by daily activity.', 'market_value'),
  ('quality_1', 'Q1', 'Quality 1 resources weighted by daily activity.', 'market_value'),
  ('quality_2', 'Q2', 'Quality 2 resources weighted by daily activity.', 'market_value'),
  ('quality_3', 'Q3', 'Quality 3 resources weighted by daily activity.', 'market_value'),
  ('quality_4', 'Q4', 'Quality 4 resources weighted by daily activity.', 'market_value'),
  ('quality_5', 'Q5', 'Quality 5 resources weighted by daily activity.', 'market_value'),
  ('quality_6', 'Q6', 'Quality 6 resources weighted by daily activity.', 'market_value'),
  ('quality_7', 'Q7', 'Quality 7 resources weighted by daily activity.', 'market_value'),
  ('quality_8', 'Q8', 'Quality 8 resources weighted by daily activity.', 'market_value'),
  ('quality_9', 'Q9', 'Quality 9 resources weighted by daily activity.', 'market_value'),
  ('quality_10', 'Q10', 'Quality 10 resources weighted by daily activity.', 'market_value'),
  ('quality_11', 'Q11', 'Quality 11 resources weighted by daily activity.', 'market_value'),
  ('quality_12', 'Q12', 'Quality 12 resources weighted by daily activity.', 'market_value')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  weighting_method = excluded.weighting_method;

