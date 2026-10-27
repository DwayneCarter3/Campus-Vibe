import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import cookieParser from "cookie-parser";
import { supabaseMiddleware } from "./middlewares/auth";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const permitted = [process.env.APP_URL, process.env.REPLIT_DEV_DOMAIN && `https://${process.env.REPLIT_DEV_DOMAIN}`,
      process.env.REPLIT_EXPO_DEV_DOMAIN && `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`];
    callback(null, permitted.includes(origin));
  },
}));
app.use(cookieParser());
app.use(
  express.json({
    verify(req, _res, buffer) {
      (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

// Retire legacy EventSource clients without authentication/database work.
// HTTP 204 tells EventSource not to reconnect. This endpoint returns no data;
// notification data and mutations remain behind requireAuth.
app.get("/api/notifications/stream", (_req, res) => {
  res.status(204).end();
});

app.use(supabaseMiddleware);

app.use("/api", router);

export default app;
