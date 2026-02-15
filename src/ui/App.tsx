import React, { useState, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { initDb } from "../db/client";
import { Home } from "./screens/Home";
import { Bookmarks } from "./screens/Bookmarks";
import { Topics } from "./screens/Topics";
import { Sync } from "./screens/Sync";
import { Analyze } from "./screens/Analyze";

type Screen = "home" | "bookmarks" | "topics" | "sync" | "analyze";

export function App() {
  const { exit } = useApp();
  const [currentScreen, setCurrentScreen] = useState<Screen>("home");
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        await initDb();
        setDbReady(true);
      } catch (err) {
        setDbError(err instanceof Error ? err.message : "Database init failed");
      }
    }
    init();
  }, []);

  useInput((input) => {
    if (input === "q" && currentScreen === "home") {
      exit();
    }
  });

  const handleNavigate = (screen: string) => {
    setCurrentScreen(screen as Screen);
  };

  const handleBack = () => {
    setCurrentScreen("home");
  };

  if (dbError) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Database Error: {dbError}</Text>
        <Text color="gray">Press Ctrl+C to exit</Text>
      </Box>
    );
  }

  if (!dbReady) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">Initializing database...</Text>
      </Box>
    );
  }

  switch (currentScreen) {
    case "home":
      return <Home onNavigate={handleNavigate} />;
    case "bookmarks":
      return <Bookmarks onBack={handleBack} />;
    case "topics":
      return <Topics onBack={handleBack} />;
    case "sync":
      return <Sync onBack={handleBack} />;
    case "analyze":
      return <Analyze onBack={handleBack} />;
    default:
      return <Home onNavigate={handleNavigate} />;
  }
}
