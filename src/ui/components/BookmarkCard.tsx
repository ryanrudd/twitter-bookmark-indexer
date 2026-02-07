import React from "react";
import { Box, Text } from "ink";
import type { BookmarkWithAuthor } from "../../db/queries";

interface BookmarkCardProps {
  bookmark: BookmarkWithAuthor;
  selected?: boolean;
  showStats?: boolean;
}

export function BookmarkCard({
  bookmark,
  selected = false,
  showStats = true,
}: BookmarkCardProps) {
  const displayName = bookmark.display_name || bookmark.username;
  const date = new Date(bookmark.created_at).toLocaleDateString();
  const content =
    bookmark.content.length > 200
      ? bookmark.content.slice(0, 200) + "..."
      : bookmark.content;

  return (
    <Box
      flexDirection="column"
      borderStyle={selected ? "round" : undefined}
      borderColor={selected ? "green" : undefined}
      paddingX={1}
      marginBottom={1}
    >
      <Box>
        <Text color="cyan" bold>
          @{bookmark.username}
        </Text>
        {displayName !== bookmark.username && (
          <Text color="gray"> ({displayName})</Text>
        )}
        <Text color="gray" dimColor>
          {" "}
          · {date}
        </Text>
      </Box>
      <Text wrap="wrap">{content}</Text>
      {showStats && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            {bookmark.like_count} likes · {bookmark.retweet_count} retweets
          </Text>
        </Box>
      )}
    </Box>
  );
}
