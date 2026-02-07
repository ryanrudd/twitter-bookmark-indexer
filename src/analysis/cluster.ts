import { analyzeTextAsJson } from "./claude";
import type { BookmarkWithAuthor } from "../db/queries";
import {
  getOrCreateTopic,
  linkBookmarkToTopic,
  getUnanalyzedBookmarks,
} from "../db/queries";

interface TopicClassification {
  topics: Array<{
    name: string;
    description: string;
    confidence: number;
  }>;
}

interface BatchClassificationResult {
  bookmarks: Array<{
    tweet_id: string;
    topics: Array<{
      name: string;
      confidence: number;
    }>;
  }>;
  topic_descriptions: Record<string, string>;
}

const TOPIC_SYSTEM_PROMPT = `You are an expert at analyzing tweets and categorizing them into meaningful topics.
Given a set of bookmarked tweets, identify the main topics they cover.

Rules:
- Use concise, descriptive topic names (2-4 words max)
- Common topics include: Tech News, AI/ML, Web Development, Career Advice, Startup Ideas, Productivity, Design, Finance, etc.
- Each tweet can belong to multiple topics
- Provide a confidence score (0-1) for each topic assignment
- Create new topics as needed, but try to consolidate similar concepts

Respond with valid JSON only, no markdown code blocks or explanation.`;

export async function classifyBookmark(
  bookmark: BookmarkWithAuthor
): Promise<TopicClassification> {
  const prompt = `Classify this tweet into topics:

Tweet by @${bookmark.username}:
"${bookmark.content}"

Respond with JSON in this format:
{
  "topics": [
    {"name": "Topic Name", "description": "Brief description", "confidence": 0.9}
  ]
}`;

  return analyzeTextAsJson<TopicClassification>(prompt, TOPIC_SYSTEM_PROMPT);
}

export async function classifyBookmarkBatch(
  bookmarks: BookmarkWithAuthor[]
): Promise<BatchClassificationResult> {
  if (bookmarks.length === 0) {
    return { bookmarks: [], topic_descriptions: {} };
  }

  const tweetList = bookmarks
    .map(
      (b, i) =>
        `${i + 1}. [${b.tweet_id}] @${b.username}: "${b.content.slice(0, 200)}${b.content.length > 200 ? "..." : ""}"`
    )
    .join("\n\n");

  const prompt = `Classify these ${bookmarks.length} tweets into topics:

${tweetList}

Respond with JSON in this format:
{
  "bookmarks": [
    {"tweet_id": "123", "topics": [{"name": "Topic Name", "confidence": 0.9}]}
  ],
  "topic_descriptions": {
    "Topic Name": "Brief description of this topic"
  }
}`;

  return analyzeTextAsJson<BatchClassificationResult>(prompt, TOPIC_SYSTEM_PROMPT);
}

export interface ClusterProgress {
  phase: "analyzing" | "saving" | "complete";
  processed: number;
  total: number;
}

export interface ClusterResult {
  processed: number;
  topicsCreated: number;
  topicsAssigned: number;
}

export async function clusterUnanalyzedBookmarks(
  onProgress?: (progress: ClusterProgress) => void,
  batchSize = 20
): Promise<ClusterResult> {
  const unanalyzed = await getUnanalyzedBookmarks(100);

  if (unanalyzed.length === 0) {
    onProgress?.({ phase: "complete", processed: 0, total: 0 });
    return { processed: 0, topicsCreated: 0, topicsAssigned: 0 };
  }

  let processed = 0;
  let topicsCreated = 0;
  let topicsAssigned = 0;
  const existingTopics = new Set<string>();

  // Process in batches
  for (let i = 0; i < unanalyzed.length; i += batchSize) {
    const batch = unanalyzed.slice(i, i + batchSize);

    onProgress?.({
      phase: "analyzing",
      processed,
      total: unanalyzed.length,
    });

    try {
      const result = await classifyBookmarkBatch(batch);

      onProgress?.({
        phase: "saving",
        processed,
        total: unanalyzed.length,
      });

      // Save topic descriptions
      for (const [topicName, description] of Object.entries(
        result.topic_descriptions
      )) {
        if (!existingTopics.has(topicName)) {
          await getOrCreateTopic(topicName, description);
          existingTopics.add(topicName);
          topicsCreated++;
        }
      }

      // Link bookmarks to topics
      for (const classification of result.bookmarks) {
        const bookmark = batch.find((b) => b.tweet_id === classification.tweet_id);
        if (!bookmark) continue;

        for (const topic of classification.topics) {
          const topicId = await getOrCreateTopic(topic.name);
          if (!existingTopics.has(topic.name)) {
            existingTopics.add(topic.name);
          }
          await linkBookmarkToTopic(bookmark.id, topicId, topic.confidence);
          topicsAssigned++;
        }

        processed++;
      }
    } catch (error) {
      console.error(`Error processing batch: ${error}`);
      // Continue with next batch
    }

    // Rate limit between batches
    if (i + batchSize < unanalyzed.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  onProgress?.({
    phase: "complete",
    processed,
    total: unanalyzed.length,
  });

  return { processed, topicsCreated, topicsAssigned };
}
