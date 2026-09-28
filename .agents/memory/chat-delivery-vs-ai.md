---
name: Chat delivery vs AI reply
description: How to handle WAZOBIA provider failure without losing outgoing messages.
---

Persist and acknowledge a student's outgoing chat message independently of WAZOBIA's AI reply. A provider failure should show a distinct "message sent, reply unavailable" state, not "message not sent"; never invent a bot reply.

**Why:** The configured Gemini provider returned RESOURCE_EXHAUSTED while valid signed-in students were messaging the bot. The old flow generated before inserting, so a provider quota error discarded the outgoing message and appeared to be a chat delivery failure.

**How to apply:** For changes to the bot messaging flow, keep database insertion and delivery separate from external generation, and ensure any failure after persistence cannot tell the client the outgoing message failed.