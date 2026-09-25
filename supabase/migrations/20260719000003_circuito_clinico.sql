-- Circuito clínico: nutricionistas, pacientes demo, reglas, asignaciones.
-- Solo datos de prueba en esta fase (ver "Datos" en el README) — nombres y diagnósticos ficticios.
-- Tablas separadas de off_cache y productos_propios (ver "Licencias" en el README).

create table nutricionistas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text,
  created_at timestamptz not null default now()
);

create table pacientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  diagnostico text,
  created_at timestamptz not null default now()
);
comment on table pacientes is 'Pacientes demo ficticios. Ningún dato real de pacientes en esta fase.';

-- Vínculo paciente <-> nutricionista. Un paciente tiene un nutricionista asignado a la vez.
create table asignaciones (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references nutricionistas(id) on delete cascade,
  paciente_id uuid not null references pacientes(id) on delete cascade unique,
  created_at timestamptz not null default now()
);

-- Regla por ingrediente: vetar o recomendar productos cuya lista de ingredientes
-- (de off_cache o productos_propios, por código de barras) contenga ingrediente_clave.
create table reglas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  tipo text not null check (tipo in ('vetado', 'recomendado')),
  ingrediente_clave text not null,
  created_at timestamptz not null default now()
);
comment on column reglas.ingrediente_clave is 'Palabra clave o substring a buscar en el texto de ingredientes del producto.';
