---
name: Expo Worklets in pnpm
description: Isolated preset resolution and persistent Metro transforms can hide animation Babel fixes.
---

Resolve the Worklets Babel plugin from the Expo app rather than relying on the preset's auto-detection in an isolated pnpm workspace. Ensure Babel configuration changes also invalidate Metro's dependency transforms.

**Why:** The preset could not see the app's animation dependencies from its own package location. An explicit plugin still appeared ineffective because unchanged dependency transforms survived workflow restarts; a fresh cache then loaded the browser app successfully.

**How to apply:** When debugging a Worklets startup failure, inspect both plugin resolution and the transformed startup check in the served bundle. A restart alone is not proof that dependencies were retransformed. Verify browser startup and preserve iOS/Android production exports without downgrading aligned native packages.
