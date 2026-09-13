#!/usr/bin/env bash

# Proves the ingestion RPC against a throwaway local Supabase project. The
# completed and invalid cases are driven by the recorded CALL-E fixtures. This
# script never contacts the linked project and never places a call.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fixtures="$repo_root/testdata/calle"
scratch_root="$(mktemp -d /tmp/orma-t2-7.XXXXXX)"
container_name="supabase_db_$(basename "$scratch_root")"
first_output="$scratch_root/first-ingest.out"

user_id="00000000-0000-0000-0000-000000000027"
main_run="00000000-0000-0000-0000-0000000000a7"
invalid_run="00000000-0000-0000-0000-0000000000a8"
reject_run="00000000-0000-0000-0000-0000000000a9"
lock_run="00000000-0000-0000-0000-0000000000aa"
boundary_run="00000000-0000-0000-0000-0000000000ab"
fixture_run="00000000-0000-0000-0000-0000000000ac"
retired_item="00000000-0000-0000-0000-0000000000b7"
open_item="00000000-0000-0000-0000-0000000000b8"

cleanup() {
  supabase stop --workdir "$scratch_root" >/dev/null 2>&1 || true
  rm -rf "$scratch_root"
}

trap cleanup EXIT

for command in base64 docker jq python3 rg supabase; do
  command -v "$command" >/dev/null || {
    echo "test-ingest requires $command" >&2
    exit 1
  }
done

# port_free succeeds when no socket holds the host port on either stack. A
# listener on one address still blocks Docker's wildcard bind, so probe that.
port_free() {
  python3 - "$1" <<'PY'
import socket
import sys

port = int(sys.argv[1])
for family, host in ((socket.AF_INET, "0.0.0.0"), (socket.AF_INET6, "::")):
    try:
        probe = socket.socket(family, socket.SOCK_STREAM)
    except OSError:
        continue
    try:
        if family == socket.AF_INET6:
            probe.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
        probe.bind((host, port))
    except OSError:
        sys.exit(1)
    finally:
        probe.close()
PY
}

# These offsets match the ports rewritten into config.toml below.
port_offsets=(0 1 2 3 4 7 9)

ports_free() {
  local offset
  for offset in "${port_offsets[@]}"; do
    port_free $(($1 + offset)) || return 1
  done
}

# pick_port_base shifts a candidate band by ten until every port in it is free.
pick_port_base() {
  local base=$1
  for _ in $(seq 1 100); do
    if ports_free "$base"; then
      echo "$base"
      return 0
    fi
    base=$((base + 10))
    if ((base > 64980)); then base=57000; fi
  done
  echo "test-ingest found no free port band near $1" >&2
  return 1
}

# Case zero: a busy port shifts the band. A listener bounded at spawn holds the
# database port of a free band, so an unshifted base would fail to bind.
candidate_base="$(pick_port_base $((57000 + ($$ % 500) * 10)))"
held_port=$((candidate_base + 2))
timeout 60 python3 -c '
import socket, sys, time
held = socket.socket()
held.bind(("127.0.0.1", int(sys.argv[1])))
held.listen()
print("ready", flush=True)
time.sleep(60)
' "$held_port" >"$scratch_root/held-port.out" &
holder_pid=$!
for _ in $(seq 1 100); do
  if rg -q ready "$scratch_root/held-port.out"; then break; fi
  sleep 0.05
done
rg -q ready "$scratch_root/held-port.out"
shifted_base="$(pick_port_base "$candidate_base")"
kill "$holder_pid" 2>/dev/null || true
wait "$holder_pid" 2>/dev/null || true
[[ "$shifted_base" != "$candidate_base" ]] || {
  echo "a busy port $held_port did not shift the port band" >&2
  exit 1
}
echo "T2.7 a busy port shifted the port band."

