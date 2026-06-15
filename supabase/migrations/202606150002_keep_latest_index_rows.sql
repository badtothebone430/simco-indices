delete from public.index_components c
where c.date < (
  select max(c2.date)
  from public.index_components c2
  where c2.index_code = c.index_code
    and c2.realm_id = c.realm_id
);

delete from public.index_values v
where v.date < (
  select max(v2.date)
  from public.index_values v2
  where v2.index_code = v.index_code
    and v2.realm_id = v.realm_id
);

