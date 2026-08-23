import test from "node:test";
import assert from "node:assert/strict";
import { createCalendarState, verifyCalendarState } from "./state";

test("state OAuth acak dan hanya cocok dengan nilai utuh", () => {
  const state = createCalendarState();
  assert.ok(state.length > 20);
  assert.equal(verifyCalendarState(state, state), true);
  assert.equal(verifyCalendarState(state, `${state}x`), false);
  assert.equal(verifyCalendarState(state, null), false);
});
