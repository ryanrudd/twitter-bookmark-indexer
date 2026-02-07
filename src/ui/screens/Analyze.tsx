import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { Header } from "../components/Header";
import { StatusBar } from "../components/StatusBar";
import { isClaudeConfigured } from "../../analysis/claude";
import {
  clusterUnanalyzedBookmarks,
  type ClusterProgress,
  type ClusterResult,
} from "../../analysis/cluster";
import {
  extractFromNewBookmarks,
  type ExtractProgress,
  type ExtractResult,
} from "../../analysis/extract";

interface AnalyzeProps {
  onBack: () => void;
}

type AnalyzeState = "idle" | "clustering" | "extracting" | "complete" | "error";

export function Analyze({ onBack }: AnalyzeProps) {
  const [configured] = useState(isClaudeConfigured());
  const [state, setState] = useState<AnalyzeState>("idle");
  const [clusterProgress, setClusterProgress] = useState<ClusterProgress | null>(null);
  const [extractProgress, setExtractProgress] = useState<ExtractProgress | null>(null);
  const [clusterResult, setClusterResult] = useState<ClusterResult | null>(null);
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);
  const [error, setError] = useState<string | undefined>();

  const handleCluster = useCallback(async () => {
    if (!configured) return;

    setState("clustering");
    setError(undefined);
    setClusterProgress(null);
    setClusterResult(null);

    try {
      const result = await clusterUnanalyzedBookmarks((p) =>
        setClusterProgress(p)
      );
      setClusterResult(result);
      setState("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clustering failed");
      setState("error");
    }
  }, [configured]);

  const handleExtract = useCallback(async () => {
    if (!configured) return;

    setState("extracting");
    setError(undefined);
    setExtractProgress(null);
    setExtractResult(null);

    try {
      const result = await extractFromNewBookmarks((p) =>
        setExtractProgress(p)
      );
      setExtractResult(result);
      setState("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
      setState("error");
    }
  }, [configured]);

  const handleAll = useCallback(async () => {
    if (!configured) return;

    setState("clustering");
    setError(undefined);

    try {
      const clusterRes = await clusterUnanalyzedBookmarks((p) =>
        setClusterProgress(p)
      );
      setClusterResult(clusterRes);

      setState("extracting");
      const extractRes = await extractFromNewBookmarks((p) =>
        setExtractProgress(p)
      );
      setExtractResult(extractRes);

      setState("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setState("error");
    }
  }, [configured]);

  useInput((input, key) => {
    if (state === "clustering" || state === "extracting") {
      return; // Don't allow navigation during analysis
    }

    if (key.escape || input === "b") {
      onBack();
    } else if (input === "1" && configured) {
      handleCluster();
    } else if (input === "2" && configured) {
      handleExtract();
    } else if (input === "3" && configured) {
      handleAll();
    }
  });

  if (!configured) {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Analyze" subtitle="AI-powered analysis" />
        <Text color="red">
          ANTHROPIC_API_KEY not configured. Add it to your .env file.
        </Text>
        <StatusBar hint="b to go back" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Analyze" subtitle="AI-powered bookmark analysis" />

      {state === "idle" && (
        <Box flexDirection="column">
          <Text bold>Analysis Options</Text>
          <Text>
            <Text color="cyan">[1]</Text> Cluster topics - Group bookmarks by topic
          </Text>
          <Text>
            <Text color="cyan">[2]</Text> Extract items - Find tasks, ideas, resources
          </Text>
          <Text>
            <Text color="cyan">[3]</Text> Run all - Complete analysis
          </Text>
        </Box>
      )}

      {state === "clustering" && clusterProgress && (
        <Box flexDirection="column">
          <Text color="yellow">
            Clustering bookmarks... {clusterProgress.phase}
          </Text>
          <Text>
            {clusterProgress.processed}/{clusterProgress.total} processed
          </Text>
        </Box>
      )}

      {state === "extracting" && extractProgress && (
        <Box flexDirection="column">
          <Text color="yellow">
            Extracting items... {extractProgress.phase}
          </Text>
          <Text>
            {extractProgress.processed}/{extractProgress.total} processed
          </Text>
        </Box>
      )}

      {state === "complete" && (
        <Box flexDirection="column">
          <Text color="green">Analysis complete!</Text>
          {clusterResult && (
            <Text>
              Topics: {clusterResult.topicsCreated} created, {clusterResult.topicsAssigned} assigned
            </Text>
          )}
          {extractResult && (
            <Text>
              Extracted: {extractResult.tasksCreated} tasks, {extractResult.ideasCreated} ideas, {extractResult.resourcesCreated} resources
            </Text>
          )}
        </Box>
      )}

      <StatusBar
        error={error}
        hint={
          state === "clustering" || state === "extracting"
            ? "Analyzing..."
            : "1/2/3 to analyze · b back"
        }
      />
    </Box>
  );
}
