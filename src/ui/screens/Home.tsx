import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { Header } from "../components/Header";
import { Menu, type MenuItem } from "../components/Menu";
import { StatusBar } from "../components/StatusBar";
import { getStats } from "../../db/queries";
import { getLastSyncTime } from "../../twitter/sync";
import { isAuthenticated } from "../../twitter/auth";
import { hasEmbeddings } from "../../analysis/index";

interface HomeProps {
  onNavigate: (screen: string) => void;
}

interface Stats {
  totalBookmarks: number;
  totalTopics: number;
  pendingTasks: number;
  totalIdeas: number;
}

export function Home({ onNavigate }: HomeProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [hasAnalysis, setHasAnalysis] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    async function load() {
      const [s, sync, auth, analyzed] = await Promise.all([
        getStats(),
        getLastSyncTime(),
        isAuthenticated(),
        hasEmbeddings(),
      ]);
      setStats(s);
      setLastSync(sync);
      setAuthenticated(auth);
      setHasAnalysis(analyzed);
    }
    load();
  }, []);

  const menuItems: MenuItem[] = [
    { key: "bookmarks", label: "Bookmarks", description: `${stats?.totalBookmarks ?? 0} saved` },
    { key: "topics", label: "Topics", description: `${stats?.totalTopics ?? 0} clusters` },
    { key: "sync", label: "Sync", description: authenticated ? "Connected" : "Not connected" },
    { key: "analyze", label: "Analyze", description: hasAnalysis ? "Ready" : "Run to enable search" },
  ];

  const handleActivate = (item: MenuItem) => {
    onNavigate(item.key);
  };

  const formatLastSync = (date: string | null) => {
    if (!date) return "Never";
    const d = new Date(date);
    return d.toLocaleString();
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Header
        title="BIRDBRAIN"
        subtitle="Twitter Bookmark Indexer"
      />

      <Box marginBottom={1}>
        <Text>
          Last sync: <Text color="cyan">{formatLastSync(lastSync)}</Text>
        </Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text bold color="white">
          Quick Stats
        </Text>
        <Box>
          <Text>
            <Text color="cyan">{stats?.totalBookmarks ?? 0}</Text> bookmarks ·{" "}
            <Text color="green">{stats?.totalTopics ?? 0}</Text> topics
          </Text>
        </Box>
      </Box>

      <Box marginBottom={1}>
        <Text bold color="white">
          Navigation
        </Text>
      </Box>
      <Menu
        items={menuItems}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        onActivate={handleActivate}
      />

      <StatusBar hint="j/k or arrows to navigate · Enter or number to select · q to quit" />
    </Box>
  );
}
