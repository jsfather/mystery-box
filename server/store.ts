import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import {
  defaults,
  settingsSchema,
  type Message,
  type Settings,
  type User,
  type ActivityEntry,
} from "../shared/model.js";
import { hashPassword, checkPassword } from "./passwords.js";
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export class Store {
  db: DatabaseSync;
  private readonly dummyHash = hashPassword(randomUUID());
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(join(directory, "mystery-box.sqlite"));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,text TEXT NOT NULL,startsAt INTEGER NOT NULL,expiresAt INTEGER NOT NULL,createdAt INTEGER NOT NULL,cancelled INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE COLLATE NOCASE,name TEXT NOT NULL,passwordHash TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,createdAt INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS sessions(tokenHash TEXT PRIMARY KEY,userId TEXT NOT NULL,expiresAt INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expiresAt);
   CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY AUTOINCREMENT,createdAt INTEGER NOT NULL,actorId TEXT,actorName TEXT NOT NULL,action TEXT NOT NULL,details TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value INTEGER NOT NULL);
   INSERT OR IGNORE INTO metadata VALUES('settingsRevision',0);`);
    const columns = this.db
      .prepare("PRAGMA table_info(messages)")
      .all()
      .map((c) => c.name);
    if (!columns.includes("authorId"))
      this.db.exec("ALTER TABLE messages ADD COLUMN authorId TEXT");
    if (!columns.includes("authorName"))
      this.db.exec(
        "ALTER TABLE messages ADD COLUMN authorName TEXT NOT NULL DEFAULT 'Before accounts'",
      );
    this.db
      .prepare("INSERT OR IGNORE INTO settings VALUES(1,?)")
      .run(JSON.stringify(defaults));
  }
  atomic<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  settings(): Settings {
    return settingsSchema.parse(
      JSON.parse(
        (
          this.db.prepare("SELECT body FROM settings WHERE id=1").get() as {
            body: string;
          }
        ).body,
      ),
    );
  }
  revision(): number {
    return Number(
      this.db.prepare("SELECT value FROM metadata WHERE key='settingsRevision'").get()!
        .value,
    );
  }
  saveSettings(settings: Settings, actor?: User, expected?: number) {
    return this.atomic(() => {
      if (expected !== undefined && expected !== this.revision())
        throw new Error(
          "Settings changed on another device. Reload this page before saving your changes.",
        );
      const previous = this.settings();
      this.db
        .prepare("UPDATE settings SET body=? WHERE id=1")
        .run(JSON.stringify(settings));
      this.db.exec("UPDATE metadata SET value=value+1 WHERE key='settingsRevision'");
      if (actor)
        this.audit(actor, "settings.updated", {
          fields: Object.keys(settings).filter(
            (k) =>
              JSON.stringify(settings[k as keyof Settings]) !==
              JSON.stringify(previous[k as keyof Settings]),
          ),
        });
      return this.revision();
    });
  }
  mapMessages(rows: unknown[]): Message[] {
    return (rows as Message[]).map((m) => ({ ...m, cancelled: Boolean(m.cancelled) }));
  }
  messages(): Message[] {
    return this.mapMessages(
      this.db
        .prepare("SELECT rowid AS cursor,* FROM messages ORDER BY rowid DESC LIMIT 100")
        .all(),
    ).reverse();
  }
  history(before = Number.MAX_SAFE_INTEGER, q = "") {
    const escaped = q.replace(/[\\%_]/g, (c) => "\\" + c);
    const items = this.mapMessages(
      this.db
        .prepare(
          "SELECT rowid AS cursor,* FROM messages WHERE rowid < ? AND text LIKE ? ESCAPE '\\' ORDER BY rowid DESC LIMIT 51",
        )
        .all(before, `%${escaped}%`),
    );
    return {
      items: items.slice(0, 50),
      nextCursor: items.length > 50 ? items[49].cursor : null,
    };
  }
  enqueue(text: string, duration: number, now = Date.now(), actor?: User): Message {
    return this.atomic(() => {
      const pending = this.db
        .prepare("SELECT expiresAt FROM messages WHERE cancelled=0 AND expiresAt>?")
        .all(now);
      if (pending.length >= 20)
        throw new Error("Queue is full (20 messages). Cancel a message first.");
      const startsAt = Math.max(now, ...pending.map((m) => Number(m.expiresAt))),
        id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO messages(id,text,startsAt,expiresAt,createdAt,cancelled,authorId,authorName) VALUES(?,?,?,?,?,0,?,?)",
        )
        .run(
          id,
          text,
          startsAt,
          startsAt + duration * 1000,
          now,
          actor?.id ?? null,
          actor?.name ?? "System",
        );
      if (actor) this.audit(actor, "message.sent", { messageId: id, duration });
      return this.message(id)!;
    });
  }
  message(id: string): Message | undefined {
    const row = this.db
      .prepare("SELECT rowid AS cursor,* FROM messages WHERE id=?")
      .get(id);
    return row ? this.mapMessages([row])[0] : undefined;
  }
  cancel(id: string, actor?: User): boolean {
    return this.atomic(() => {
      const changed =
        this.db
          .prepare("UPDATE messages SET cancelled=1 WHERE id=? AND cancelled=0")
          .run(id).changes > 0;
      if (changed && actor) this.audit(actor, "message.cancelled", { messageId: id });
      return changed;
    });
  }
  users(): User[] {
    return this.db
      .prepare(
        "SELECT id,username,name,enabled,createdAt FROM users ORDER BY createdAt,rowid",
      )
      .all()
      .map((u) => ({ ...u, enabled: !!u.enabled })) as unknown as User[];
  }
  user(id: string) {
    return this.users().find((u) => u.id === id);
  }
  createUser(username: string, name: string, password: string, actor?: User): User {
    return this.atomic(() => {
      if (this.users().length >= 20)
        throw new Error("This private space supports up to 20 accounts");
      if (
        this.db
          .prepare("SELECT id FROM users WHERE username=? COLLATE NOCASE")
          .get(username)
      )
        throw new Error("That username is already taken");
      const id = randomUUID();
      this.db
        .prepare("INSERT INTO users VALUES(?,?,?,?,1,?)")
        .run(id, username, name, hashPassword(password), Date.now());
      const created = this.user(id)!;
      this.audit(actor ?? created, actor ? "user.created" : "user.bootstrapped", {
        userId: id,
        username,
      });
      return created;
    });
  }
  verifyUser(username: string, password: string): User | undefined {
    const row = this.db
      .prepare(
        "SELECT id,passwordHash,enabled FROM users WHERE username=? COLLATE NOCASE",
      )
      .get(username);
    const matches = checkPassword(
      password,
      row ? String(row.passwordHash) : this.dummyHash,
    );
    if (!matches || !row?.enabled) return undefined;
    return this.user(String(row.id));
  }
  updateUser(
    id: string,
    changes: {
      username?: string;
      name?: string;
      enabled?: boolean;
      password?: string;
      currentPassword?: string;
    },
    actor: User,
  ): User {
    return this.atomic(() => {
      const target = this.user(id);
      if (!target) throw new Error("Account not found");
      if (changes.enabled === false && id === actor.id)
        throw new Error("You cannot disable the account you are using");
      if (
        changes.enabled === false &&
        target.enabled &&
        this.users().filter((u) => u.enabled).length <= 1
      )
        throw new Error("Keep at least one active account");
      if (
        changes.password &&
        id === actor.id &&
        !this.verifyUser(target.username, changes.currentPassword ?? "")
      )
        throw new Error("Enter your current password to change it");
      const username = changes.username ?? target.username;
      if (
        this.users().some(
          (u) => u.id !== id && u.username.toLowerCase() === username.toLowerCase(),
        )
      )
        throw new Error("That username is already taken");
      const hash = changes.password
        ? hashPassword(changes.password)
        : String(
            this.db.prepare("SELECT passwordHash FROM users WHERE id=?").get(id)!
              .passwordHash,
          );
      this.db
        .prepare("UPDATE users SET username=?,name=?,enabled=?,passwordHash=? WHERE id=?")
        .run(
          username,
          changes.name ?? target.name,
          Number(changes.enabled ?? target.enabled),
          hash,
          id,
        );
      if (changes.password || changes.enabled === false)
        this.db.prepare("DELETE FROM sessions WHERE userId=?").run(id);
      this.audit(actor, "user.updated", {
        userId: id,
        fields: Object.keys(changes).filter(
          (k) => k !== "password" && k !== "currentPassword",
        ),
        passwordChanged: !!changes.password,
      });
      return this.user(id)!;
    });
  }
  createSession(token: string, user: User, expiresAt: number) {
    this.db.prepare("DELETE FROM sessions WHERE expiresAt<=?").run(Date.now());
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(digest(token), user.id, expiresAt);
  }
  sessionUser(token: string): User | undefined {
    if (!token) return undefined;
    const row = this.db
      .prepare("SELECT userId FROM sessions WHERE tokenHash=? AND expiresAt>?")
      .get(digest(token), Date.now());
    const user = row ? this.user(String(row.userId)) : undefined;
    return user?.enabled ? user : undefined;
  }
  revokeSession(token: string) {
    this.db.prepare("DELETE FROM sessions WHERE tokenHash=?").run(digest(token));
  }
  audit(
    actor: Pick<User, "id" | "name"> | null,
    action: string,
    details: Record<string, unknown> = {},
  ) {
    this.db
      .prepare(
        "INSERT INTO activity(createdAt,actorId,actorName,action,details) VALUES(?,?,?,?,?)",
      )
      .run(
        Date.now(),
        actor?.id ?? null,
        actor?.name ?? "System",
        action,
        JSON.stringify(details),
      );
  }
  activity(before = Number.MAX_SAFE_INTEGER) {
    const rows = this.db
      .prepare("SELECT * FROM activity WHERE id<? ORDER BY id DESC LIMIT 51")
      .all(before);
    return {
      items: rows.slice(0, 50).map((row) => ({
        ...row,
        details: JSON.parse(String(row.details)),
      })) as unknown as ActivityEntry[],
      nextCursor: rows.length > 50 ? Number(rows[49].id) : null,
    };
  }
  close() {
    this.db.close();
  }
}
