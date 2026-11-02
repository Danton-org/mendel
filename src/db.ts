/**
 * SQLite persistence layer for `mendel` backed by `bun:sqlite`.
 *
 * Manages instance/webhook settings, chat message records, and binary media
 * attachments.
 *
 * @packageDocumentation
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Supported media attachment categories for Evolution API messages.
 */
export type MediaType = "image" | "video" | "audio" | "document";

/**
 * Interactive message metadata rendered as clickable controls in the chat UI.
 */
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

/**
 * Runtime configuration for webhook dispatch and simulated Evolution API identity.
 */
export interface MendelSettings {
  /** Target URL where `messages.upsert` webhooks are sent via HTTP POST. */
  webhookUrl: string;
  /** Default Evolution API instance name reported in webhook payloads. */
  instanceName: string;
  /** API key included in `apikey` and `x-api-key` webhook headers. */
  apiKey: string;
  /** Simulated WhatsApp phone number of the user sending messages in the UI. */
  senderNumber: string;
  /** Simulated WhatsApp display name (`pushName`) of the user. */
  pushName: string;
}

/**
 * Normalized chat message entity returned by {@link MendelStore}.
 */
export interface ChatMessage {
  /** Unique message identifier (`key.id`). */
  id: string;
  /** Evolution API instance name associated with the message. */
  instance: string;
  /** WhatsApp remote JID (`<number>@s.whatsapp.net`). */
  remoteJid: string;
  /** Message direction: `"outgoing"` from UI user, `"incoming"` from service. */
  direction: "outgoing" | "incoming";
  /** Plain text body or media caption. */
  text: string | null;
  /** Media attachment category, if any. */
  mediaType: MediaType | null;
  /** MIME type of the attached media. */
  mediaMimetype: string | null;
  /** Original filename of the attached media. */
  mediaFilename: string | null;
  /** External media URL when bytes are not stored inline. */
  mediaUrl: string | null;
  /** Whether raw binary media data is stored in SQLite for this message. */
  hasMediaBlob: boolean;
  /** Optional interactive buttons, list rows, or poll options. */
  interactive: InteractivePayload | null;
  /** Delivery status of the outbound webhook for `"outgoing"` messages. */
  webhookStatus: "pending" | "delivered" | "failed" | null;
  /** Error description when `webhookStatus` is `"failed"`. */
  webhookError: string | null;
  /** Whether the message text was subsequently edited via `updateMessage`. */
  edited: boolean;
  /** Message timestamp in Unix epoch seconds. */
  timestamp: number;
  /** Creation timestamp in Unix epoch milliseconds. */
  createdAt: number;
}

/**
 * Parameters for inserting a new message into {@link MendelStore}.
 */
export interface InsertMessageInput {
  /** Optional explicit message ID; defaults to `Bun.randomUUIDv7()`. */
  id?: string;
  /** Evolution API instance name. */
  instance: string;
  /** Phone number or WhatsApp JID of the participant. */
  remoteJid: string;
  /** Message direction (`"outgoing"` from UI, `"incoming"` from API). */
  direction: "outgoing" | "incoming";
  /** Text content or media caption. */
  text?: string | null;
  /** Media category when the message includes an attachment. */
  mediaType?: MediaType | null;
  /** MIME type of the media attachment. */
  mediaMimetype?: string | null;
  /** Filename of the media attachment. */
  mediaFilename?: string | null;
  /** Raw binary bytes of the media attachment. */
  mediaData?: Uint8Array | null;
  /** External URL of the media attachment. */
  mediaUrl?: string | null;
  /** Optional interactive controls (buttons, list, or poll). */
  interactive?: InteractivePayload | null;
  /** Initial webhook delivery status. */
  webhookStatus?: "pending" | "delivered" | "failed" | null;
  /** Initial webhook delivery error message. */
  webhookError?: string | null;
  /** Explicit Unix timestamp in seconds. */
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

/**
 * Normalizes a phone number or JID string into a canonical WhatsApp JID.
 *
 * @param numberOrJid - Raw phone number or JID string.
 * @returns Canonical WhatsApp JID (e.g. `"5511999999999@s.whatsapp.net"`).
 */
export function formatJid(numberOrJid: string): string {
  const clean = numberOrJid.trim();
  if (!clean) return "5511999999999@s.whatsapp.net";
  if (clean.includes("@")) return clean;
  const digits = clean.replace(/[^\d]/g, "") || clean;
  return `${digits}@s.whatsapp.net`;
}

/**
 * SQLite storage engine managing settings, messages, and media blobs.
 */
export class MendelStore {
  private db: Database;

