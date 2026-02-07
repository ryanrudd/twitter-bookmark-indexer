import { getAllBookmarks, type Tweet, type TwitterUser } from "./client";
import {
  upsertAuthor,
  upsertBookmark,
  getSyncState,
  updateSyncState,
  getBookmarkCount,
} from "../db/queries";

export interface SyncProgress {
  phase: "fetching" | "saving" | "complete";
  fetched: number;
  saved: number;
  total?: number;
}

export interface SyncResult {
  newBookmarks: number;
  updatedBookmarks: number;
  totalBookmarks: number;
  syncedAt: string;
}

export async function syncBookmarks(
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();
  let newCount = 0;
  let updateCount = 0;

  // Fetch all bookmarks from Twitter
  onProgress?.({ phase: "fetching", fetched: 0, saved: 0 });

  const { tweets, users } = await getAllBookmarks((count) => {
    onProgress?.({ phase: "fetching", fetched: count, saved: 0 });
  });

  // Save to database
  onProgress?.({
    phase: "saving",
    fetched: tweets.length,
    saved: 0,
    total: tweets.length,
  });

  const existingCount = await getBookmarkCount();

  for (let i = 0; i < tweets.length; i++) {
    const tweet = tweets[i];
    if (!tweet) continue;

    const user = users.get(tweet.author_id);

    if (user) {
      const authorId = await upsertAuthor({
        twitter_id: user.id,
        username: user.username,
        display_name: user.name,
        avatar_url: user.profile_image_url ?? null,
      });

      await upsertBookmark({
        tweet_id: tweet.id,
        author_id: authorId,
        content: tweet.text,
        created_at: tweet.created_at,
        bookmarked_at: tweet.created_at, // Twitter API doesn't provide actual bookmark time
        like_count: tweet.public_metrics?.like_count ?? 0,
        retweet_count: tweet.public_metrics?.retweet_count ?? 0,
        synced_at: syncedAt,
      });
    }

    onProgress?.({
      phase: "saving",
      fetched: tweets.length,
      saved: i + 1,
      total: tweets.length,
    });
  }

  // Update sync state
  await updateSyncState({ last_sync_at: syncedAt });

  const newTotalCount = await getBookmarkCount();
  newCount = newTotalCount - existingCount;
  updateCount = tweets.length - newCount;

  onProgress?.({
    phase: "complete",
    fetched: tweets.length,
    saved: tweets.length,
    total: tweets.length,
  });

  return {
    newBookmarks: newCount,
    updatedBookmarks: updateCount,
    totalBookmarks: newTotalCount,
    syncedAt,
  };
}

export async function getLastSyncTime(): Promise<string | null> {
  const state = await getSyncState();
  return state.last_sync_at;
}
