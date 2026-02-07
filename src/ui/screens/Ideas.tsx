import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Header } from "../components/Header";
import { StatusBar } from "../components/StatusBar";
import { getItemsByType, getBookmarkById, type Item, type BookmarkWithAuthor } from "../../db/queries";

interface IdeasProps {
  onBack: () => void;
}

export function Ideas({ onBack }: IdeasProps) {
  const [ideas, setIdeas] = useState<Item[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedBookmark, setSelectedBookmark] = useState<BookmarkWithAuthor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await getItemsByType("idea");
        setIdeas(data);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    async function loadBookmark() {
      const idea = ideas[selectedIndex];
      if (idea) {
        const bookmark = await getBookmarkById(idea.bookmark_id);
        setSelectedBookmark(bookmark);
      } else {
        setSelectedBookmark(null);
      }
    }
    loadBookmark();
  }, [selectedIndex, ideas]);

  useInput((input, key) => {
    if (key.escape || input === "b") {
      onBack();
    } else if (key.upArrow || input === "k") {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex(Math.min(ideas.length - 1, selectedIndex + 1));
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Ideas" />
        <Text color="yellow">Loading...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Business Ideas" subtitle="Captured from your bookmarks" />

      {ideas.length === 0 ? (
        <Text color="gray">
          No ideas captured yet. Run analysis to extract ideas from bookmarks.
        </Text>
      ) : (
        <Box flexDirection="row">
          <Box flexDirection="column" width="50%">
            {ideas.map((idea, index) => (
              <Box key={idea.id}>
                <Text
                  color={index === selectedIndex ? "magenta" : undefined}
                  bold={index === selectedIndex}
                >
                  {index === selectedIndex ? ">" : " "} {idea.title}
                </Text>
              </Box>
            ))}
          </Box>

          {selectedBookmark && (
            <Box flexDirection="column" width="50%" paddingLeft={2}>
              <Text bold color="white">
                Source Tweet
              </Text>
              <Text color="cyan">@{selectedBookmark.username}</Text>
              <Text wrap="wrap" color="gray">
                {selectedBookmark.content.slice(0, 200)}
                {selectedBookmark.content.length > 200 ? "..." : ""}
              </Text>
              {ideas[selectedIndex]?.description && (
                <Box marginTop={1} flexDirection="column">
                  <Text bold color="white">
                    Details
                  </Text>
                  <Text wrap="wrap">{ideas[selectedIndex]?.description}</Text>
                </Box>
              )}
            </Box>
          )}
        </Box>
      )}

      <StatusBar hint="j/k navigate · b back" />
    </Box>
  );
}
