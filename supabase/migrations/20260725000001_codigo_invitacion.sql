-- Código de invitación por paciente, formato de despliegue "AP-XXXX" (el
-- prefijo "AP-" es constante de la app; acá solo se guardan los 4 caracteres
-- variables).
alter table pacientes add column codigo_invitacion text unique;

-- El nutricionista puede generar/regenerar el código de sus propios pacientes.
create policy "Nutricionista actualiza sus pacientes asignados"
  on pacientes for update
  to authenticated
  using (
    exists (
      select 1 from asignaciones a
      join nutricionistas n on n.id = a.nutricionista_id
      where a.paciente_id = pacientes.id
        and n.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from asignaciones a
      join nutricionistas n on n.id = a.nutricionista_id
      where a.paciente_id = pacientes.id
        and n.user_id = auth.uid()
    )
  );

-- A propósito NO hay policy pública de SELECT para validar el código: RLS
-- filtra filas, no controla la forma de la consulta, así que cualquier
-- policy de lectura anónima sobre pacientes dejaría a un cliente sin
-- autenticar listar TODOS los pacientes con "select *" sin filtrar (nombre,
-- diagnóstico, etc.), no solo buscar por código exacto. La validación del
-- código para un visitante anónimo pasa por una Route Handler con
-- service_role que solo permite un lookup exacto por codigo_invitacion y
-- devuelve el mínimo de datos (nombre del paciente y del nutricionista).
