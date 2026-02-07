import { getDb } from "./client";
import type { Row } from "@libsql/client";

export interface Author {
  id: number;
  twitter_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface Bookmark {
  id: number;
  tweet_id: string;
  author_id: number;
  content: string;
  created_at: string;
  bookmarked_at: string;
  like_count: number;
  retweet_count: number;
  synced_at: string;
}

export interface BookmarkWithAuthor extends Bookmark {
  username: string;
  display_name: string | null;
}

export interface Topic {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Item {
  id: number;
  bookmark_id: number;
  type: "task" | "idea" | "resource";
  title: string;
  description: string | null;
  status: "pending" | "done" | "archived";
  created_at: string;
}

export interface SyncState {
  last_sync_at: string | null;
  pagination_token: string | null;
}

function rowToObject<T>(row: Row): T {
  return row as unknown as T;
}

// Authors
export async function upsertAuthor(author: Omit<Author, "id">): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: `INSERT INTO authors (twitter_id, username, display_name, avatar_url)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(twitter_id) DO UPDATE SET
            username = excluded.username,
            display_name = excluded.display_name,
            avatar_url = excluded.avatar_url
          RETURNING id`,
    args: [author.twitter_id, author.username, author.display_name, author.avatar_url],
  });
  const row = result.rows[0];
  if (!row) throw new Error("Failed to upsert author");
  return row.id as number;
}

export async function getAuthorByTwitterId(twitterId: string): Promise<Author | null> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM authors WHERE twitter_id = ?",
    args: [twitterId],
  });
  const row = result.rows[0];
  return row ? rowToObject<Author>(row) : null;
}

// Bookmarks
export async function upsertBookmark(
  bookmark: Omit<Bookmark, "id">
): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: `INSERT INTO bookmarks (tweet_id, author_id, content, created_at, bookmarked_at, like_count, retweet_count, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tweet_id) DO UPDATE SET
            content = excluded.content,
            like_count = excluded.like_count,
            retweet_count = excluded.retweet_count,
            synced_at = excluded.synced_at
          RETURNING id`,
    args: [
      bookmark.tweet_id,
      bookmark.author_id,
      bookmark.content,
      bookmark.created_at,
      bookmark.bookmarked_at,
      bookmark.like_count,
      bookmark.retweet_count,
      bookmark.synced_at,
    ],
  });
  const row = result.rows[0];
  if (!row) throw new Error("Failed to upsert bookmark");
  return row.id as number;
}

export async function getBookmarks(
  limit = 100,
  offset = 0
): Promise<BookmarkWithAuthor[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT b.*, a.username, a.display_name
          FROM bookmarks b
          LEFT JOIN authors a ON b.author_id = a.id
          ORDER BY b.bookmarked_at DESC
          LIMIT ? OFFSET ?`,
    args: [limit, offset],
  });
  return result.rows.map((row) => rowToObject<BookmarkWithAuthor>(row));
}

export async function getBookmarkById(id: number): Promise<BookmarkWithAuthor | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT b.*, a.username, a.display_name
          FROM bookmarks b
          LEFT JOIN authors a ON b.author_id = a.id
          WHERE b.id = ?`,
    args: [id],
  });
  const row = result.rows[0];
  return row ? rowToObject<BookmarkWithAuthor>(row) : null;
}

export async function searchBookmarks(query: string): Promise<BookmarkWithAuthor[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT b.*, a.username, a.display_name
          FROM bookmarks b
          LEFT JOIN authors a ON b.author_id = a.id
          WHERE b.content LIKE ? OR a.username LIKE ?
          ORDER BY b.bookmarked_at DESC
          LIMIT 100`,
    args: [`%${query}%`, `%${query}%`],
  });
  return result.rows.map((row) => rowToObject<BookmarkWithAuthor>(row));
}

export async function getBookmarkCount(): Promise<number> {
  const db = getDb();
  const result = await db.execute("SELECT COUNT(*) as count FROM bookmarks");
  const row = result.rows[0];
  if (!row) return 0;
  return row.count as number;
}

// Topics
export async function createTopic(
  name: string,
  description?: string
): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: "INSERT INTO topics (name, description) VALUES (?, ?) RETURNING id",
    args: [name, description ?? null],
  });
  const row = result.rows[0];
  if (!row) throw new Error("Failed to create topic");
  return row.id as number;
}

export async function getTopics(): Promise<Topic[]> {
  const db = getDb();
  const result = await db.execute("SELECT * FROM topics ORDER BY name");
  return result.rows.map((row) => rowToObject<Topic>(row));
}

export async function getTopicWithBookmarks(
  topicId: number
): Promise<{ topic: Topic; bookmarks: BookmarkWithAuthor[] } | null> {
  const db = getDb();
  const topicResult = await db.execute({
    sql: "SELECT * FROM topics WHERE id = ?",
    args: [topicId],
  });
  const topicRow = topicResult.rows[0];
  if (!topicRow) return null;

  const bookmarksResult = await db.execute({
    sql: `SELECT b.*, a.username, a.display_name
          FROM bookmarks b
          LEFT JOIN authors a ON b.author_id = a.id
          INNER JOIN bookmark_topics bt ON b.id = bt.bookmark_id
          WHERE bt.topic_id = ?
          ORDER BY bt.confidence DESC`,
    args: [topicId],
  });

  return {
    topic: rowToObject<Topic>(topicRow),
    bookmarks: bookmarksResult.rows.map((row) => rowToObject<BookmarkWithAuthor>(row)),
  };
}

export async function linkBookmarkToTopic(
  bookmarkId: number,
  topicId: number,
  confidence: number
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO bookmark_topics (bookmark_id, topic_id, confidence)
          VALUES (?, ?, ?)
          ON CONFLICT DO UPDATE SET confidence = excluded.confidence`,
    args: [bookmarkId, topicId, confidence],
  });
}

