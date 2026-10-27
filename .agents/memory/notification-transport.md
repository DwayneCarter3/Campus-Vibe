---
name: Notification transport and latency
description: Why notification delivery must be durable and finite on autoscale.
---

Use database-backed notification snapshots for foreground freshness. Do not reintroduce process-local SSE as the primary delivery mechanism without shared cross-instance fanout and streaming-aware latency monitoring.

**Why:** Long-lived SSE connection lifetimes were counted as slow HTTP requests. Process-local subscribers also cannot reliably receive events created on another server instance.

**How to apply:** Preserve initial-inbox suppression, per-identity alert deduplication, unread counts, and conversation/message query refreshes when changing notification delivery. Retired EventSource endpoints should return terminal 204 responses without exposing notification data.