# The recorded call retired nothing and promised nothing, so the completed
# payload adds one retirement and one commitment to drive those branches.
completed_id="$(jq -r '.id' "$fixtures/call-completed.json")"
completed_turns="$(jq -c '.recipients[0].attempts[0].transcript_turns' "$fixtures/call-completed.json" | base64 -w0)"
completed_raw="$(base64 -w0 "$fixtures/call-completed.json")"
completed_structured="$(
  jq -c --arg item "$retired_item" \
    '.structured_result + {retired_items:[{item_id:$item,evidence_offset_seconds:62}], commitments:[{item_id:$item,due:"2026-09-12T03:00:00Z",evidence_offset_seconds:80}]}' \
    "$fixtures/call-completed.json" | base64 -w0
)"
fixture_structured="$(jq -c '.structured_result' "$fixtures/call-completed.json" | base64 -w0)"
completed_turn_count="$(jq '.recipients[0].attempts[0].transcript_turns | length' "$fixtures/call-completed.json")"

# The invalid call finished with no usable extract. Its raw payload mirrors the
# documented result_validation_failed webhook.
invalid_call_id="$(jq -r '.body.data.id' "$fixtures/webhook-result-validation-failed.documented.json")"
invalid_raw="$(
  jq -cn --arg id "$invalid_call_id" '{id:$id,status:"completed",structured_result:null}' | base64 -w0
)"

mkdir -p "$scratch_root/supabase/migrations"
supabase init --workdir "$scratch_root"
# A temporary project gets its own host ports, so it cannot attach to or stop a
# developer's local stack. The band is re-probed here, after case zero freed its
# held port, and shifts past any band another stack already binds.
port_base="$(pick_port_base "$candidate_base")"
sed -i \
  -e "s/^port = 54321$/port = $((port_base + 1))/" \
  -e "s/^port = 54322$/port = $((port_base + 2))/" \
  -e "s/^shadow_port = 54320$/shadow_port = $port_base/" \
  -e "s/^port = 54323$/port = $((port_base + 3))/" \
  -e "s/^port = 54324$/port = $((port_base + 4))/" \
  -e "s/^port = 54327$/port = $((port_base + 7))/" \
  -e "s/^port = 54329$/port = $((port_base + 9))/" \
  "$scratch_root/supabase/config.toml"
