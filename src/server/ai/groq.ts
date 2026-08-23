import Groq from "groq-sdk";
import {
  enrichStudySessionsInputSchema,
  enrichStudySessionsResultSchema,
  isNaturalIndonesian,
  type AiProvider,
  type EnrichStudySessionsInput,
  type EnrichStudySessionsResult,
} from "@/features/ai/provider";

type GroqClientLike = {
  chat: {
    completions: {
      create(request: Record<string, unknown>): Promise<unknown>;
    };
  };
};

const MODEL = "openai/gpt-oss-120b";
const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sessions"],
  properties: {
    sessions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sessionKey", "studyMethod", "goal", "explanation"],
        properties: {
          sessionKey: { type: "string" },
          studyMethod: { type: "string" },
          goal: { type: "string" },
          explanation: { type: "string" },
        },
      },
    },
  },
} as const;

function reasoningEffort() {
  const value = process.env.GROQ_REASONING_EFFORT ?? "medium";
  return ["low", "medium", "high"].includes(value) ? value : "medium";
}

function defaultClient(): GroqClientLike {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY belum tersedia di server.");
  return new Groq({ apiKey: process.env.GROQ_API_KEY }) as unknown as GroqClientLike;
}

function languageValid(result: EnrichStudySessionsResult) {
  return result.sessions.every(
    (session) =>
      isNaturalIndonesian(session.studyMethod) &&
      isNaturalIndonesian(session.goal) &&
      isNaturalIndonesian(session.explanation),
  );
}

export class GroqAiProvider implements AiProvider {
  constructor(private readonly client: GroqClientLike = defaultClient()) {}

  async enrichStudySessions(input: EnrichStudySessionsInput) {
    const safeInput = enrichStudySessionsInputSchema.parse(input);
    const response = await this.client.chat.completions.create({
      model: process.env.GROQ_MODEL || MODEL,
      messages: [
        {
          role: "system",
          content:
            "Kamu membantu mahasiswa menyusun strategi belajar dari sesi yang sudah ditentukan. " +
            "Kembalikan tepat satu hasil untuk setiap sessionKey. " +
            "Kamu hanya boleh menentukan metode belajar, tujuan sesi, dan penjelasan manusiawi. " +
            "Jangan mengubah tanggal, waktu, durasi, jumlah sesi, ketersediaan, beban, atau identitas sesi. " +
            "Tulis seluruh hasil dalam Bahasa Indonesia yang alami. Jangan gunakan bahasa Inggris kecuali istilah teknis mata kuliah yang memang tidak memiliki padanan alami.",
        },
        {
          role: "user",
          content: JSON.stringify({
            sesi: safeInput.sessions,
            instruksi: "Gunakan hanya data sesi di atas. Jangan membuat sessionKey baru.",
          }),
        },
      ],
      reasoning_effort: reasoningEffort(),
      reasoning_format: "hidden",
      temperature: 0.2,
      seed: 383,
      max_completion_tokens: Math.min(12000, Math.max(1800, safeInput.sessions.length * 120)),
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "enrich_study_sessions",
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      },
    });
    const content = (response as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Respons Groq tidak berisi hasil terstruktur.");
    const result = enrichStudySessionsResultSchema.parse(JSON.parse(content));
    const inputKeys = new Set(safeInput.sessions.map((session) => session.sessionKey));
    const outputKeys = new Set(result.sessions.map((session) => session.sessionKey));
    if (
      result.sessions.length !== safeInput.sessions.length ||
      outputKeys.size !== inputKeys.size ||
      [...inputKeys].some((key) => !outputKeys.has(key)) ||
      !languageValid(result)
    ) {
      throw new Error("Respons Groq tidak memenuhi batas bahasa atau pemetaan sesi.");
    }
    return result;
  }
}

export function createGroqAiProvider() {
  return new GroqAiProvider();
}
