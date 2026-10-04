import assert from "node:assert/strict";
import test from "node:test";
import { reportDelivery } from "./course_decision.ts";

test("an audio submission after the learner deadline appears as late in the educator report", () => {
  const result = reportDelivery({
    courseId: "biology-101",
    learnerId: "learner-7",
    deadline: "2026-09-20T12:00:00Z",
    deliveredAt: "2026-09-20T12:01:00Z",
  }, "Cells divide by mitosis.");
  assert.equal(result.status, "late");
  assert.equal(result.educatorReport, "learner-7 submitted biology-101 after the deadline.");
  assert.equal(result.transcript, "Cells divide by mitosis.");
});
