import React, { useEffect, useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { Header } from "../components/Header";
import { BookmarkCard } from "../components/BookmarkCard";
import { StatusBar } from "../components/StatusBar";
import { getBookmarks, searchBookmarks, type BookmarkWithAuthor } from "../../db/queries";
import { hybridSearch, type SearchResult } from "../../analysis/search";
import { hasEmbeddings } from "../../analysis/index";

interface BookmarksProps {
  onBack: () => void;
}

const PAGE_SIZE = 5;

export function Bookmarks({ onBack }: BookmarksProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkWithAuthor[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [useSemanticSearch, setUseSemanticSearch] = useState(false);
  const [searchType, setSearchType] = useState<"keyword" | "semantic">("keyword");

  useEffect(() => {
    hasEmbeddings().then(setUseSemanticSearch);
  }, []);

  const loadBookmarks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBookmarks(PAGE_SIZE, page * PAGE_SIZE);
      setBookmarks(data);
    } finally {
      setLoading(false);
    }
  }, [page]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      loadBookmarks();
      return;
    }
    setLoading(true);
    try {
      if (searchType === "semantic" && useSemanticSearch) {
        const results = await hybridSearch(searchQuery, PAGE_SIZE);
        setBookmarks(results.map((r) => r.bookmark));
      } else {
        const data = await searchBookmarks(searchQuery);
        setBookmarks(data.slice(0, PAGE_SIZE));
      }
      setPage(0);
      setSelectedIndex(0);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, loadBookmarks, searchType, useSemanticSearch]);

  useEffect(() => {
    if (!searchMode) {
      loadBookmarks();
    }
  }, [loadBookmarks, searchMode]);

  useInput((input, key) => {
    if (searchMode) {
      if (key.escape) {
        setSearchMode(false);
        setSearchQuery("");
        loadBookmarks();
      } else if (key.return) {
        setSearchMode(false);
        handleSearch();
      }
      return;
    }

    if (key.escape || input === "b") {
      onBack();
    } else if (input === "/") {
      setSearchMode(true);
    } else if (input === "s" && useSemanticSearch) {
      setSearchType(searchType === "keyword" ? "semantic" : "keyword");
    } else if (key.upArrow || input === "k") {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex(Math.min(bookmarks.length - 1, selectedIndex + 1));
    } else if (input === "n" || key.rightArrow) {
      setPage(page + 1);
      setSelectedIndex(0);
    } else if (input === "p" || key.leftArrow) {
      if (page > 0) {
        setPage(page - 1);
        setSelectedIndex(0);
      }
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Bookmarks" />
        <Text color="yellow">Loading...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header
        title="Bookmarks"
        subtitle={
          searchQuery
            ? `${searchType === "semantic" ? "Semantic" : "Keyword"} search: "${searchQuery}"`
            : `Page ${page + 1}${useSemanticSearch ? ` · ${searchType} mode` : ""}`
        }
      />

      {searchMode ? (
        <Box marginBottom={1}>
          <Text>Search: </Text>
          <TextInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Type to search..."
          />
        </Box>
      ) : null}

      {bookmarks.length === 0 ? (
        <Text color="gray">No bookmarks found. Sync to fetch bookmarks.</Text>
      ) : (
        <Box flexDirection="column">
          {bookmarks.map((bookmark, index) => (
            <BookmarkCard
              key={bookmark.id}
              bookmark={bookmark}
              selected={index === selectedIndex}
            />
          ))}
        </Box>
      )}

      <StatusBar
        hint={
          searchMode
            ? "Enter to search · Esc to cancel"
            : `/ search${useSemanticSearch ? " · s toggle semantic" : ""} · j/k navigate · n/p page · b back`
        }
      />
    </Box>
  );
}
