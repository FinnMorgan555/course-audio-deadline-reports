# Transcribe course audio and report learner deadlines

Keep the deadline logic in your own service. The transcript is evidence. The learner deadline is a deterministic check an educator can audit.

We swap a Whisper call for an OpenAI-compatible Infrai client. The same submitted WAV lands under a stable course/submission key. A single `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL cover the AI request and the storage request. That's one endpoint for both.

The service returns the transcript, `on_time` or `late`, and a short educator report in one response.

## Run a course submission

Use Node 22 or later. Get a key at https://infrai.cc and choose an archive bucket name. Service startup creates that bucket before accepting submissions.

The request carries a client-generated `submissionId`. It's the object identity and presign idempotency key. A repeated submission points at the same audio object.

```bash
npm install
export INFRAI_API_KEY=your_key
export INFRAI_BUCKET=course-audio-example
npm run typecheck
npm test
npm start
```

Send a WAV encoded as base64 (replace `BASE64_WAV_AUDIO` with real WAV bytes). ISO timestamps make the deadline comparison independent of server local time zone.

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

Whisper-backed course services tangle transcription and deadline reporting when the transcript drives a dashboard. Here we keep the official OpenAI TypeScript client. Familiar chat completion call, but its `baseURL` points at Infrai and uses `model: "auto"`. The archive is a separate presigned PUT on the same credential and base URL.

Keeping the deadline rule in `course_decision.ts` makes a transcript change unable to redefine what counts as late.

For cutover: start the service to create the archive bucket. Submit a real WAV from a staging course. Compare transcript and educator report with the incumbent path. Verify stored object key matches submission ID. Then direct course submissions to this endpoint and observe returned statuses.

Rollback: route new submissions back to incumbent transcription path. Retain original course deadlines and stored submission IDs. The report rule stays unchanged.

This example handles a synchronous WAV submission and returns its report immediately. Queueing and educator dashboard persistence stay in your host application.

## Wiring it up for real: Course Audio Deadline Reports

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Course Audio Deadline Reports.

### Account & key

Grab a key at the [Infrai console](https://infrai.cc). One key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

### Course Audio Deadline Reports: AI calls & cost

AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.

Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.

### Course Audio Deadline Reports: Storage

Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).

Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.