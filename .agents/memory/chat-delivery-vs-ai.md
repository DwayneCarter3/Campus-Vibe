---
name: Chat delivery vs AI reply
description: How to handle WAZOBIA provider failure without losing outgoing messages.
---

Persist and acknowledge a student's outgoing chat message independently of WAZOBIA's AI reply. A provider failure must never show "message not sent." If quota retries fail, a clearly prewritten, localized WAZOBIA fallback may be saved and displayed as a bot message; it is not a generated answer and must be excluded from later AI context. For other failures, show a distinct "message sent, reply unavailable" state. Never fabricate a substantive AI answer.

**Why:** The configured Gemini provider returned RESOURCE_EXHAUSTED while valid signed-in students were messaging the bot. The old flow generated before inserting, so a provider quota error discarded the outgoing message and appeared to be a chat delivery failure. The user subsequently requested bounded quota retries and a friendly chat fallback rather than silence.

**How to apply:** For changes to the bot messaging flow, keep database insertion and delivery separate from external generation. Do not feed prewritten failure messages back into the AI prompt as if they were answers.