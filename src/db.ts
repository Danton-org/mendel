import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type MediaType = "image" | "video" | "audio" | "document";

export type InteractivePayload =
  | {
      type: "buttons";
      title?: string;
      description?: string;
      footer?: string;
      buttons: Array<{ id: string; text: string }>;
    }
  | {
      type: "list";
      title?: string;
      description?: string;
      footer?: string;
      buttonText?: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }
  | {
      type: "poll";
      question: string;
      selectableCount: number;
      options: string[];
    };

export interface MendelSettings {
  webhookUrl: string;
  instanceName: string;
  apiKey: string;
  senderNumber: string;
  pushName: string;
}

export interface ChatMessage {
  id: string;
  instance: string;
  remoteJid: string;
  direction: "outgoing" | "incoming";
  text: string | null;
  mediaType: MediaType | null;
  mediaMimetype: string | null;
  mediaFilename: string | null;
  mediaUrl: string | null;
  hasMediaBlob: boolean;
  interactive: InteractivePayload | null;
  webhookStatus: "pending" | "delivered" | "failed" | null;
  webhookError: string | null;
  edited: boolean;
  timestamp: number;
  createdAt: number;
}

export interface InsertMessageInput {
  id?: string;
  instance: string;
  remoteJid: string;
  direction: "outgoing" | "incoming";
  text?: string | null;
  mediaType?: MediaType | null;
  mediaMimetype?: string | null;
  mediaFilename?: string | null;
  mediaData?: Uint8Array | null;
  mediaUrl?: string | null;
  interactive?: InteractivePayload | null;
  webhookStatus?: "pending" | "delivered" | "failed" | null;
  webhookError?: string | null;
  timestamp?: number;
}

interface RawMessageRow {
  id: string;
  instance: string;
  remote_jid: string;
  direction: "outgoing" | "incoming";
  text: string | null;
  media_type: MediaType | null;
  media_mimetype: string | null;
  media_filename: string | null;
  media_url: string | null;
  has_media_blob: number;
  interactive_json: string | null;
  webhook_status: "pending" | "delivered" | "failed" | null;
  webhook_error: string | null;
  edited: number;
  timestamp: number;
  created_at: number;
}

export function formatJid(numberOrJid: string): string {
  const clean = numberOrJid.trim();
  if (!clean) return "5511999999999@s.whatsapp.net";
  if (clean.includes("@")) return clean;
  const digits = clean.replace(/[^\d]/g, "") || clean;
  return `${digits}@s.whatsapp.net`;
}

export class MendelStore {
  private db: Database;

