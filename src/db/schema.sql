-- Twitter users (authors of bookmarked tweets)
CREATE TABLE IF NOT EXISTS authors (
  id INTEGER PRIMARY KEY,
  twitter_id TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT
);

-- Bookmarked tweets
CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY,
  tweet_id TEXT UNIQUE NOT NULL,
  author_id INTEGER REFERENCES authors(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  bookmarked_at TEXT NOT NULL,
  like_count INTEGER DEFAULT 0,
  retweet_count INTEGER DEFAULT 0,
  synced_at TEXT NOT NULL
);

-- AI-generated topics/clusters
CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Bookmark-topic relationships
CREATE TABLE IF NOT EXISTS bookmark_topics (
  bookmark_id INTEGER REFERENCES bookmarks(id),
  topic_id INTEGER REFERENCES topics(id),
  confidence REAL,
  PRIMARY KEY (bookmark_id, topic_id)
);

-- Extracted actionable items
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  bookmark_id INTEGER REFERENCES bookmarks(id),
  type TEXT NOT NULL, -- 'task', 'idea', 'resource', etc.
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'done', 'archived'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Sync metadata
CREATE TABLE IF NOT EXISTS sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_sync_at TEXT,
  pagination_token TEXT
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_tweet_id ON bookmarks(tweet_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_synced_at ON bookmarks(synced_at);
CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
