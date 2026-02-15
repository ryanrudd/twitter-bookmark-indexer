import { createClient, type Client } from "@libsql/client";
import { join } from "path";

let db: Client | null = null;

export function getDb(): Client {
  if (!db) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (url && authToken) {
      // Remote Turso database with sync
      db = createClient({
        url,
        authToken,
      });
    } else {
      // Local SQLite file
      db = createClient({
        url: "file:bookmarks.db",
      });
    }
  }
  return db;
}

export async function initDb(): Promise<void> {
  const client = getDb();
  const schemaPath = join(import.meta.dir, "schema.sql");
  const schemaFile = Bun.file(schemaPath);
  const schema = await schemaFile.text();

  // Split schema into individual statements and execute
  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    try {
      await client.execute(statement);
    } catch (e) {
      // Ignore errors for CREATE TABLE IF NOT EXISTS and similar
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("already exists")) {
        console.error("Schema error:", msg);
      }
    }
  }

  // Run migrations for existing databases
  await runMigrations(client);
}

async function runMigrations(client: Client): Promise<void> {
  // Add embedding column if it doesn't exist
  try {
    await client.execute(
      "ALTER TABLE bookmarks ADD COLUMN embedding TEXT"
    );
  } catch {
    // Column already exists
  }

  // Add cluster_id column if it doesn't exist
  try {
    await client.execute(
      "ALTER TABLE bookmarks ADD COLUMN cluster_id INTEGER"
    );
  } catch {
    // Column already exists
  }
}

export async function closeDb(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
}
