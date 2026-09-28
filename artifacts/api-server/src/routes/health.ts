import { Router } from "express";

const router = Router() as any;

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

export default router;
