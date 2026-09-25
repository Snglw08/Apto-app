-- RLS ya estaba habilitado manualmente en las 6 tablas (fuera de estas migraciones).
-- Se deja explícito acá para que el historial de migraciones siga siendo la fuente
-- de verdad reconstruible desde git (ver "Base de datos" en el README).
alter table off_cache enable row level security;
alter table productos_propios enable row level security;
alter table nutricionistas enable row level security;
alter table pacientes enable row level security;
alter table asignaciones enable row level security;
alter table reglas enable row level security;

-- off_cache y productos_propios son datos de producto pensados para lectura pública:
-- cualquier paciente que escanea un código de barras debe poder verlos sin autenticarse.
-- La escritura en off_cache la hace únicamente la ruta de servidor con service_role
-- (bypasea RLS), así que no hace falta policy de INSERT/UPDATE.
create policy "Lectura pública de off_cache"
  on off_cache for select
  to anon, authenticated
  using (true);

create policy "Lectura pública de productos_propios"
  on productos_propios for select
  to anon, authenticated
  using (true);

-- nutricionistas, pacientes, asignaciones y reglas quedan sin policies:
-- RLS habilitado + ninguna policy = denegado por defecto para anon/authenticated.
-- El acceso a estas tablas se diseñará junto con la autenticación del circuito clínico.
