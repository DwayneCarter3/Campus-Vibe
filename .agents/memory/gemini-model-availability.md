---
name: Gemini model availability
description: A model can be listed for an API key yet fail when invoked through generateContent.
---

Do not rely solely on Gemini's model listing when selecting a default text model. Make a small generateContent request with the intended API version, model, and key before shipping.

**Why:** In this environment the model listing advertised gemini-2.5-flash with generateContent support, but generation returned HTTP 404 NOT_FOUND. gemini-3-flash-preview generated a response with the same key and API version. A listed model can still fail at runtime.

**How to apply:** When changing the chat model or provider, check a real generation call without logging the key or user data; use a confirmed working model or report the provider error explicitly.

For short, automated article summaries, Gemini 3 Flash's default thinking can consume the response token budget and return an incomplete answer even when the HTTP request succeeds. A minimal thinking level is supported and keeps short summaries reliable. The provider may also return 429 during bursts; pause an entire news cycle rather than retrying every article against an exhausted quota.

**Why:** A full article generated a MAX_TOKENS response with no complete sentences even after raising the output budget; reducing thinking and source length produced published updates. Repeated restarts then reached the provider's rate limit.

**How to apply:** Constrain thinking for short summarization tasks, enforce bounded input/output, and treat quota responses as a scheduler-wide cooldown rather than a per-item failure.