import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  defaults,
  settingsSchema,
  type Message,
  type Settings,
} from "../shared/model.js";
export class Store {
  db: DatabaseSync;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(join(directory, "mystery-box.sqlite"));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, text TEXT NOT NULL, startsAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL, createdAt INTEGER NOT NULL, cancelled INTEGER NOT NULL DEFAULT 0);`);
    this.db
      .prepare("INSERT OR IGNORE INTO settings VALUES (1, ?)")
      .run(JSON.stringify(defaults));
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
  saveSettings(s: Settings) {
    this.db.prepare("UPDATE settings SET body=? WHERE id=1").run(JSON.stringify(s));
  }
  messages(): Message[] {
    return (
      this.db
        .prepare("SELECT * FROM messages ORDER BY startsAt DESC LIMIT 100")
        .all() as unknown as Message[]
    )
      .map((m) => ({ ...m, cancelled: Boolean(m.cancelled) }))
      .reverse();
  }
  enqueue(text: string, duration: number, now = Date.now()): Message {
    const pending = this.messages().filter((m) => !m.cancelled && m.expiresAt > now);
    if (pending.length >= 20)
      throw new Error("Queue is full (20 messages). Cancel a message first.");
    const startsAt = Math.max(now, ...pending.map((m) => m.expiresAt));
    const m = {
      id: randomUUID(),
      text,
      startsAt,
      expiresAt: startsAt + duration * 1000,
      createdAt: now,
      cancelled: false,
    };
    this.db
      .prepare("INSERT INTO messages VALUES (?,?,?,?,?,0)")
      .run(m.id, m.text, m.startsAt, m.expiresAt, m.createdAt);
    this.db
      .prepare(
        "DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY createdAt DESC LIMIT 100)",
      )
      .run();
    return m;
  }
  cancel(id: string): boolean {
    return (
      this.db
        .prepare("UPDATE messages SET cancelled=1 WHERE id=? AND cancelled=0")
        .run(id).changes > 0
    );
  }
  close() {
    this.db.close();
  }
}
