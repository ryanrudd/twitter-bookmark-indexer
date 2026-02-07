import { createClient, type Client } from "@libsql/client";

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
  const schemaFile = Bun.file(
    new URL("./schema.sql", import.meta.url).pathname
  );
  const schema = await schemaFile.text();

  // Split schema into individual statements and execute
  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await client.execute(statement);
  }
}

export async function closeDb(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
}
