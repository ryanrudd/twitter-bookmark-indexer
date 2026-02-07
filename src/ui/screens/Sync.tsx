import React, { useEffect, useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { Header } from "../components/Header";
import { StatusBar } from "../components/StatusBar";
import {
  isAuthenticated,
  getAuthorizationUrl,
  startCallbackServer,
  exchangeCodeForToken,
  logout,
} from "../../twitter/auth";
import { syncBookmarks, getLastSyncTime, type SyncProgress, type SyncResult } from "../../twitter/sync";

interface SyncProps {
  onBack: () => void;
}

type SyncState = "idle" | "connecting" | "syncing" | "complete" | "error";

export function Sync({ onBack }: SyncProps) {
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [auth, sync] = await Promise.all([
          isAuthenticated(),
          getLastSyncTime(),
        ]);
        setAuthenticated(auth);
        setLastSync(sync);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleConnect = useCallback(async () => {
    setSyncState("connecting");
    setError(undefined);
    try {
      const { url, state } = getAuthorizationUrl();
      console.log(`\nOpen this URL in your browser:\n${url}\n`);

      const code = await startCallbackServer(state);
      await exchangeCodeForToken(code);

      setAuthenticated(true);
      setSyncState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setSyncState("error");
    }
  }, []);

  const handleSync = useCallback(async () => {
    if (!authenticated) return;

    setSyncState("syncing");
    setError(undefined);
    setProgress(null);
    setResult(null);

    try {
      const syncResult = await syncBookmarks((p) => setProgress(p));
      setResult(syncResult);
      setLastSync(syncResult.syncedAt);
      setSyncState("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
      setSyncState("error");
    }
  }, [authenticated]);

  const handleDisconnect = useCallback(async () => {
    await logout();
    setAuthenticated(false);
    setSyncState("idle");
  }, []);

  useInput((input, key) => {
    if (syncState === "syncing" || syncState === "connecting") {
      return; // Don't allow navigation during sync
    }

    if (key.escape || input === "b") {
      onBack();
    } else if (input === "c" && !authenticated) {
      handleConnect();
    } else if (input === "s" && authenticated) {
      handleSync();
    } else if (input === "d" && authenticated) {
      handleDisconnect();
    }
  });

  const formatLastSync = (date: string | null) => {
    if (!date) return "Never";
    return new Date(date).toLocaleString();
  };

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Sync" />
        <Text color="yellow">Loading...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Sync" subtitle="Twitter connection & bookmark sync" />

      <Box marginBottom={1} flexDirection="column">
        <Text>
          Status:{" "}
          <Text color={authenticated ? "green" : "yellow"}>
            {authenticated ? "Connected" : "Not connected"}
          </Text>
        </Text>
        <Text>
          Last sync: <Text color="cyan">{formatLastSync(lastSync)}</Text>
        </Text>
      </Box>

      {syncState === "connecting" && (
        <Box marginY={1}>
          <Text color="yellow">
            Waiting for authorization... Check your browser.
          </Text>
        </Box>
      )}

      {syncState === "syncing" && progress && (
        <Box marginY={1} flexDirection="column">
          <Text color="yellow">
            {progress.phase === "fetching"
              ? `Fetching bookmarks... ${progress.fetched}`
              : `Saving... ${progress.saved}/${progress.total}`}
          </Text>
        </Box>
      )}

      {syncState === "complete" && result && (
        <Box marginY={1} flexDirection="column">
          <Text color="green">Sync complete!</Text>
          <Text>
            New: {result.newBookmarks} · Updated: {result.updatedBookmarks} · Total: {result.totalBookmarks}
          </Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text bold>Actions</Text>
        {!authenticated ? (
          <Text>
            <Text color="cyan">[c]</Text> Connect Twitter account
          </Text>
        ) : (
          <>
            <Text>
              <Text color="cyan">[s]</Text> Sync bookmarks now
            </Text>
            <Text>
              <Text color="red">[d]</Text> Disconnect account
            </Text>
          </>
        )}
      </Box>

      <StatusBar
        error={error}
        hint={syncState === "syncing" ? "Syncing..." : "b to go back"}
      />
    </Box>
  );
}
