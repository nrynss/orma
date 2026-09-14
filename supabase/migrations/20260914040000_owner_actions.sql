-- T6.7 owner actions. These boundaries use the authenticated caller only.
-- The cancellation lock serializes with the tick's SKIP LOCKED claim, so the
-- winner decides whether a call can still leave the scheduled state.

create function public.cancel_call_run(run_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.call_runs%rowtype;
begin
  if run_id is null then
    raise exception 'cancelling a call run requires an id';
  end if;

  select *
    into v_run
    from public.call_runs
   where id = run_id
     and user_id = auth.uid()
   for update;

  if not found or v_run.state <> 'scheduled' then
    return false;
  end if;

  update public.call_runs
     set state = 'canceled',
         disposition = 'canceled',
         completed_at = now(),
         billable = false
   where id = v_run.id;

  insert into public.call_events (call_run_id, kind, detail)
  values (
    v_run.id,
    'canceled',
    jsonb_build_object('state', 'canceled', 'disposition', 'canceled')
  );

  return true;
end;
$$;

-- Audio objects have no foreign key to auth.users. The owner directory is
-- enforced by the storage policies, and deleting the object rows removes the
-- objects before the profile cascade starts.
create function public.delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'deleting an account requires an authenticated user';
  end if;

  delete from storage.objects
   where bucket_id = 'item-audio'
     and name like v_user_id::text || '/%';

  delete from auth.users
   where id = v_user_id;

  return found;
end;
$$;

revoke all on function public.cancel_call_run(uuid) from public;
revoke all on function public.cancel_call_run(uuid) from anon;
grant execute on function public.cancel_call_run(uuid) to authenticated;

revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;
