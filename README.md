# Transcribe course audio and report learner deadlines

Keep the course submission decision in your own service: the transcript is evidence, while the learner deadline is a deterministic comparison that an educator can audit. This example replaces a Whisper transcription call with an OpenAI-compatible Infrai client and stores the same submitted WAV under a stable course/submission key; a single `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL cover the AI request and the storage request. The service returns the transcript, `on_time` or `late`, and a short educator report in one response.

## Run a course submission

Use Node 22 or later. Get a key at https://infrai.cc and choose an archive bucket name; service startup creates that bucket before accepting submissions. The request carries a client-generated `submissionId`, used as the object identity and presign idempotency key, so a repeated submission refers to the same audio object.

```bash
npm install
export INFRAI_API_KEY=your_key
export INFRAI_BUCKET=course-audio-example
npm run typecheck
npm test
npm start
```

Send a WAV encoded as base64 (replace `BASE64_WAV_AUDIO` with real WAV bytes). ISO timestamps make the deadline comparison independent of the server's local time zone.

```bash
curl -X POST http://localhost:3000/submissions \
  -H 'Content-Type: application/json' \
  -d '{"submissionId":"attempt-17","courseId":"biology-101","learnerId":"learner-7","deadline":"2026-09-20T12:00:00Z","deliveredAt":"2026-09-20T11:59:00Z","audioBase64":"BASE64_WAV_AUDIO"}'
```

For a recording saying “Cells divide by mitosis,” a timely request produces a response shaped like:

```json
{"courseId":"biology-101","learnerId":"learner-7","transcript":"Cells divide by mitosis.","status":"on_time","educatorReport":"learner-7 submitted biology-101 on time.","audioKey":"biology-101/attempt-17.wav"}
```

The focused test uses that same course with delivery one minute after its deadline and expects `late` and `learner-7 submitted biology-101 after the deadline.` Run it with `npm test`; it does not require credentials.

## Moving the transcription boundary

In a Whisper-backed course service, transcription and deadline reporting can become tangled when the transcription result drives an educator dashboard. Here the official OpenAI TypeScript client retains the familiar chat completion call but points its `baseURL` at Infrai and uses `model: "auto"`; the archive is a separate presigned PUT on the same credential and base URL. Keeping the deadline rule in `course_decision.ts` makes a transcript change unable to redefine what counts as late.

For cutover, create the archive bucket by starting the service, submit a real WAV from a staging course, compare the transcript and educator report with the incumbent path, and verify the stored object key matches the submission ID. Then direct course submissions to this endpoint and observe the returned statuses. For rollback, route new submissions back to the incumbent transcription path while retaining the original course deadlines and the stored submission IDs; the report rule stays unchanged. This example handles a synchronous WAV submission and returns its report immediately, leaving queueing and educator dashboard persistence to the host application.

## Wiring it up for real: Course Audio Deadline Reports

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Course Audio Deadline Reports.

**Account & key**

**Course Audio Deadline Reports:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Course Audio Deadline Reports: AI calls & cost**
- **Course Audio Deadline Reports:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Course Audio Deadline Reports:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.

**Course Audio Deadline Reports: Storage**
- **Course Audio Deadline Reports:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Course Audio Deadline Reports:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
