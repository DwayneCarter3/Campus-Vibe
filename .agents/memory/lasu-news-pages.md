---
name: LASU official news pages
description: The LASU public news HTML does not contain the story list or article body.
---

LASU's public news listing and article pages load their actual contents from same-site AJAX endpoints. The listing supplies West Africa Time timestamps and relative article links; article content can depend on a same-origin PHP session issued by the public read page.

**Why:** A scraper reading only the browser-facing pages received HTTP 200 but found no articles; this silent success would leave LASU without updates while the other universities worked.

**How to apply:** Verify candidate extraction against the actual official response, follow only allowlisted HTTPS hosts, and keep any public session cookie restricted to LASU's own host.