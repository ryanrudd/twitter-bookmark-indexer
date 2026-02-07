import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Header } from "../components/Header";
import { StatusBar } from "../components/StatusBar";
import { getTopics, getTopicWithBookmarks, type Topic, type BookmarkWithAuthor } from "../../db/queries";
import { BookmarkCard } from "../components/BookmarkCard";

interface TopicsProps {
  onBack: () => void;
}

type ViewMode = "list" | "detail";

export function Topics({ onBack }: TopicsProps) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [topicBookmarks, setTopicBookmarks] = useState<BookmarkWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await getTopics();
        setTopics(data);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const loadTopicDetail = async (topic: Topic) => {
    setLoading(true);
    try {
      const result = await getTopicWithBookmarks(topic.id);
      if (result) {
        setSelectedTopic(result.topic);
        setTopicBookmarks(result.bookmarks);
        setViewMode("detail");
      }
    } finally {
      setLoading(false);
    }
  };

  useInput((input, key) => {
    if (viewMode === "detail") {
      if (key.escape || input === "b") {
        setViewMode("list");
        setSelectedTopic(null);
        setTopicBookmarks([]);
      }
      return;
    }

    if (key.escape || input === "b") {
      onBack();
    } else if (key.upArrow || input === "k") {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex(Math.min(topics.length - 1, selectedIndex + 1));
    } else if (key.return) {
      if (topics[selectedIndex]) {
        loadTopicDetail(topics[selectedIndex]);
      }
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Topics" />
        <Text color="yellow">Loading...</Text>
      </Box>
    );
  }

  if (viewMode === "detail" && selectedTopic) {
    return (
      <Box flexDirection="column" padding={1}>
        <Header
          title={selectedTopic.name}
          subtitle={selectedTopic.description || undefined}
        />

        {topicBookmarks.length === 0 ? (
          <Text color="gray">No bookmarks in this topic.</Text>
        ) : (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text color="gray">
                {topicBookmarks.length} bookmark(s)
              </Text>
            </Box>
            {topicBookmarks.slice(0, 5).map((bookmark) => (
              <BookmarkCard
                key={bookmark.id}
                bookmark={bookmark}
                showStats={false}
              />
            ))}
            {topicBookmarks.length > 5 && (
              <Text color="gray">...and {topicBookmarks.length - 5} more</Text>
            )}
          </Box>
        )}

        <StatusBar hint="b to go back" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Topics" subtitle="AI-generated topic clusters" />

      {topics.length === 0 ? (
        <Text color="gray">No topics yet. Run analysis to cluster bookmarks.</Text>
      ) : (
        <Box flexDirection="column">
          {topics.map((topic, index) => (
            <Box key={topic.id}>
              <Text
                color={index === selectedIndex ? "green" : undefined}
                bold={index === selectedIndex}
              >
                {index === selectedIndex ? ">" : " "} {topic.name}
              </Text>
              {topic.description && (
                <Text color="gray" dimColor>
                  {" "}
                  - {topic.description.slice(0, 40)}
                  {topic.description.length > 40 ? "..." : ""}
                </Text>
              )}
            </Box>
          ))}
        </Box>
      )}

      <StatusBar hint="j/k navigate · Enter view · b back" />
    </Box>
  );
}
