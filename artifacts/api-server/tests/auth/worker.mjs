import express from "express";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import router from "../../src/routes/auth";
import { supabaseMiddleware, requireAuth } from "../../src/middlewares/auth";
import { hasAdminPrivileges, isVerifiedCEO } from "../../src/lib/privilege";
import { logger } from "../../src/lib/logger";
import { pg } from "./worker-db.mjs";

const app = express();
app.use(pinoHttp({
  logger,
  serializers: {
    req(req) { return { method: req.method, url: req.url?.split("?")[0] }; },
    res(res) { return { statusCode: res.statusCode }; },
  },
}));
app.use(express.json(), cookieParser(), supabaseMiddleware);
app.use("/api", router);
app.get("/api/test/ceo", requireAuth, async (req, res) => {
  res.status(await isVerifiedCEO(req) ? 200 : 403).json({ ok: await isVerifiedCEO(req) });
});
app.get("/api/test/admin", requireAuth, async (req, res) => {
  res.status(await hasAdminPrivileges(req) ? 200 : 403).json({});
});
// Return only disposable fixture facts, never credentials.
app.get("/api/test/content", requireAuth, async (req, res) => {
  const { rows } = await pg.query("SELECT body FROM public.test_content WHERE author_id=$1", [req.userId]);
  res.json(rows);
});
const server = app.listen(0, "127.0.0.1", () => {
  process.send({ port: server.address().port });
});
process.on("message", async message => {
  if (message === "stop") {
    await new Promise(resolve => server.close(resolve));
    await pg.close();
    process.exit(0);
  }
});
