import { getAccessToken } from "./auth";

const TWITTER_API_BASE = "https://api.twitter.com/2";

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
  options: RequestInit = {}
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

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Twitter API error (${response.status}): ${error}`);
  }

  return response.json() as Promise<T>;
}

export async function getMe(): Promise<TwitterUser> {
  const response = await twitterFetch<{ data: TwitterUser }>("/users/me");
  return response.data;
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

  // First get the user ID
  const me = await getMe();

  return twitterFetch<BookmarksResponse>(
    `/users/${me.id}/bookmarks?${params.toString()}`
  );
}

export async function getAllBookmarks(
  onProgress?: (count: number) => void,
  maxTotal = 800
): Promise<{ tweets: Tweet[]; users: Map<string, TwitterUser> }> {
  const allTweets: Tweet[] = [];
  const usersMap = new Map<string, TwitterUser>();
  let paginationToken: string | undefined;

  do {
    const response = await getBookmarks(paginationToken);

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

    // Rate limit: wait a bit between requests
    if (paginationToken) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } while (paginationToken && allTweets.length < maxTotal);

  return { tweets: allTweets, users: usersMap };
}
