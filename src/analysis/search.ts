import { embed, cosineSimilarity } from "./embeddings";
import { getDb } from "../db/client";
import type { BookmarkWithAuthor } from "../db/queries";

export interface SearchResult {
  bookmark: BookmarkWithAuthor;
  score: number;
}

// Vector similarity search
export async function vectorSearch(
  query: string,
  limit = 20
): Promise<SearchResult[]> {
  const db = getDb();

  // Get query embedding
  const queryEmbedding = await embed(query);

  // Get all bookmarks with embeddings
  const result = await db.execute(
    `SELECT b.*, a.username, a.display_name, b.embedding
     FROM bookmarks b
     LEFT JOIN authors a ON b.author_id = a.id
     WHERE b.embedding IS NOT NULL`
  );

  // Calculate similarities
  const scored: SearchResult[] = [];

  for (const row of result.rows) {
    if (!row.embedding) continue;

    const embedding = JSON.parse(row.embedding as string) as number[];
    const score = cosineSimilarity(queryEmbedding, embedding);

    scored.push({
      bookmark: {
        id: row.id as number,
        tweet_id: row.tweet_id as string,
        author_id: row.author_id as number,
        content: row.content as string,
        created_at: row.created_at as string,
        bookmarked_at: row.bookmarked_at as string,
        like_count: row.like_count as number,
        retweet_count: row.retweet_count as number,
        synced_at: row.synced_at as string,
        username: row.username as string,
        display_name: row.display_name as string | null,
      },
      score,
    });
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}

// Full-text search using SQLite FTS5
export async function ftsSearch(
  query: string,
  limit = 20
): Promise<SearchResult[]> {
  const db = getDb();

  // Escape special FTS characters
  const escapedQuery = query.replace(/['"*()]/g, " ").trim();

  if (!escapedQuery) {
    return [];
  }

  const result = await db.execute({
    sql: `SELECT b.*, a.username, a.display_name, bm25(bookmarks_fts) as score
          FROM bookmarks_fts
          JOIN bookmarks b ON bookmarks_fts.rowid = b.id
          LEFT JOIN authors a ON b.author_id = a.id
          WHERE bookmarks_fts MATCH ?
          ORDER BY score
          LIMIT ?`,
    args: [escapedQuery, limit],
  });

  return result.rows.map((row) => ({
    bookmark: {
      id: row.id as number,
      tweet_id: row.tweet_id as string,
      author_id: row.author_id as number,
      content: row.content as string,
      created_at: row.created_at as string,
      bookmarked_at: row.bookmarked_at as string,
      like_count: row.like_count as number,
      retweet_count: row.retweet_count as number,
      synced_at: row.synced_at as string,
      username: row.username as string,
      display_name: row.display_name as string | null,
    },
    score: Math.abs(row.score as number), // bm25 returns negative scores
  }));
}

// Hybrid search: combine vector and FTS results
export async function hybridSearch(
  query: string,
  limit = 20
): Promise<SearchResult[]> {
  const [vectorResults, ftsResults] = await Promise.all([
    vectorSearch(query, limit),
    ftsSearch(query, limit).catch(() => [] as SearchResult[]), // FTS might fail on some queries
  ]);

  // Merge results, preferring vector search but boosting FTS matches
  const seen = new Set<number>();
  const merged: SearchResult[] = [];

  // Add vector results
  for (const result of vectorResults) {
    seen.add(result.bookmark.id);
    // Check if also in FTS results for score boost
    const ftsMatch = ftsResults.find((r) => r.bookmark.id === result.bookmark.id);
    merged.push({
      ...result,
      score: ftsMatch ? result.score * 1.2 : result.score, // 20% boost for FTS match
    });
  }

  // Add FTS results not in vector results
  for (const result of ftsResults) {
    if (!seen.has(result.bookmark.id)) {
      seen.add(result.bookmark.id);
      merged.push({
        ...result,
        score: result.score * 0.5, // Lower weight for FTS-only matches
      });
    }
  }

  // Re-sort and limit
  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, limit);
}

// Index a bookmark in FTS
export async function indexBookmarkFts(id: number, content: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `INSERT OR REPLACE INTO bookmarks_fts(rowid, content) VALUES (?, ?)`,
    args: [id, content],
  });
}

// Re-index all bookmarks in FTS
export async function reindexAllFts(): Promise<number> {
  const db = getDb();

  // Clear existing FTS index
  await db.execute("DELETE FROM bookmarks_fts");

  // Get all bookmarks
  const result = await db.execute("SELECT id, content FROM bookmarks");

  // Index each one
  for (const row of result.rows) {
    const id = row.id as number;
    const content = row.content as string;
    if (id && content) {
      await db.execute({
        sql: "INSERT INTO bookmarks_fts(rowid, content) VALUES (?, ?)",
        args: [id, content],
      });
    }
  }

  return result.rows.length;
}
