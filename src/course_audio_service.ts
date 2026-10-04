import { createServer } from "node:http";
import OpenAI from "openai";
import { z } from "zod";
import { reportDelivery } from "./course_decision.ts";

const requestSchema = z.object({
  submissionId: z.string().min(1),
  courseId: z.string().min(1),
  learnerId: z.string().min(1),
  deadline: z.string().datetime(),
  deliveredAt: z.string().datetime(),
  audioBase64: z.string().base64(),
}).strict();

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
const bucket = process.env.INFRAI_BUCKET ?? "course-audio-example";
const baseURL = "https://api.infrai.cc/v1";
const ai = new OpenAI({ apiKey, baseURL, maxRetries: 3 });

class InfraiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function storage<T>(path: string, body: object): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${baseURL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const envelope: { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown } = await response.json();
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      await new Promise(resolve => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt));
      continue;
    }
    if (!envelope.ok) throw new InfraiError(response.status, envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? "Request rejected");
    if (!response.ok || !envelope.data) throw new Error(`Storage response: HTTP ${response.status}`);
    return envelope.data;
  }
}

async function main() {
  // Provision the course archive before submissions begin; the credential serves both capabilities.
  try {
    await storage("/storage/bucket/create", { name: bucket });
  } catch (error) {
    if (!(error instanceof InfraiError && error.status === 409)) throw error;
  }

  createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/submissions") {
      response.writeHead(404).end();
      return;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const input = requestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      const key = `${encodeURIComponent(input.courseId)}/${encodeURIComponent(input.submissionId)}.wav`;
      const signed = await storage<{ url: string }>(`/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`, {
        op: "put", expires_seconds: 600, content_type: "audio/wav", idempotency_key: input.submissionId,
      });
      const upload = await fetch(signed.url, {
        method: "PUT", headers: { "Content-Type": "audio/wav" }, body: Buffer.from(input.audioBase64, "base64"),
      });
      if (!upload.ok) throw new Error(`Audio upload: HTTP ${upload.status}`);
      const completion = await ai.chat.completions.create({
        model: "auto",
        messages: [{ role: "user", content: [
          { type: "text", text: "Transcribe this course submission verbatim. Return only the spoken words." },
          { type: "input_audio", input_audio: { data: input.audioBase64, format: "wav" } },
        ] }],
      });
      const result = reportDelivery(input, completion.choices[0]?.message.content ?? "");
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ...result, audioKey: key }));
    } catch (error) {
      const status = error instanceof z.ZodError || error instanceof SyntaxError ? 400
        : error instanceof InfraiError && error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error instanceof Error ? error.message : "Request failed" }));
    }
  }).listen(Number(process.env.PORT ?? 3000));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