cp "$repo_root"/supabase/migrations/*.sql "$scratch_root/supabase/migrations/"
cp "$repo_root/supabase/seed.sql" "$scratch_root/supabase/"
# The pin needs PostgreSQL only. Excluding application services makes the
# disposable test quick and stops it from binding unrelated local ports.
supabase start --ignore-health-check \
  --exclude gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor \
  --workdir "$scratch_root"

psql() {
  docker exec -i "$container_name" psql -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}

# decode_utf8 turns a base64 CLI argument back into jsonb, so a fixture with an
# apostrophe or a newline cannot break the SQL literal.
decode_utf8() {
  printf "convert_from(decode('%s','base64'),'UTF8')::jsonb" "$1"
}

psql <<SQL
insert into auth.users (id, aud, role, email)
values ('$user_id', 'authenticated', 'authenticated', 't2-7@example.test');

insert into public.profiles (id, display_name, phone_e164)
values ('$user_id', 'Ingest test', '+14155550127');

insert into public.call_runs (id, user_id, local_date, part_of_day, scheduled_for, idempotency_key, calle_call_id)
values
  ('$main_run', '$user_id', current_date, 'morning', now() - interval '5 minutes', 't2-7-ingest', '$completed_id'),
  ('$invalid_run', '$user_id', current_date, 'morning', now() - interval '4 minutes', 't2-7-invalid', '$invalid_call_id'),
  ('$reject_run', '$user_id', current_date, 'morning', now() - interval '3 minutes', 't2-7-reject', 'call_t2_7_reject'),
  ('$lock_run', '$user_id', current_date, 'morning', now() - interval '2 minutes', 't2-7-lock', 'call_t2_7_lock'),
  ('$boundary_run', '$user_id', current_date, 'morning', now() - interval '1 minute', 't2-7-boundary', 'call_t2_7_boundary'),
  ('$fixture_run', '$user_id', current_date, 'morning', now(), 't2-7-fixture', '$completed_id');

insert into public.items (id, user_id, text, source)
values
  ('$retired_item', '$user_id', 'renew the passport', 'seed'),
  ('$open_item', '$user_id', 'book the dentist', 'seed');
SQL

# Case one: the completed fixture produces an item, a retirement, a commitment
# and one item_mentions row for each, so three mentions in total.
first_summary="$(psql <<SQL
set role service_role;
select public.ingest_call_result(
  '$main_run',
  '$user_id',
  $(decode_utf8 "$completed_turns"),
  $(decode_utf8 "$completed_raw"),
  $(decode_utf8 "$completed_structured"),
  true,
  null,
  'completed',
  'answered_extracted',
  'unknown',
  '2026-09-12T02:20:18Z'
);
SQL
)"
[[ "$(jq -r .already_ingested <<<"$first_summary")" == "false" ]]
[[ "$(jq -r .disposition <<<"$first_summary")" == "answered_extracted" ]]
[[ "$(jq -r .counts.items <<<"$first_summary")" == "1" ]]
[[ "$(jq -r .counts.mentions <<<"$first_summary")" == "3" ]]
[[ "$(jq -r .counts.retirements <<<"$first_summary")" == "1" ]]
[[ "$(jq -r .counts.commitments <<<"$first_summary")" == "1" ]]

[[ "$(psql <<SQL
select count(*) from public.items where user_id = '$user_id' and source = 'call';
SQL
)" == "1" ]]
[[ "$(psql <<SQL
select count(*) from public.item_mentions where call_run_id = '$main_run';
SQL
)" == "3" ]]
[[ "$(psql <<SQL
select count(*) from public.commitments where call_run_id = '$main_run';
SQL
)" == "1" ]]
[[ "$(psql <<SQL
select count(*) from public.items where id = '$retired_item' and status = 'retired' and retired_at is not null and retired_reason is not null;
SQL
)" == "1" ]]
[[ "$(psql <<SQL
select state || ' ' || disposition || ' ' || mood from public.call_runs where id = '$main_run';
SQL
)" == "completed answered_extracted unknown" ]]
# The transcript keeps every recorded turn and the raw payload keeps its call id.
[[ "$(psql <<SQL
select jsonb_array_length(turns) from public.transcripts where call_run_id = '$main_run';
SQL
)" == "$completed_turn_count" ]]
[[ "$(psql <<SQL
select raw ->> 'id' from public.transcripts where call_run_id = '$main_run';
SQL
)" == "$completed_id" ]]
[[ "$(psql <<SQL
select valid || ' ' || (structured -> 'captured_items' -> 0 ->> 'text') from public.results where call_run_id = '$main_run';
SQL
)" == "true Continental" ]]
# Ingestion never writes a slot. A slot change stays a proposal.
[[ "$(psql <<SQL
select count(*) from public.slots where user_id = '$user_id';
SQL
)" == "0" ]]
echo "T2.7 completed fixture produced its rows."

# Case two: a second identical call changes no row.
second_summary="$(psql <<SQL
set role service_role;
select public.ingest_call_result(
  '$main_run',
  '$user_id',
  $(decode_utf8 "$completed_turns"),
  $(decode_utf8 "$completed_raw"),
  $(decode_utf8 "$completed_structured"),
  true,
  null,
  'completed',
  'answered_extracted',
  'unknown',
  '2026-09-12T02:20:18Z'
);
SQL
)"
[[ "$(jq -r .already_ingested <<<"$second_summary")" == "true" ]]
[[ "$(jq -r .counts.items <<<"$second_summary")" == "0" ]]
[[ "$(psql <<SQL
select (select count(*) from public.items where user_id = '$user_id' and source = 'call')
  || ' ' || (select count(*) from public.item_mentions where call_run_id = '$main_run')
  || ' ' || (select count(*) from public.commitments where call_run_id = '$main_run')
  || ' ' || (select count(*) from public.transcripts where call_run_id = '$main_run')
  || ' ' || (select count(*) from public.results where call_run_id = '$main_run');
SQL
)" == "1 3 1 1 1" ]]
echo "T2.7 re-ingest changed no row."

# Case three: the invalid fixture writes a transcript and a disposition and no
# partial state. The structured result is null and valid is false.
invalid_summary="$(psql <<SQL
set role service_role;
select public.ingest_call_result(
  '$invalid_run',
  '$user_id',
  '[]'::jsonb,
  $(decode_utf8 "$invalid_raw"),
  null,
  false,
  'structured_result.captured_items must be an array',
  'completed',
  'answered_no_result',
  null,
  '2026-09-12T02:25:00Z'
);
SQL
)"
[[ "$(jq -r .already_ingested <<<"$invalid_summary")" == "false" ]]
[[ "$(jq -r .disposition <<<"$invalid_summary")" == "answered_no_result" ]]
[[ "$(jq -r .counts.items <<<"$invalid_summary")" == "0" ]]
[[ "$(psql <<SQL
select valid || ' ' || coalesce(error, '') from public.results where call_run_id = '$invalid_run';
SQL
)" == "false structured_result.captured_items must be an array" ]]
[[ "$(psql <<SQL
select count(*) from public.transcripts where call_run_id = '$invalid_run';
SQL
)" == "1" ]]
[[ "$(psql <<SQL
select state || ' ' || disposition from public.call_runs where id = '$invalid_run';
SQL
)" == "completed answered_no_result" ]]
# No partial state: no new item, mention or commitment anywhere.
[[ "$(psql <<SQL
select (select count(*) from public.items where user_id = '$user_id' and source = 'call')
  || ' ' || (select count(*) from public.item_mentions where call_run_id = '$invalid_run')
  || ' ' || (select count(*) from public.commitments where call_run_id = '$invalid_run');
SQL
)" == "1 0 0" ]]
echo "T2.7 invalid fixture left a transcript and a disposition."

# Case four: a retirement without an evidence offset raises the specific error,
# and its whole transaction rolls back.
reject_output="$(
  psql <<SQL 2>&1
set role service_role;
select public.ingest_call_result(
  '$reject_run',
  '$user_id',
  '[]'::jsonb,
  '{"id":"call_t2_7_reject"}'::jsonb,
  '{"captured_items":[],"retired_items":[{"item_id":"$retired_item"}]}'::jsonb,
  true,
  null,
  'completed',
  'answered_extracted',
  null,
  now()
);
SQL
)" || true
rg -q 'requires an evidence offset' <<<"$reject_output" || {
  echo "an unoffset retirement did not raise the evidence-offset error" >&2
  printf '%s\n' "$reject_output" >&2
  exit 1
}
[[ "$(psql <<SQL
select (select count(*) from public.results where call_run_id = '$reject_run')
  || ' ' || (select count(*) from public.transcripts where call_run_id = '$reject_run');
SQL
)" == "0 0" ]]
echo "T2.7 unoffset retirement was rejected."

# Case five: a concurrent second ingest waits on the locked run row. Session
# one holds its transaction open after the RPC returns. Session two must block
# rather than read an unlocked run.
(
  psql <<SQL
begin;
set role service_role;
select public.ingest_call_result(
  '$lock_run',
  '$user_id',
  '[]'::jsonb,
  '{"id":"call_t2_7_lock"}'::jsonb,
  '{"captured_items":[],"retired_items":[]}'::jsonb,
  true,
  null,
  'completed',
  'answered_extracted',
  null,
  now()
);
select pg_sleep(3);
commit;
SQL
) >"$first_output" &
first_pid=$!

for _ in $(seq 1 60); do
  if rg -q 'already_ingested' "$first_output"; then
    break
  fi
  sleep 0.05
done

rg -q 'already_ingested' "$first_output" || {
  echo "first PostgreSQL session did not ingest the locked run" >&2
  exit 1
}

# Python's monotonic clock gives this pin a sub-second deadline that a wall
# clock adjustment cannot shorten. A correct FOR UPDATE makes session two wait
# for the first commit, so it cannot return within the deadline.
second_output="$(python3 - "$container_name" "$lock_run" "$user_id" <<'PY'
import subprocess
import sys
import time

query = (
    "set role service_role;\n"
    "select public.ingest_call_result("
    f"'{sys.argv[2]}', '{sys.argv[3]}', '[]'::jsonb, "
    "'{\"id\":\"call_t2_7_lock\"}'::jsonb, "
    "'{\"captured_items\":[],\"retired_items\":[]}'::jsonb, "
    "true, null, 'completed', 'answered_extracted', null, now());\n"
)
command = [
    "docker", "exec", "-i", sys.argv[1], "psql", "-qAt",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres",
]
started = time.monotonic()
try:
    subprocess.run(command, input=query, text=True, capture_output=True, check=True, timeout=0.75)
except subprocess.TimeoutExpired:
    print("blocked")
    raise SystemExit(0)
except subprocess.CalledProcessError as error:
    raise SystemExit(error.stderr)

elapsed = time.monotonic() - started
raise SystemExit(f"second ingest returned after {elapsed:.3f}s, so it did not wait on the run lock")
PY
)"

wait "$first_pid"
[[ "$second_output" == "blocked" ]]
echo "T2.7 concurrent ingest waited on the run lock."

# Case six: the boundary values ingest.ts accepts all commit in PostgreSQL. The
# Deno test "boundary values that PostgreSQL accepts stay valid" uses the same
# values, so ingest.ts can never accept a result this RPC would refuse there.
boundary_upper="$(tr '[:lower:]' '[:upper:]' <<<"$retired_item")"
boundary_structured="$(
  printf '%s' '{"captured_items":[{"text":" x","evidence_offset_seconds":-2147483648},{"text":"café 😀","evidence_offset_seconds":2147483647}],"retired_items":[{"item_id":"UPPER","evidence_offset_seconds":0}],"commitments":[{"item_id":"ITEM","due":"2026-09-15","evidence_offset_seconds":1},{"item_id":"ITEM","due":"2026-09-15T10:00Z","evidence_offset_seconds":1},{"item_id":"ITEM","due":"2026-09-15 10:00:00.123456+15:59","evidence_offset_seconds":1},{"item_id":"ITEM","due":"2028-02-29T23:59:59-0530","evidence_offset_seconds":1},{"item_id":"ITEM","due":"0001-01-01T00:00:00Z","evidence_offset_seconds":1}]}' |
    sed -e "s/UPPER/$boundary_upper/" -e "s/ITEM/$retired_item/g" | base64 -w0
)"
boundary_summary="$(psql <<SQL
set role service_role;
select public.ingest_call_result(
  '$boundary_run', '$user_id', '[]'::jsonb, '{"id":"call_t2_7_boundary"}'::jsonb,
  $(decode_utf8 "$boundary_structured"),
  true, null, 'completed', 'answered_extracted', null, now()
);
SQL
)"
[[ "$(jq -S -c .counts <<<"$boundary_summary")" == '{"commitments":5,"items":2,"mentions":8,"retirements":1}' ]] || {
  echo "boundary ingest returned unexpected counts: $boundary_summary" >&2
  exit 1
}
[[ "$(psql <<SQL
select (select count(*) from public.commitments where call_run_id = '$boundary_run')
  || ' ' || (select count(*) from public.item_mentions where call_run_id = '$boundary_run')
  || ' ' || (select min(offset_seconds) || ' ' || max(offset_seconds) from public.item_mentions where call_run_id = '$boundary_run');
SQL
)" == "5 8 -2147483648 2147483647" ]]
echo "T2.7 every boundary value ingest.ts accepts committed in PostgreSQL."

# Case seven: each value ingest.ts now rejects parses cleanly yet makes the RPC
# raise and roll back. The Deno test "a parsed result the RPC would reject
# becomes answered_no_result" routes the same values to valid=false.
reject_cases=(
  '{"captured_items":[],"retired_items":[],"commitments":[{"item_id":"ITEM","due":"next Tuesday after work","evidence_offset_seconds":80}]}'
  '{"captured_items":[],"retired_items":[],"commitments":[{"item_id":"ITEM","due":"2026","evidence_offset_seconds":80}]}'
  '{"captured_items":[],"retired_items":[],"commitments":[{"item_id":"ITEM","due":"","evidence_offset_seconds":80}]}'
  '{"captured_items":[],"retired_items":[],"commitments":[{"item_id":"ITEM","due":"2026-02-30T10:00:00Z","evidence_offset_seconds":80}]}'
  '{"captured_items":[],"retired_items":[],"commitments":[{"item_id":"ITEM","due":"0000-09-15T10:00:00Z","evidence_offset_seconds":80}]}'
  '{"captured_items":[],"retired_items":[],"commitments":[{"item_id":"ITEM","due":"2026-09-15T10:00:00+16:00","evidence_offset_seconds":80}]}'
  '{"captured_items":[],"retired_items":[{"item_id":"the museum one","evidence_offset_seconds":62}]}'
  '{"captured_items":[],"retired_items":[],"commitments":[{"item_id":"passport","evidence_offset_seconds":80}]}'
  '{"captured_items":[{"text":"   ","evidence_offset_seconds":44}],"retired_items":[]}'
  '{"captured_items":[{"text":"","evidence_offset_seconds":44}],"retired_items":[]}'
  '{"captured_items":[{"text":"pass\u0000port","evidence_offset_seconds":44}],"retired_items":[]}'
  '{"captured_items":[{"text":"pass\ud800port","evidence_offset_seconds":44}],"retired_items":[]}'
  '{"captured_items":[],"retired_items":[],"slot_change_requested":"yes","slot_change_time":"7\u0000am"}'
  '{"captured_items":[{"text":"Continental","evidence_offset_seconds":2147483648}],"retired_items":[]}'
  '{"captured_items":[],"retired_items":[{"item_id":"ITEM","evidence_offset_seconds":1e21}]}'
  '{"captured_items":[],"retired_items":[],"commitments":[{"item_id":"ITEM","evidence_offset_seconds":-2147483649}]}'
  '{"captured_items":[],"retired_items":[{"item_id":"00000000-0000-4000-8000-00000000beef","evidence_offset_seconds":62}]}'
  '{"captured_items":[],"retired_items":[],"commitments":[{"item_id":"00000000-0000-4000-8000-00000000beef","evidence_offset_seconds":80}]}'
)
for structured in "${reject_cases[@]}"; do
  encoded="$(printf '%s' "${structured//ITEM/$retired_item}" | base64 -w0)"
  if psql >/dev/null 2>&1 <<SQL
set role service_role;
select public.ingest_call_result(
  '$reject_run', '$user_id', '[]'::jsonb, '{"id":"call_t2_7_reject"}'::jsonb,
  $(decode_utf8 "$encoded"),
  true, null, 'completed', 'answered_extracted', null, now()
);
SQL
  then
    echo "PostgreSQL accepted a result that ingest.ts rejects: $structured" >&2
    exit 1
  fi
done
[[ "$(psql <<SQL
select (select count(*) from public.results where call_run_id = '$reject_run')
  || ' ' || (select count(*) from public.transcripts where call_run_id = '$reject_run')
  || ' ' || (select count(*) from public.item_mentions where call_run_id = '$reject_run');
SQL
)" == "0 0 0" ]]
echo "T2.7 all ${#reject_cases[@]} values ingest.ts rejects raise in PostgreSQL."

# Case eight: the committed fixture, unmodified, is one captured item and
# nothing else. Cases one and two add a retirement and a commitment to it.
psql <<SQL >/dev/null
set role service_role;
select public.ingest_call_result(
  '$fixture_run', '$user_id',
  $(decode_utf8 "$completed_turns"),
  $(decode_utf8 "$completed_raw"),
  $(decode_utf8 "$fixture_structured"),
  true, null, 'completed', 'answered_extracted', 'unknown', '2026-09-12T02:20:18Z'
);
SQL
fixture_rows="$(psql <<SQL
select (select count(*) from public.item_mentions m join public.items i on i.id = m.item_id
         where m.call_run_id = '$fixture_run' and i.source = 'call')
  || ' mentions=' || (select string_agg(offset_seconds::text, ',' order by offset_seconds) from public.item_mentions where call_run_id = '$fixture_run')
  || ' commitments=' || (select count(*) from public.commitments where call_run_id = '$fixture_run')
  || ' open_item=' || (select status from public.items where id = '$open_item');
SQL
)"
echo "T2.7 unmodified completed fixture rows: items=$fixture_rows"
[[ "$fixture_rows" == "1 mentions=44 commitments=0 open_item=open" ]]

echo "T2.7 ingestion acceptance passed."