  constructor(dbPath?: string) {
    const resolvedPath =
      dbPath ?? Bun.env.DATABASE_PATH ?? "./mendel.sqlite";
    if (resolvedPath !== ":memory:") {
      mkdirSync(dirname(resolve(resolvedPath)), { recursive: true });
    }
    this.db = new Database(resolvedPath, { create: true });
    this.db.run("PRAGMA journal_mode = WAL;");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        instance TEXT NOT NULL,
        remote_jid TEXT NOT NULL,
        direction TEXT NOT NULL,
        text TEXT,
        media_type TEXT,
        media_mimetype TEXT,
        media_filename TEXT,
        media_data BLOB,
        media_url TEXT,
        interactive_json TEXT,
        webhook_status TEXT,
        webhook_error TEXT,
        edited INTEGER NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_messages_created_at
      ON messages(created_at ASC);
    `);

    const envWebhook =
      Bun.env.WEBHOOK_URL ?? Bun.env.WEBHOOK_GLOBAL_URL;
    const envInstance =
      Bun.env.EVOLUTION_INSTANCE ?? Bun.env.INSTANCE_NAME;
    const envApiKey =
      Bun.env.EVOLUTION_API_KEY ??
      Bun.env.AUTHENTICATION_API_KEY ??
      Bun.env.API_KEY;
    const envSender = Bun.env.SENDER_NUMBER;
    const envPushName = Bun.env.PUSH_NAME;

    const defaults: Record<string, string> = {
      webhook_url: envWebhook ?? "http://localhost:8000/whatsapp",
      instance_name: envInstance ?? "dietia",
      api_key: envApiKey ?? "",
      sender_number: envSender ?? "5511999999999",
      push_name: envPushName ?? "Test User",
    };

    const insertIgnore = this.db.prepare(
      "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
    );
    for (const [k, v] of Object.entries(defaults)) {
      insertIgnore.run(k, v);
    }

    const upsert = this.db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    );
    if (envWebhook !== undefined) upsert.run("webhook_url", envWebhook);
    if (envInstance !== undefined) upsert.run("instance_name", envInstance);
    if (envApiKey !== undefined) upsert.run("api_key", envApiKey);
    if (envSender !== undefined) upsert.run("sender_number", envSender);
    if (envPushName !== undefined) upsert.run("push_name", envPushName);
  }

  getSettings(): MendelSettings {
    const rows = this.db
      .query<{ key: string; value: string }, []>(
        "SELECT key, value FROM settings"
      )
      .all();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      webhookUrl: map.get("webhook_url") ?? "http://localhost:8000/whatsapp",
      instanceName: map.get("instance_name") ?? "dietia",
      apiKey: map.get("api_key") ?? "",
      senderNumber: map.get("sender_number") ?? "5511999999999",
      pushName: map.get("push_name") ?? "Test User",
    };
  }

  updateSettings(partial: Partial<MendelSettings>): MendelSettings {
    const upsert = this.db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    );
    if (partial.webhookUrl !== undefined) {
      upsert.run("webhook_url", partial.webhookUrl.trim());
    }
    if (partial.instanceName !== undefined) {
      upsert.run("instance_name", partial.instanceName.trim() || "dietia");
    }
    if (partial.apiKey !== undefined) {
      upsert.run("api_key", partial.apiKey.trim());
    }
    if (partial.senderNumber !== undefined) {
      upsert.run(
        "sender_number",
        partial.senderNumber.replace(/[^\d]/g, "") || "5511999999999"
      );
    }
    if (partial.pushName !== undefined) {
      upsert.run("push_name", partial.pushName.trim() || "Test User");
    }
    return this.getSettings();
  }

  private mapRow(row: RawMessageRow): ChatMessage {
    let interactive: InteractivePayload | null = null;
    if (row.interactive_json) {
      try {
        interactive = JSON.parse(row.interactive_json) as InteractivePayload;
      } catch {
        interactive = null;
      }
    }
    return {
      id: row.id,
      instance: row.instance,
      remoteJid: row.remote_jid,
      direction: row.direction,
      text: row.text,
      mediaType: row.media_type,
      mediaMimetype: row.media_mimetype,
      mediaFilename: row.media_filename,
      mediaUrl: row.media_url,
      hasMediaBlob: Boolean(row.has_media_blob),
      interactive,
      webhookStatus: row.webhook_status,
      webhookError: row.webhook_error,
      edited: Boolean(row.edited),
      timestamp: row.timestamp,
      createdAt: row.created_at,
    };
  }

  listMessages(): ChatMessage[] {
    const rows = this.db
      .query<RawMessageRow, []>(
        `SELECT
          id, instance, remote_jid, direction, text,
          media_type, media_mimetype, media_filename, media_url,
          CASE WHEN media_data IS NOT NULL THEN 1 ELSE 0 END AS has_media_blob,
          interactive_json, webhook_status, webhook_error,
          edited, timestamp, created_at
        FROM messages
        ORDER BY created_at ASC, rowid ASC`
      )
      .all();
    return rows.map((r) => this.mapRow(r));
  }

  getMessage(id: string): ChatMessage | null {
    const row = this.db
      .query<RawMessageRow, [string]>(
        `SELECT
          id, instance, remote_jid, direction, text,
          media_type, media_mimetype, media_filename, media_url,
          CASE WHEN media_data IS NOT NULL THEN 1 ELSE 0 END AS has_media_blob,
          interactive_json, webhook_status, webhook_error,
          edited, timestamp, created_at
        FROM messages
        WHERE id = ?`
      )
      .get(id);
    return row ? this.mapRow(row) : null;
  }

  getMessageMedia(id: string): {
    data: Uint8Array | null;
    mimetype: string;
    filename: string | null;
    mediaUrl: string | null;
  } | null {
    const row = this.db
      .query<
        {
          media_data: Uint8Array | null;
          media_mimetype: string | null;
          media_filename: string | null;
          media_url: string | null;
        },
        [string]
      >(
        `SELECT media_data, media_mimetype, media_filename, media_url
         FROM messages
         WHERE id = ?`
      )
      .get(id);
    if (!row) return null;
    return {
      data: row.media_data,
      mimetype: row.media_mimetype ?? "application/octet-stream",
      filename: row.media_filename,
      mediaUrl: row.media_url,
    };
  }

  insertMessage(input: InsertMessageInput): ChatMessage {
    const id = input.id || Bun.randomUUIDv7();
    const nowMs = Date.now();
    const timestamp = input.timestamp ?? Math.floor(nowMs / 1000);
    const interactiveJson = input.interactive
      ? JSON.stringify(input.interactive)
      : null;

    this.db
      .prepare(
        `INSERT OR REPLACE INTO messages (
          id, instance, remote_jid, direction, text,
          media_type, media_mimetype, media_filename, media_data, media_url,
          interactive_json, webhook_status, webhook_error,
          edited, timestamp, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .run(
        id,
        input.instance,
        formatJid(input.remoteJid),
        input.direction,
        input.text ?? null,
        input.mediaType ?? null,
        input.mediaMimetype ?? null,
        input.mediaFilename ?? null,
        input.mediaData ?? null,
        input.mediaUrl ?? null,
        interactiveJson,
        input.webhookStatus ?? null,
        input.webhookError ?? null,
        timestamp,
        nowMs
      );

    return this.getMessage(id)!;
  }

  updateMessageText(
    id: string,
    text: string,
    fallback?: { instance: string; remoteJid: string }
  ): ChatMessage {
    const existing = this.getMessage(id);
    if (existing) {
      this.db
        .prepare("UPDATE messages SET text = ?, edited = 1 WHERE id = ?")
        .run(text, id);
      return this.getMessage(id)!;
    }
    return this.insertMessage({
      id,
      instance: fallback?.instance ?? this.getSettings().instanceName,
      remoteJid:
        fallback?.remoteJid ?? formatJid(this.getSettings().senderNumber),
      direction: "incoming",
      text,
    });
  }

  updateWebhookStatus(
    id: string,
    status: "pending" | "delivered" | "failed",
    error: string | null = null
  ): void {
    this.db
      .prepare(
        "UPDATE messages SET webhook_status = ?, webhook_error = ? WHERE id = ?"
      )
      .run(status, error, id);
  }

  clearMessages(): void {
    this.db.run("DELETE FROM messages");
  }

  close(): void {
    this.db.close();
  }
}
