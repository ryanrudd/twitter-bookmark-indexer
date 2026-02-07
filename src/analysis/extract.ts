import { analyzeTextAsJson } from "./claude";
import type { BookmarkWithAuthor } from "../db/queries";
import { createItem, getUnanalyzedBookmarks, getBookmarks } from "../db/queries";

interface ExtractedItem {
  type: "task" | "idea" | "resource";
  title: string;
  description: string;
}

interface ExtractionResult {
  items: ExtractedItem[];
}

interface BatchExtractionResult {
  extractions: Array<{
    tweet_id: string;
    items: ExtractedItem[];
  }>;
}

const EXTRACTION_SYSTEM_PROMPT = `You are an expert at extracting actionable items from tweets.
Analyze bookmarked tweets to identify:

1. TASKS - Things to try, learn, build, or do
   Examples: "try this new library", "read this article", "implement this pattern"

2. IDEAS - Business ideas, project concepts, or creative insights
   Examples: "SaaS idea for X", "product opportunity", "market gap"

3. RESOURCES - Valuable links, tools, or references to save
   Examples: "useful tool for Y", "great tutorial on Z"

Rules:
- Only extract genuinely actionable or valuable items
- Be concise but specific in titles (5-10 words)
- Include relevant context in descriptions
- Skip tweets that are just commentary or opinions without actionable content
- A single tweet may have multiple items or none

Respond with valid JSON only, no markdown code blocks.`;

export async function extractFromBookmark(
  bookmark: BookmarkWithAuthor
): Promise<ExtractionResult> {
  const prompt = `Extract actionable items from this tweet:

Tweet by @${bookmark.username}:
"${bookmark.content}"

Respond with JSON:
{
  "items": [
    {"type": "task|idea|resource", "title": "Brief title", "description": "Context and details"}
  ]
}

Return empty items array if nothing actionable.`;

  return analyzeTextAsJson<ExtractionResult>(prompt, EXTRACTION_SYSTEM_PROMPT);
}

export async function extractFromBookmarkBatch(
  bookmarks: BookmarkWithAuthor[]
): Promise<BatchExtractionResult> {
  if (bookmarks.length === 0) {
    return { extractions: [] };
  }

  const tweetList = bookmarks
    .map(
      (b, i) =>
        `${i + 1}. [${b.tweet_id}] @${b.username}: "${b.content.slice(0, 300)}${b.content.length > 300 ? "..." : ""}"`
    )
    .join("\n\n");

  const prompt = `Extract actionable items from these tweets:

${tweetList}

Respond with JSON:
{
  "extractions": [
    {
      "tweet_id": "123",
      "items": [
        {"type": "task", "title": "Brief title", "description": "Details"}
      ]
    }
  ]
}

Include a tweet in extractions only if it has actionable items.`;

  return analyzeTextAsJson<BatchExtractionResult>(prompt, EXTRACTION_SYSTEM_PROMPT);
}

export interface ExtractProgress {
  phase: "analyzing" | "saving" | "complete";
  processed: number;
  total: number;
}

export interface ExtractResult {
  processed: number;
  tasksCreated: number;
  ideasCreated: number;
  resourcesCreated: number;
}

export async function extractFromAllBookmarks(
  onProgress?: (progress: ExtractProgress) => void,
  batchSize = 15
): Promise<ExtractResult> {
  // Get all bookmarks (not just unanalyzed, since extraction is separate from topics)
  const bookmarks = await getBookmarks(200, 0);

  if (bookmarks.length === 0) {
    onProgress?.({ phase: "complete", processed: 0, total: 0 });
    return { processed: 0, tasksCreated: 0, ideasCreated: 0, resourcesCreated: 0 };
  }

  let processed = 0;
  let tasksCreated = 0;
  let ideasCreated = 0;
  let resourcesCreated = 0;

  // Process in batches
  for (let i = 0; i < bookmarks.length; i += batchSize) {
    const batch = bookmarks.slice(i, i + batchSize);

    onProgress?.({
      phase: "analyzing",
      processed,
      total: bookmarks.length,
    });

    try {
      const result = await extractFromBookmarkBatch(batch);

      onProgress?.({
        phase: "saving",
        processed,
        total: bookmarks.length,
      });

      // Save extracted items
      for (const extraction of result.extractions) {
        const bookmark = batch.find((b) => b.tweet_id === extraction.tweet_id);
        if (!bookmark) continue;

        for (const item of extraction.items) {
          await createItem({
            bookmark_id: bookmark.id,
            type: item.type,
            title: item.title,
            description: item.description,
            status: "pending",
          });

          switch (item.type) {
            case "task":
              tasksCreated++;
              break;
            case "idea":
              ideasCreated++;
              break;
            case "resource":
              resourcesCreated++;
              break;
          }
        }

        processed++;
      }
    } catch (error) {
      console.error(`Error processing batch: ${error}`);
    }

    // Rate limit between batches
    if (i + batchSize < bookmarks.length) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  onProgress?.({
    phase: "complete",
    processed,
    total: bookmarks.length,
  });

  return { processed, tasksCreated, ideasCreated, resourcesCreated };
}

export async function extractFromNewBookmarks(
  onProgress?: (progress: ExtractProgress) => void,
  batchSize = 15
): Promise<ExtractResult> {
  // Only process unanalyzed bookmarks for incremental extraction
  const bookmarks = await getUnanalyzedBookmarks(100);

  if (bookmarks.length === 0) {
    onProgress?.({ phase: "complete", processed: 0, total: 0 });
    return { processed: 0, tasksCreated: 0, ideasCreated: 0, resourcesCreated: 0 };
  }

  let processed = 0;
  let tasksCreated = 0;
  let ideasCreated = 0;
  let resourcesCreated = 0;

  for (let i = 0; i < bookmarks.length; i += batchSize) {
    const batch = bookmarks.slice(i, i + batchSize);

    onProgress?.({
      phase: "analyzing",
      processed,
      total: bookmarks.length,
    });

    try {
      const result = await extractFromBookmarkBatch(batch);

      onProgress?.({
        phase: "saving",
        processed,
        total: bookmarks.length,
      });

      for (const extraction of result.extractions) {
        const bookmark = batch.find((b) => b.tweet_id === extraction.tweet_id);
        if (!bookmark) continue;

        for (const item of extraction.items) {
          await createItem({
            bookmark_id: bookmark.id,
            type: item.type,
            title: item.title,
            description: item.description,
            status: "pending",
          });

          switch (item.type) {
            case "task":
              tasksCreated++;
              break;
            case "idea":
              ideasCreated++;
              break;
            case "resource":
              resourcesCreated++;
              break;
          }
        }

        processed++;
      }
    } catch (error) {
      console.error(`Error processing batch: ${error}`);
    }

    if (i + batchSize < bookmarks.length) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  onProgress?.({
    phase: "complete",
    processed,
    total: bookmarks.length,
  });

  return { processed, tasksCreated, ideasCreated, resourcesCreated };
}
