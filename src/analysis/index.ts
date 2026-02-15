import { getDb } from "../db/client";
import { embed, embedBatch } from "./embeddings";
import { kmeans, suggestK, getClusterLabels } from "./cluster";
import { indexBookmarkFts, reindexAllFts } from "./search";
import type { BookmarkWithAuthor } from "../db/queries";

export interface AnalysisProgress {
  phase: "embedding" | "clustering" | "indexing" | "complete";
  current: number;
  total: number;
}

export interface AnalysisResult {
  embeddingsGenerated: number;
  clustersCreated: number;
  ftsIndexed: number;
}

// Get bookmarks without embeddings
export async function getUnembeddedBookmarks(): Promise<BookmarkWithAuthor[]> {
  const db = getDb();
  const result = await db.execute(
    `SELECT b.*, a.username, a.display_name
     FROM bookmarks b
     LEFT JOIN authors a ON b.author_id = a.id
     WHERE b.embedding IS NULL
     ORDER BY b.bookmarked_at DESC`
  );

  return result.rows.map((row) => ({
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
  }));
}

// Generate embeddings for all unembedded bookmarks
export async function generateEmbeddings(
  onProgress?: (progress: AnalysisProgress) => void
): Promise<number> {
  const bookmarks = await getUnembeddedBookmarks();

  if (bookmarks.length === 0) {
    return 0;
  }

  const db = getDb();
  let processed = 0;

  for (const bookmark of bookmarks) {
    onProgress?.({
      phase: "embedding",
      current: processed,
      total: bookmarks.length,
    });

    const embedding = await embed(bookmark.content);

    await db.execute({
      sql: "UPDATE bookmarks SET embedding = ? WHERE id = ?",
      args: [JSON.stringify(embedding), bookmark.id],
    });

    // Also index in FTS
    await indexBookmarkFts(bookmark.id, bookmark.content);

    processed++;
  }

  onProgress?.({
    phase: "embedding",
    current: processed,
    total: bookmarks.length,
  });

  return processed;
}

// Get all bookmarks with embeddings
async function getEmbeddedBookmarks(): Promise<
  { bookmark: BookmarkWithAuthor; embedding: number[] }[]
> {
  const db = getDb();
  const result = await db.execute(
    `SELECT b.*, a.username, a.display_name, b.embedding
     FROM bookmarks b
     LEFT JOIN authors a ON b.author_id = a.id
     WHERE b.embedding IS NOT NULL`
  );

  return result.rows
    .filter((row) => row.embedding)
    .map((row) => ({
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
      embedding: JSON.parse(row.embedding as string) as number[],
    }));
}

// Run clustering on all embedded bookmarks
export async function runClustering(
  k?: number,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<{ clustersCreated: number; labels: string[] }> {
  onProgress?.({ phase: "clustering", current: 0, total: 1 });

  const data = await getEmbeddedBookmarks();

  if (data.length < 2) {
    return { clustersCreated: 0, labels: [] };
  }

  const points = data.map((d) => d.embedding);
  const texts = data.map((d) => d.bookmark.content);

  // Auto-detect k if not provided
  const numClusters = k ?? suggestK(points, 10);

  onProgress?.({ phase: "clustering", current: 0, total: 1 });

  const result = kmeans(points, numClusters);
  const labels = getClusterLabels(points, texts, result.assignments, numClusters, result.centroids);

  // Clear old topics and create new ones
  const db = getDb();
  await db.execute("DELETE FROM bookmark_topics");
  await db.execute("DELETE FROM topics");

  // Create topics from clusters
  for (let c = 0; c < numClusters; c++) {
    const clusterSize = result.assignments.filter((a) => a === c).length;
    if (clusterSize === 0) continue;

    const label = labels[c] ?? `Cluster ${c + 1}`;
    const topicResult = await db.execute({
      sql: "INSERT INTO topics (name, description) VALUES (?, ?) RETURNING id",
      args: [label, `${clusterSize} bookmarks`],
    });

    const topicId = topicResult.rows[0]?.id as number;
    if (!topicId) continue;

    // Link bookmarks to topic
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (!item || result.assignments[i] !== c) continue;

      await db.execute({
        sql: "INSERT INTO bookmark_topics (bookmark_id, topic_id, confidence) VALUES (?, ?, ?)",
        args: [item.bookmark.id, topicId, 1.0],
      });

      // Also update cluster_id on bookmark
      await db.execute({
        sql: "UPDATE bookmarks SET cluster_id = ? WHERE id = ?",
        args: [c, item.bookmark.id],
      });
    }
  }

  onProgress?.({ phase: "clustering", current: 1, total: 1 });

  return { clustersCreated: numClusters, labels };
}

// Full analysis: embeddings + clustering + FTS
export async function runFullAnalysis(
  onProgress?: (progress: AnalysisProgress) => void
): Promise<AnalysisResult> {
  // Generate embeddings
  const embeddingsGenerated = await generateEmbeddings(onProgress);

  // Run clustering
  const { clustersCreated } = await runClustering(undefined, onProgress);

  // Reindex FTS
  onProgress?.({ phase: "indexing", current: 0, total: 1 });
  const ftsIndexed = await reindexAllFts();
  onProgress?.({ phase: "indexing", current: 1, total: 1 });

  onProgress?.({ phase: "complete", current: 1, total: 1 });

  return {
    embeddingsGenerated,
    clustersCreated,
    ftsIndexed,
  };
}

// Check if analysis has been run
export async function hasEmbeddings(): Promise<boolean> {
  const db = getDb();
  const result = await db.execute(
    "SELECT COUNT(*) as count FROM bookmarks WHERE embedding IS NOT NULL"
  );
  return (result.rows[0]?.count as number) > 0;
}
