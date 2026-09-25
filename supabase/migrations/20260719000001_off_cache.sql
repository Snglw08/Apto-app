-- Cache de Open Food Facts (licencia ODbL). Nunca fusionar con productos_propios (ver "Licencias" en el README).
create table off_cache (
  codigo_barras text primary key,
  nombre text,
  marca text,
  ingredientes text,
  last_modified_t bigint,
  states_tags text[] not null default '{}',
  completeness numeric,
  data_quality_errors_tags text[] not null default '{}',
  fuente text not null default 'off' check (fuente = 'off'),
  fecha_dato timestamptz not null default now()
);

comment on table off_cache is 'Cache de datos de Open Food Facts (ODbL). Relación con productos_propios solo por código de barras, en tiempo de consulta.';
comment on column off_cache.last_modified_t is 'Unix timestamp de última modificación en OFF (usado para la regla del semáforo: más de 2 años = datos incompletos).';
comment on column off_cache.states_tags is 'Debe incluir en:ingredients-completed para que el semáforo pueda mostrar verde.';
comment on column off_cache.completeness is 'Score de completitud de datos que reporta OFF.';
comment on column off_cache.data_quality_errors_tags is 'Debe estar vacío para que el semáforo pueda mostrar verde.';
comment on column off_cache.fecha_dato is 'Momento en que se persistió esta respuesta de OFF en el cache.';