// Items (tasks, ideas, resources)
export async function createItem(
  item: Omit<Item, "id" | "created_at">
): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: `INSERT INTO items (bookmark_id, type, title, description, status)
          VALUES (?, ?, ?, ?, ?)
          RETURNING id`,
    args: [item.bookmark_id, item.type, item.title, item.description ?? null, item.status],
  });
  const row = result.rows[0];
  if (!row) throw new Error("Failed to create item");
  return row.id as number;
}

export async function getItemsByType(type: string): Promise<Item[]> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM items WHERE type = ? ORDER BY created_at DESC",
    args: [type],
  });
  return result.rows.map((row) => rowToObject<Item>(row));
}

export async function getItemsByStatus(status: string): Promise<Item[]> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM items WHERE status = ? ORDER BY created_at DESC",
    args: [status],
  });
  return result.rows.map((row) => rowToObject<Item>(row));
}

export async function updateItemStatus(id: number, status: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "UPDATE items SET status = ? WHERE id = ?",
    args: [status, id],
  });
}

export async function getItemCount(type?: string): Promise<number> {
  const db = getDb();
  const result = type
    ? await db.execute({
        sql: "SELECT COUNT(*) as count FROM items WHERE type = ?",
        args: [type],
      })
    : await db.execute("SELECT COUNT(*) as count FROM items");
  const row = result.rows[0];
  if (!row) return 0;
  return row.count as number;
}

export async function getPendingTaskCount(): Promise<number> {
  const db = getDb();
  const result = await db.execute(
    "SELECT COUNT(*) as count FROM items WHERE type = 'task' AND status = 'pending'"
  );
  const row = result.rows[0];
  if (!row) return 0;
  return row.count as number;
}

// Sync state
export async function getSyncState(): Promise<SyncState> {
  const db = getDb();
  const result = await db.execute("SELECT * FROM sync_state WHERE id = 1");
  const row = result.rows[0];
  if (!row) {
    return { last_sync_at: null, pagination_token: null };
  }
  return rowToObject<SyncState>(row);
}

export async function updateSyncState(state: Partial<SyncState>): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO sync_state (id, last_sync_at, pagination_token)
          VALUES (1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            last_sync_at = COALESCE(excluded.last_sync_at, sync_state.last_sync_at),
            pagination_token = excluded.pagination_token`,
    args: [state.last_sync_at ?? null, state.pagination_token ?? null],
  });
}

// Stats for dashboard
export async function getStats(): Promise<{
  totalBookmarks: number;
  totalTopics: number;
  pendingTasks: number;
  totalIdeas: number;
}> {
  const db = getDb();
  const [bookmarks, topics, tasks, ideas] = await Promise.all([
    db.execute("SELECT COUNT(*) as count FROM bookmarks"),
    db.execute("SELECT COUNT(*) as count FROM topics"),
    db.execute("SELECT COUNT(*) as count FROM items WHERE type = 'task' AND status = 'pending'"),
    db.execute("SELECT COUNT(*) as count FROM items WHERE type = 'idea'"),
  ]);
  return {
    totalBookmarks: (bookmarks.rows[0]?.count as number) ?? 0,
    totalTopics: (topics.rows[0]?.count as number) ?? 0,
    pendingTasks: (tasks.rows[0]?.count as number) ?? 0,
    totalIdeas: (ideas.rows[0]?.count as number) ?? 0,
  };
}

// Get unanalyzed bookmarks (those without topics)
export async function getUnanalyzedBookmarks(limit = 50): Promise<BookmarkWithAuthor[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT b.*, a.username, a.display_name
          FROM bookmarks b
          LEFT JOIN authors a ON b.author_id = a.id
          WHERE b.id NOT IN (SELECT DISTINCT bookmark_id FROM bookmark_topics)
          ORDER BY b.bookmarked_at DESC
          LIMIT ?`,
    args: [limit],
  });
  return result.rows.map((row) => rowToObject<BookmarkWithAuthor>(row));
}

// Clear topic for re-analysis
export async function clearTopicsForBookmark(bookmarkId: number): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM bookmark_topics WHERE bookmark_id = ?",
    args: [bookmarkId],
  });
}

// Get or create topic by name
export async function getOrCreateTopic(name: string, description?: string): Promise<number> {
  const db = getDb();
  const existing = await db.execute({
    sql: "SELECT id FROM topics WHERE name = ?",
    args: [name],
  });
  const row = existing.rows[0];
  if (row) {
    return row.id as number;
  }
  return createTopic(name, description);
}
