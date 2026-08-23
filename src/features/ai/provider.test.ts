import test from "node:test";
import assert from "node:assert/strict";
import {
  applyEnrichments,
  enrichStudySessionsInputSchema,
  fallbackEnrichments,
  isNaturalIndonesian,
} from "./provider";
import { GroqAiProvider } from "@/server/ai/groq";
import type { StudySession } from "@/features/onboarding/types";

const session: StudySession = {
  id: "session-1",
  sessionKey: "session-1",
  courseId: "a",
  courseCode: "IF-001",
  courseName: "Algoritma",
  date: "2026-08-24",
  startTime: "19:00",
  endTime: "19:45",
  duration: 45,
  status: "planned",
  prioritySnapshot: {
    academicLoad: 0.6,
    knowledgeGap: 0.8,
    difficulty: 0.6,
    urgency: 0.2,
    adaptation: 0,
    score: 0.7,
  },
};

test("fallback enrichment selalu Bahasa Indonesia dan mempertahankan kunci lokal", () => {
  const result = fallbackEnrichments([session]);
  assert.equal(result.sessions[0]?.sessionKey, session.sessionKey);
  assert.equal(isNaturalIndonesian(result.sessions[0]?.goal ?? ""), true);
  assert.equal(isNaturalIndonesian("Review the study goal"), false);
  assert.deepEqual(applyEnrichments([session], result)[0]?.studyMethod, "Mengingat Aktif");
});

test("provider mengirim satu batch structured output ketat dan memetakan hasil", async () => {
  const calls: Record<string, unknown>[] = [];
  const provider = new GroqAiProvider({
    chat: {
      completions: {
        create: async (request) => {
          calls.push(request);
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sessions: [
                      {
                        sessionKey: "session-1",
                        studyMethod: "Latihan Konsep",
                        goal: "Jelaskan kembali satu konsep utama algoritma dengan kata-katamu sendiri.",
                        explanation: "Tujuan ini membantu menguji pemahamanmu secara bertahap.",
                      },
                    ],
                  }),
                },
              },
            ],
          };
        },
      },
    },
  });
  const input = enrichStudySessionsInputSchema.parse({
    sessions: [
      {
        sessionKey: "session-1",
        courseName: "Algoritma",
        date: "2026-08-24",
        duration: 45,
        priorityScore: 0.7,
        knowledgeGap: 0.8,
        difficulty: 0.6,
        urgency: 0.2,
      },
    ],
  });
  const result = await provider.enrichStudySessions(input);
  assert.equal(result.sessions.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.model, "openai/gpt-oss-120b");
  assert.deepEqual((calls[0]?.response_format as { json_schema: { strict: boolean } }).json_schema.strict, true);
});

test("provider menolak hasil berbahasa Inggris atau kunci yang tidak cocok", async () => {
  const provider = new GroqAiProvider({
    chat: {
      completions: {
        create: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sessions: [
                    {
                      sessionKey: "session-1",
                      studyMethod: "Study review",
                      goal: "Review the topic",
                      explanation: "The session is useful",
                    },
                  ],
                }),
              },
            },
          ],
        }),
      },
    },
  });
  await assert.rejects(
    provider.enrichStudySessions({
      sessions: [
        {
          sessionKey: "session-1",
          courseName: "Algoritma",
          date: "2026-08-24",
          duration: 45,
          priorityScore: 0.7,
          knowledgeGap: 0.8,
          difficulty: 0.6,
          urgency: 0.2,
        },
      ],
    }),
  );
});
