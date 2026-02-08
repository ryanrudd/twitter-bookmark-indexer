import { getAccessToken } from "./auth";

const TWITTER_API_BASE = "https://api.twitter.com/2";

let cachedUserId: string | null = null;

export interface TwitterUser {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
}

export interface Tweet {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
}

export interface BookmarksResponse {
  data?: Tweet[];
  includes?: {
    users?: TwitterUser[];
  };
  meta?: {
    next_token?: string;
    result_count: number;
  };
}

async function twitterFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  retryCount = 0
): Promise<T> {
  const accessToken = await getAccessToken();

  const response = await fetch(`${TWITTER_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (response.status === 429) {
    // Rate limited - check when we can retry
    const resetTime = response.headers.get("x-rate-limit-reset");
    const remaining = response.headers.get("x-rate-limit-remaining");

    if (retryCount < 3 && resetTime) {
      const resetMs = parseInt(resetTime, 10) * 1000;
      const waitMs = Math.max(resetMs - Date.now(), 1000) + 1000; // Add 1s buffer
      const waitMins = Math.ceil(waitMs / 60000);

      console.log(`Rate limited. Waiting ${waitMins} minute(s) until reset...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return twitterFetch<T>(endpoint, options, retryCount + 1);
    }

    throw new Error(
      `Rate limited by Twitter API. Try again in a few minutes. ` +
      `(Remaining: ${remaining ?? "unknown"})`
    );
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Twitter API error (${response.status}): ${error}`);
  }

  return response.json() as Promise<T>;
}

export async function getMe(): Promise<TwitterUser> {
  const response = await twitterFetch<{ data: TwitterUser }>("/users/me");
  cachedUserId = response.data.id;
  return response.data;
}

export async function getUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const me = await getMe();
  return me.id;
}

export async function getBookmarks(
  paginationToken?: string,
  maxResults = 100
): Promise<BookmarksResponse> {
  const params = new URLSearchParams({
    max_results: String(Math.min(maxResults, 100)),
    "tweet.fields": "created_at,public_metrics,author_id",
    expansions: "author_id",
    "user.fields": "username,name,profile_image_url",
  });

  if (paginationToken) {
    params.set("pagination_token", paginationToken);
  }

  const userId = await getUserId();

  return twitterFetch<BookmarksResponse>(
    `/users/${userId}/bookmarks?${params.toString()}`
  );
}

export async function getAllBookmarks(
  onProgress?: (count: number) => void,
  maxTotal = 100 // Reduced for free tier
): Promise<{ tweets: Tweet[]; users: Map<string, TwitterUser> }> {
  const allTweets: Tweet[] = [];
  const usersMap = new Map<string, TwitterUser>();
  let paginationToken: string | undefined;

  do {
    const response = await getBookmarks(paginationToken, 50); // Smaller batches

    if (response.data) {
      allTweets.push(...response.data);
    }

    if (response.includes?.users) {
      for (const user of response.includes.users) {
        usersMap.set(user.id, user);
      }
    }

    paginationToken = response.meta?.next_token;
    onProgress?.(allTweets.length);

    // Rate limit: wait longer between requests for free tier
    if (paginationToken) {
      console.log(`Fetched ${allTweets.length} bookmarks, waiting before next batch...`);
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 seconds between requests
    }
  } while (paginationToken && allTweets.length < maxTotal);

  return { tweets: allTweets, users: usersMap };
}
