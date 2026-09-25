-- Datos semilla del circuito clínico.
--
-- Todo lo que hay acá es ficticio: nombres inventados, diagnósticos genéricos
-- y reglas de ejemplo. El proyecto nunca maneja datos reales de pacientes.
--
-- Este archivo existe además por una razón operativa: el free tier de Supabase
-- no tiene backups, así que es la única forma de reconstruir el estado si el
-- proyecto se pausa, se pierde o se recrea desde cero.
--
-- No incluye productos. off_cache se llena sola al escanear (es cache de Open
-- Food Facts) y productos_propios se llena desde el flujo de OCR.
--
-- Cómo usarlo en un proyecto de Supabase nuevo:
--   1) Correr las migraciones de supabase/migrations/ en orden.
--   2) Registrar la cuenta demo de nutricionista desde /nutricionista/registro
--      con el correo que figura en `nutricionista_email` más abajo. La fila de
--      `nutricionistas` se crea sola por trigger (on_auth_user_created, ver
--      20260723000001_auth_nutricionistas.sql): Supabase Auth administra
--      auth.users internamente y no es seguro insertar ahí a mano.
--   3) Correr este archivo completo.
--
-- Los IDs son fijos y todos los insert usan ON CONFLICT, así que correrlo
-- dos veces no duplica nada.

-- --------------------------------------------------------------------------
-- Pacientes demo. El código de invitación es el que un visitante escribe en
-- /vinculacion para probar la app sin crear cuenta (se muestra como AP-XXXX).
insert into pacientes (id, nombre, diagnostico, codigo_invitacion) values
  ('11111111-1111-4111-8111-111111111111', 'Paciente Demo', 'Intolerancia a la lactosa', '4821'),
  ('22222222-2222-4222-8222-222222222222', 'Ana Ríos',      'Enfermedad celíaca',        '7350'),
  ('33333333-3333-4333-8333-333333333333', 'Bruno Vega',    'Hipertensión arterial',     null)
on conflict (id) do nothing;

-- --------------------------------------------------------------------------
-- Reglas. `ingrediente_clave` se busca como substring en el texto de
-- ingredientes del producto, venga de off_cache o de productos_propios.
-- Una coincidencia con una regla 'vetado' gana siempre sobre 'recomendado':
-- ante conflicto, el semáforo falla hacia el lado seguro.
insert into reglas (id, paciente_id, tipo, ingrediente_clave) values
  -- Paciente Demo — intolerancia a la lactosa
  ('a1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'vetado',      'lactosa'),
  ('a1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'vetado',      'leche'),
  ('a1000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'vetado',      'suero de leche'),
  ('a1000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'recomendado', 'bebida de avena'),

  -- Ana Ríos — celíaca
  ('a2000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'vetado',      'trigo'),
  ('a2000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'vetado',      'gluten'),
  ('a2000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'vetado',      'cebada'),
  ('a2000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'vetado',      'centeno'),
  ('a2000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', 'recomendado', 'quinoa'),

  -- Bruno Vega — hipertensión
  ('a3000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'vetado',      'glutamato monosódico'),
  ('a3000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'vetado',      'sal'),
  ('a3000000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 'recomendado', 'sin sodio')
on conflict (id) do nothing;

-- --------------------------------------------------------------------------
-- Asignaciones. Busca la cuenta demo por correo en lugar de hardcodear su id,
-- porque ese id lo genera Supabase Auth al registrarse (paso 2 de arriba) y
-- cambia en cada proyecto nuevo.
do $$
declare
  nutricionista_email text := 'demo@apto.local';
  nutricionista_id_real uuid;
begin
  select id into nutricionista_id_real
  from nutricionistas
  where email = nutricionista_email;

  if nutricionista_id_real is null then
    raise notice 'No existe un nutricionista con email %. Registralo desde /nutricionista/registro y volvé a correr este bloque.', nutricionista_email;
  else
    insert into asignaciones (nutricionista_id, paciente_id) values
      (nutricionista_id_real, '11111111-1111-4111-8111-111111111111'),
      (nutricionista_id_real, '22222222-2222-4222-8222-222222222222'),
      (nutricionista_id_real, '33333333-3333-4333-8333-333333333333')
    on conflict (paciente_id) do nothing;
  end if;
end $$;
