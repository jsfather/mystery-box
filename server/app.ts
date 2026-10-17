import express, { type RequestHandler } from "express";
import helmet from "helmet";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Config } from "./config.js";
import type { Store } from "./store.js";
import { messageSchema, settingsSchema, type Snapshot } from "../shared/model.js";
interface Runtime {
  snapshot: () => Snapshot;
  changed: () => void;
  listen: (fn: () => void) => () => void;
}
export function createApp(config: Config, store: Store, runtime: Runtime) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "script-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "connect-src": ["'self'"],
          "img-src": ["'self'", "data:"],
        },
      },
      strictTransportSecurity: config.COOKIE_SECURE === "true" ? undefined : false,
    }),
  );
  app.use(express.json({ limit: "16kb" }));
  app.get("/healthz", (_req, res) => res.json({ ok: true }));
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin) {
      const expected = config.APP_ORIGIN ?? `http://${req.headers.host}`;
      if (req.headers.origin !== expected) {
        res.status(403).json({ error: "Request origin is not allowed" });
        return;
      }
    }
    next();
  });
  const salt = randomBytes(16),
    passwordHash = scryptSync(config.ADMIN_PASSWORD, salt, 64);
  const sessions = new Map<string, number>(),
    attempts = new Map<string, { count: number; until: number }>();
  const token = (req: express.Request) =>
    (req.headers.cookie ?? "")
      .split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith("mb_session="))
      ?.slice(11) ?? "";
  const authenticated = (req: express.Request) =>
    (sessions.get(token(req)) ?? 0) > Date.now();
  const auth: RequestHandler = (req, res, next) => {
    if (!authenticated(req)) {
      res.status(401).json({ error: "Sign in to continue" });
      return;
    }
    next();
  };
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of sessions) if (v <= now) sessions.delete(k);
    for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
  }, 60000);
  sweep.unref();
  app.get("/api/session", (req, res) => res.json({ authenticated: authenticated(req) }));
  app.post("/api/login", (req, res) => {
    const ip = req.ip ?? "unknown",
      now = Date.now();
    let entry = attempts.get(ip);
    if (!entry || entry.until <= now) {
      if (attempts.size >= 10000) {
        res.status(429).json({ error: "Try again later" });
        return;
      }
      entry = { count: 0, until: now + 15 * 60 * 1000 };
      attempts.set(ip, entry);
    }
    if (++entry.count > 10) {
      res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
      return;
    }
    const password = req.body?.password;
    if (
      typeof password !== "string" ||
      password.length > 256 ||
      !timingSafeEqual(scryptSync(password, salt, 64), passwordHash)
    ) {
      res.status(401).json({ error: "Incorrect password" });
      return;
    }
    attempts.delete(ip);
    if (sessions.size >= 1000) {
      res.status(429).json({ error: "Too many sessions" });
      return;
    }
    const id = randomBytes(32).toString("hex");
    sessions.set(id, now + 12 * 3600 * 1000);
    res
      .cookie("mb_session", id, {
        httpOnly: true,
        secure: config.COOKIE_SECURE === "true",
        sameSite: "strict",
        maxAge: 12 * 3600 * 1000,
        path: "/api",
      })
      .json({ ok: true });
  });
  app.post("/api/logout", auth, (req, res) => {
    sessions.delete(token(req));
    res
      .clearCookie("mb_session", {
        path: "/api",
        httpOnly: true,
        secure: config.COOKIE_SECURE === "true",
        sameSite: "strict",
      })
      .json({ ok: true });
  });
  app.get("/api/state", auth, (_req, res) => res.json(runtime.snapshot()));
  app.put("/api/settings", auth, (req, res) => {
    const s = settingsSchema.safeParse(req.body);
    if (!s.success) {
      res.status(400).json({ error: s.error.issues.map((i) => i.message).join("; ") });
      return;
    }
    store.saveSettings(s.data);
    runtime.changed();
    res.json(s.data);
  });
  app.post("/api/messages", auth, (req, res) => {
    const m = messageSchema.safeParse(req.body);
    if (!m.success) {
      res.status(400).json({ error: m.error.issues.map((i) => i.message).join("; ") });
      return;
    }
    try {
      const saved = store.enqueue(m.data.text, m.data.duration);
      runtime.changed();
      res.status(201).json(saved);
    } catch (error) {
      res.status(409).json({ error: (error as Error).message });
    }
  });
  app.delete("/api/messages/:id", auth, (req, res) => {
    if (!store.cancel(String(req.params.id))) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
    runtime.changed();
    res.json({ ok: true });
  });
  let clients = 0;
  app.get("/api/events", auth, (req, res) => {
    if (clients >= 20) {
      res.status(429).json({ error: "Too many live connections" });
      return;
    }
    clients++;
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const send = () => {
      if (!authenticated(req)) {
        res.end();
        return;
      }
      if (res.writableLength < 65536)
        res.write(`data: ${JSON.stringify(runtime.snapshot())}\n\n`);
    };
    const unsubscribe = runtime.listen(send);
    send();
    req.on("close", () => {
      clients--;
      unsubscribe();
    });
  });
  app.use(express.static("dist"));
  app.use("/api", (_req, res) => res.status(404).json({ error: "Unknown endpoint" }));
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status = (error as { status?: number }).status;
      res.status(status === 413 ? 413 : status === 400 ? 400 : 500).json({
        error:
          status === 413
            ? "Request too large"
            : status === 400
              ? "Invalid JSON"
              : "Server error",
      });
    },
  );
  return app;
}
