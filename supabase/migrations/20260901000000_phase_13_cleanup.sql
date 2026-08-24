-- Forward cleanup for databases that already ran the earlier phase migrations.
-- Legacy columns remain nullable so existing rows are preserved while new payloads stop using them.
alter table public.courses alter column code drop not null;
alter table public.study_sessions alter column course_code drop not null;

-- The old course-code uniqueness rule must not block two courses with the same name/code history.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.courses'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%code%'
  loop
    execute format('alter table public.courses drop constraint %I', constraint_name);
  end loop;
end $$;

-- Timezone is now an internal/browser-resolved value, not an account preference.
alter table public.profiles alter column timezone drop default;
update public.profiles
set timezone = 'UTC', updated_at = now()
where timezone = 'Asia/Jakarta';

-- Normalize the historical demo marker before tightening the extraction source check.
update public.krs_documents
set extraction_source = 'manual'
where extraction_source = 'demo';

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.krs_documents'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%demo%'
  loop
    execute format('alter table public.krs_documents drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.krs_documents
  drop constraint if exists krs_documents_extraction_source_check;

alter table public.krs_documents
  add constraint krs_documents_extraction_source_check
  check (extraction_source is null or extraction_source in ('pdf-text', 'ocr', 'manual'));

-- RLS remains the row-level boundary; these grants only expose the lifecycle table to its policy.
grant select, insert, update, delete on table public.semesters to authenticated;
