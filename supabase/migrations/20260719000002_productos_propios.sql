-- Dato propio (OCR de etiqueta o carga manual). Nunca fusionar con off_cache (ver "Licencias" en el README).
create table productos_propios (
  codigo_barras text primary key,
  nombre text,
  marca text,
  ingredientes text,
  fuente text not null check (fuente in ('ocr', 'manual')),
  fecha_dato timestamptz not null default now()
);

comment on table productos_propios is 'Dato propio (OCR o carga manual). Relación con off_cache solo por código de barras, en tiempo de consulta.';
comment on column productos_propios.fuente is 'off_cache es la única tabla con fuente = off; aquí solo ocr o manual.';
comment on column productos_propios.fecha_dato is 'Momento en que se cargó o reconoció este producto.';
