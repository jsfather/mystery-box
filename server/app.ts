import express, { type RequestHandler } from "express";
import helmet from "helmet";
import { randomBytes } from "node:crypto";
import type { Config } from "./config.js";
import type { Store } from "./store.js";
import {
  messageSchema,
  messageIdsSchema,
  settingsSchema,
  createUserSchema,
  updateUserSchema,
  usernameSchema,
  type Snapshot,
} from "../shared/model.js";
import { snakeRequestSchema, type SnakeRequest } from "../shared/snake.js";
import { GameError } from "./snake.js";
interface Runtime {
  snake?: (request: SnakeRequest, user: { id: string; name: string }) => unknown;
  snapshot: () => Snapshot;
  changed: () => void;
  listen: (fn: () => void) => () => void;
}
export function createApp(config: Config, store: Store, runtime: Runtime) {
  // Bootstrap only an empty database. Environment variables never overwrite a
  // password that either partner has changed through account management.
  if (!store.users().length) {
    store.createUser(config.ADMIN_USERNAME, config.ADMIN_NAME, config.ADMIN_PASSWORD);
    if (config.PARTNER_PASSWORD)
      store.createUser(
        config.PARTNER_USERNAME,
        config.PARTNER_NAME,
        config.PARTNER_PASSWORD,
      );
  }
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
          "worker-src": ["'self'"],
          "upgrade-insecure-requests": config.COOKIE_SECURE === "true" ? [] : null,
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
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== (config.APP_ORIGIN ?? `http://${req.headers.host}`)
    ) {
      res.status(403).json({ error: "Request origin is not allowed" });
      return;
    }
    next();
  });
  const token = (req: express.Request) =>
    (req.headers.cookie ?? "")
      .split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith("mb_session="))
      ?.slice(11) ?? "";
  const current = (req: express.Request) => store.sessionUser(token(req));
  const auth: RequestHandler = (req, res, next) => {
    const user = current(req);
    if (!user) {
      res.status(401).json({ error: "Sign in to continue" });
      return;
    }
    res.locals.user = user;
    next();
  };
  const attempts = new Map<string, { count: number; until: number }>();
  const sweep = setInterval(() => {
    for (const [k, v] of attempts) if (v.until <= Date.now()) attempts.delete(k);
  }, 60000);
  sweep.unref();
  const duration = 30 * 86400000;
  app.get("/api/session", (req, res) => {
    const user = current(req);
    res.json({ authenticated: !!user, user: user ?? null });
  });
  app.post("/api/login", (req, res) => {
    const ip = req.ip ?? "unknown",
      now = Date.now();
    let entry = attempts.get(ip);
    if (!entry || entry.until <= now) {
      if (attempts.size >= 10000) {
        res.status(429).json({ error: "Try again later" });
        return;
      }
      entry = { count: 0, until: now + 15 * 60000 };
      attempts.set(ip, entry);
    }
    if (++entry.count > 10) {
      res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
      return;
    }
    const parsed = usernameSchema.safeParse(req.body?.username),
      password = req.body?.password;
    const user =
      parsed.success && typeof password === "string" && password.length <= 256
        ? store.verifyUser(parsed.data, password)
        : undefined;
    if (!user) {
      store.audit(null, "login.failed", {});
      res.status(401).json({ error: "Incorrect username or password" });
      return;
    }
    attempts.delete(ip);
    const id = randomBytes(32).toString("hex");
    store.createSession(id, user, now + duration);
    store.audit(user, "login.succeeded");
    res
      .cookie("mb_session", id, {
        httpOnly: true,
        secure: config.COOKIE_SECURE === "true",
        sameSite: "strict",
        maxAge: duration,
        path: "/api",
      })
      .json({ ok: true, user });
  });
  app.post("/api/logout", auth, (req, res) => {
    store.revokeSession(token(req));
    store.audit(res.locals.user, "logout");
    res
      .clearCookie("mb_session", {
        path: "/api",
        httpOnly: true,
        secure: config.COOKIE_SECURE === "true",
        sameSite: "strict",
      })
      .json({ ok: true });
  });
  app.post(["/api/games", "/api/snake"], auth, (req, res) => {
    const parsed = snakeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid game command" });
      return;
    }
    if (!runtime.snake) {
      res.status(503).json({ error: "Game controls are unavailable" });
      return;
    }
    try {
      res.json(runtime.snake(parsed.data, res.locals.user));
    } catch (error) {
      if (error instanceof GameError)
        res.status(error.status).json({ error: error.message });
      else throw error;
    }
  });
  app.get("/api/state", auth, (_req, res) => res.json(runtime.snapshot()));
  app.put("/api/settings", auth, (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues.map((i) => i.message).join("; ") });
      return;
    }
    if (parsed.data.love.startAt && Date.parse(parsed.data.love.startAt) > Date.now()) {
      res.status(400).json({ error: "Choose a starting moment in the past" });
      return;
    }
    const expected = req.headers["if-match"];
    if (typeof expected !== "string" || !/^\d+$/.test(expected)) {
      res
        .status(428)
        .json({ error: "Reload the settings before saving (revision required)" });
      return;
    }
    try {
      const revision = store.saveSettings(parsed.data, res.locals.user, Number(expected));
      runtime.changed();
      res.json({ settings: parsed.data, revision });
    } catch (e) {
      res.status(409).json({ error: (e as Error).message });
    }
  });
  app.post("/api/factory-reset", auth, (req, res) => {
    const { password, confirmation, eraseHistory } = req.body ?? {};
    if (
      confirmation !== "RESET" ||
      typeof eraseHistory !== "boolean" ||
      typeof password !== "string" ||
      password.length > 256
    ) {
      res.status(400).json({ error: "Type RESET and enter your password" });
      return;
    }
    const ip = `reset:${req.ip ?? "unknown"}`,
      now = Date.now();
    let attempt = attempts.get(ip);
    if (!attempt || attempt.until <= now) {
      attempt = { count: 0, until: now + 900000 };
      attempts.set(ip, attempt);
    }
    if (++attempt.count > 5) {
      res
        .status(429)
        .json({ error: "Too many reset attempts. Try again in 15 minutes." });
      return;
    }
    if (!store.verifyUser(res.locals.user.username, password)) {
      res.status(403).json({ error: "Incorrect password" });
      return;
    }
    store.factoryReset(res.locals.user, eraseHistory);
    attempts.delete(ip);
    runtime.changed();
    res.json({ ok: true });
  });
  app.post("/api/messages", auth, (req, res) => {
    const m = messageSchema.safeParse(req.body);
    if (!m.success) {
      res.status(400).json({ error: m.error.issues.map((i) => i.message).join("; ") });
      return;
    }
    try {
      const saved = store.enqueue(
        m.data.text,
        m.data.duration ?? store.settings().messaging.defaultDuration,
        Date.now(),
        res.locals.user,
      );
      runtime.changed();
      res.status(201).json(saved);
    } catch (e) {
      res.status(409).json({ error: (e as Error).message });
    }
  });
  const cursor = (req: express.Request) => {
    if (req.query.before === undefined) return Number.MAX_SAFE_INTEGER;
    const value = Number(req.query.before);
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  };
  app.get("/api/messages", auth, (req, res) => {
    const before = cursor(req);
    if (
      before === undefined ||
      typeof (req.query.q ?? "") !== "string" ||
      String(req.query.q ?? "").length > 160
    ) {
      res.status(400).json({ error: "Invalid history filter" });
      return;
    }
    res.json(store.history(before, String(req.query.q ?? "")));
  });
  app.post("/api/messages/lookup", auth, (req, res) => {
    const parsed = messageIdsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Choose 1–100 distinct message IDs" });
      return;
    }
    res.json({ items: store.lookupMessages(parsed.data.ids) });
  });
  app.post("/api/messages/delete", auth, (req, res) => {
    const parsed = messageIdsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Choose 1–100 distinct message IDs" });
      return;
    }
    const result = store.deleteMessages(parsed.data.ids, res.locals.user);
    if (result.deletedIds.length) runtime.changed();
    res.json(result);
  });
  app.post("/api/messages/:id/replay", auth, (req, res) => {
    const message = store.message(String(req.params.id));
    if (!message) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
    try {
      const saved = store.enqueue(
        message.text,
        Math.min(300, Math.max(5, (message.expiresAt - message.startsAt) / 1000)),
        Date.now(),
        res.locals.user,
      );
      runtime.changed();
      res.status(201).json(saved);
    } catch (e) {
      res.status(409).json({ error: (e as Error).message });
    }
  });
  const cancelMessage: RequestHandler = (req, res) => {
    if (!store.cancel(String(req.params.id), res.locals.user)) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
    runtime.changed();
    res.json({ ok: true });
  };
  // Keep DELETE cancellation compatible with older cached clients.
  app.delete("/api/messages/:id", auth, cancelMessage);
  app.post("/api/messages/:id/cancel", auth, cancelMessage);
  app.get("/api/users", auth, (_req, res) => res.json({ items: store.users() }));
  app.post("/api/users", auth, (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues.map((i) => i.message).join("; ") });
      return;
    }
    try {
      const u = parsed.data;
      res
        .status(201)
        .json(store.createUser(u.username, u.name, u.password, res.locals.user));
    } catch (e) {
      res.status(409).json({ error: (e as Error).message });
    }
  });
  app.patch("/api/users/:id", auth, (req, res) => {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues.map((i) => i.message).join("; ") });
      return;
    }
    try {
      res.json(store.updateUser(String(req.params.id), parsed.data, res.locals.user));
    } catch (e) {
      res.status(409).json({ error: (e as Error).message });
    }
  });
  app.get("/api/activity", auth, (req, res) => {
    const before = cursor(req);
    if (before === undefined) {
      res.status(400).json({ error: "Invalid activity cursor" });
      return;
    }
    res.json(store.activity(before));
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
      if (!current(req)) {
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
  app.get("/sw.js", (_req, res) => {
    res.set({ "Cache-Control": "no-cache", "Service-Worker-Allowed": "/" });
    res.sendFile("sw.js", { root: "dist" });
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