  /**
   * Opens or creates the SQLite database and initializes the schema.
   *
   * @param dbPath - Path to the SQLite database file, or `":memory:"`.
   */
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

  /**
   * Creates database tables and seeds initial settings from environment variables.
   */
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
      instance_name: envInstance ?? "default",
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

  /**
   * Retrieves the current webhook and instance configuration.
   *
   * @returns Current {@link MendelSettings}.
   */
  getSettings(): MendelSettings {
    const rows = this.db
      .query<{ key: string; value: string }, []>(
        "SELECT key, value FROM settings"
      )
      .all();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      webhookUrl: map.get("webhook_url") ?? "http://localhost:8000/whatsapp",
      instanceName: map.get("instance_name") ?? "default",
      apiKey: map.get("api_key") ?? "",
      senderNumber: map.get("sender_number") ?? "5511999999999",
      pushName: map.get("push_name") ?? "Test User",
    };
  }

  /**
   * Updates one or more configuration fields in SQLite.
   *
   * @param partial - Subset of settings to update.
   * @returns Updated {@link MendelSettings}.
   */
  updateSettings(partial: Partial<MendelSettings>): MendelSettings {
    const upsert = this.db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    );
    if (partial.webhookUrl !== undefined) {
      upsert.run("webhook_url", partial.webhookUrl.trim());
    }
    if (partial.instanceName !== undefined) {
      upsert.run("instance_name", partial.instanceName.trim() || "default");
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

  /**
   * Converts a raw SQLite row into a typed {@link ChatMessage}.
   *
   * @param row - Raw database row.
   * @returns Mapped {@link ChatMessage}.
   */
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

  /**
   * Lists all stored chat messages ordered chronologically.
   *
   * @returns Array of {@link ChatMessage} objects.
   */
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

  /**
   * Retrieves a single message by ID without loading its binary media blob.
   *
   * @param id - Message identifier.
   * @returns Matching {@link ChatMessage}, or `null` if not found.
   */
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

  /**
   * Retrieves the binary media payload and metadata for a message.
   *
   * @param id - Message identifier.
   * @returns Media bytes, MIME type, filename, and external URL, or `null` if not found.
   */
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

  /**
   * Returns a strictly increasing `created_at` millisecond timestamp so that
   * newly inserted or edited messages always sort after prior messages.
   *
   * @param nowMs - Current Unix epoch time in milliseconds.
   * @returns Monotonic `created_at` value in milliseconds.
   */
  private nextCreatedAt(nowMs: number): number {
    const row = this.db
      .query<{ max_created: number | null }, []>(
        "SELECT MAX(created_at) AS max_created FROM messages"
      )
      .get();
    return Math.max(nowMs, (row?.max_created ?? 0) + 1);
  }

  /**
   * Inserts a new message record into SQLite.
   *
   * @param input - Message fields and optional binary media data.
   * @returns Stored {@link ChatMessage}.
   */
  insertMessage(input: InsertMessageInput): ChatMessage {
    const id = input.id || Bun.randomUUIDv7();
    const nowMs = Date.now();
    const createdAt = this.nextCreatedAt(nowMs);
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
        createdAt
      );

    return this.getMessage(id)!;
  }

  /**
   * Updates the text of an existing message, refreshes its timestamp so it
   * sorts after newer messages, and marks it as edited, or inserts a new
   * incoming message if the target ID does not exist.
   *
   * @param id - Target message ID to edit.
   * @param text - Replacement message text.
   * @param fallback - Fallback instance and JID used if inserting a new record.
   * @returns Updated or inserted {@link ChatMessage}.
   */
  updateMessageText(
    id: string,
    text: string,
    fallback?: { instance: string; remoteJid: string }
  ): ChatMessage {
    const existing = this.getMessage(id);
    if (existing) {
      const nowMs = Date.now();
      const createdAt = this.nextCreatedAt(nowMs);
      const timestamp = Math.floor(nowMs / 1000);
      this.db
        .prepare(
          "UPDATE messages SET text = ?, edited = 1, timestamp = ?, created_at = ? WHERE id = ?"
        )
        .run(text, timestamp, createdAt, id);
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

  /**
   * Updates the outbound webhook delivery status and error message for a message.
   *
   * @param id - Message identifier.
   * @param status - New delivery status (`"pending"`, `"delivered"`, or `"failed"`).
   * @param error - Optional error message when delivery fails.
   */
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

  /**
   * Deletes all stored messages from SQLite.
   */
  clearMessages(): void {
    this.db.run("DELETE FROM messages");
  }

  /**
   * Closes the underlying SQLite database connection.
   */
  close(): void {
    this.db.close();
  }
}
