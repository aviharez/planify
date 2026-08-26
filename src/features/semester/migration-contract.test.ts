import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260902000000_semester_isolation.sql"), "utf8");
const correction = readFileSync(
  join(process.cwd(), "supabase/migrations/20260902000001_fix_replace_active_study_plan_ambiguity.sql"),
  "utf8",
);
const replacement = migration.slice(migration.indexOf("create or replace function public.replace_active_study_plan"));

test("replacement RPC mengikat setup, batas semester, dan course_code dalam satu fungsi transaksional", () => {
  assert.match(replacement, /p_setup_payload jsonb/);
  assert.match(replacement, /select s\.started_at into semester_started_at[\s\S]*for update;/);
  assert.match(replacement, /'semesterId', p_semester_id::text/);
  assert.match(replacement, /set setup_payload = semester_payload/);
  assert.match(replacement, /planning period starts before active semester/);
  assert.match(replacement, /study session starts before active semester/);
  assert.match(replacement, /select nullif\(course\.value->>'code', ''\)[\s\S]*item\.value->>'courseId'/);
  assert.doesNotMatch(replacement, /item\.value->>'courseId',\s*null,\s*item\.value->>'courseName'/);
});

test("replacement RPC menghindari nama source plan yang ambigu", () => {
  assert.match(correction, /v_source_plan_id uuid;/);
  assert.match(correction, /where p\.id = v_source_plan_id/);
  assert.doesNotMatch(correction, /where p\.id = source_plan_id/);
});
