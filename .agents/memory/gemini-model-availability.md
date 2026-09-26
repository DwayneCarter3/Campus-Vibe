---
name: Gemini model availability
description: A model can be listed for an API key yet fail when invoked through generateContent.
---

Do not rely solely on Gemini's model listing when selecting a default text model. Make a small generateContent request with the intended API version, model, and key before shipping.

**Why:** In this environment the model listing advertised gemini-2.5-flash with generateContent support, but generation returned HTTP 404 NOT_FOUND. gemini-3-flash-preview generated a response with the same key and API version. A listed model can still fail at runtime.

**How to apply:** When changing the chat model or provider, check a real generation call without logging the key or user data; use a confirmed working model or report the provider error explicitly.