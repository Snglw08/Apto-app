-- pacientes no tiene columna directa hacia nutricionistas (la relación pasa
-- por asignaciones), así que las policies verifican pertenencia con EXISTS.
--
-- Importante: en Postgres, una subconsulta dentro de una policy de RLS queda
-- sujeta al RLS de la tabla que consulta, evaluado con el mismo rol. Como
-- asignaciones tiene RLS activo sin policies propias, sin esta policy de
-- lectura el EXISTS de más abajo siempre vería cero filas.
create policy "Nutricionista lee sus propias asignaciones"
  on asignaciones for select
  to authenticated
  using (
    exists (
      select 1 from nutricionistas n
      where n.id = asignaciones.nutricionista_id
        and n.user_id = auth.uid()
    )
  );

-- Lectura: un nutricionista ve solo los pacientes que tiene asignados.
-- La creación de pacientes (pacientes + asignaciones en una sola operación)
-- pasa por una Route Handler con service_role, no por esta policy.
create policy "Nutricionista lee sus pacientes asignados"
  on pacientes for select
  to authenticated
  using (
    exists (
      select 1 from asignaciones a
      join nutricionistas n on n.id = a.nutricionista_id
      where a.paciente_id = pacientes.id
        and n.user_id = auth.uid()
    )
  );

-- Reglas: el nutricionista administra (lee, crea, edita, borra) las reglas
-- de sus propios pacientes directamente desde el cliente (RLS hace de guardia).
create policy "Nutricionista administra reglas de sus pacientes"
  on reglas for all
  to authenticated
  using (
    exists (
      select 1 from asignaciones a
      join nutricionistas n on n.id = a.nutricionista_id
      where a.paciente_id = reglas.paciente_id
        and n.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from asignaciones a
      join nutricionistas n on n.id = a.nutricionista_id
      where a.paciente_id = reglas.paciente_id
        and n.user_id = auth.uid()
    )
  );
