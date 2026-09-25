-- Vincula nutricionistas con Supabase Auth (auth.users).
alter table nutricionistas
  add column user_id uuid unique references auth.users(id) on delete cascade;

-- Crea automáticamente la fila de nutricionistas al registrarse. El nombre
-- viaja en options.data.nombre de supabase.auth.signUp(); coalesce evita que
-- una metadata faltante bloquee el registro (nombre es not null).
create function public.handle_nuevo_nutricionista()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.nutricionistas (user_id, nombre, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', ''), new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_nuevo_nutricionista();

-- Un nutricionista autenticado puede leer y actualizar únicamente su propia fila.
create policy "Nutricionista lee su propia fila"
  on nutricionistas for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Nutricionista actualiza su propia fila"
  on nutricionistas for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
