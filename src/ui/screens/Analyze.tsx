import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { Header } from "../components/Header";
import { StatusBar } from "../components/StatusBar";
import {
  runFullAnalysis,
  generateEmbeddings,
  runClustering,
  type AnalysisProgress,
  type AnalysisResult,
} from "../../analysis/index";

interface AnalyzeProps {
  onBack: () => void;
}

type AnalyzeState = "idle" | "running" | "complete" | "error";

export function Analyze({ onBack }: AnalyzeProps) {
  const [state, setState] = useState<AnalyzeState>("idle");
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | undefined>();

  const handleFullAnalysis = useCallback(async () => {
    setState("running");
    setError(undefined);
    setProgress(null);
    setResult(null);

    try {
      const analysisResult = await runFullAnalysis((p) => setProgress(p));
      setResult(analysisResult);
      setState("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setState("error");
    }
  }, []);

  const handleEmbeddingsOnly = useCallback(async () => {
    setState("running");
    setError(undefined);
    setProgress(null);

    try {
      const count = await generateEmbeddings((p) => setProgress(p));
      setResult({
        embeddingsGenerated: count,
        clustersCreated: 0,
        ftsIndexed: 0,
      });
      setState("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Embedding failed");
      setState("error");
    }
  }, []);

  const handleClusteringOnly = useCallback(async () => {
    setState("running");
    setError(undefined);
    setProgress(null);

    try {
      const { clustersCreated, labels } = await runClustering(undefined, (p) =>
        setProgress(p)
      );
      setResult({
        embeddingsGenerated: 0,
        clustersCreated,
        ftsIndexed: 0,
      });
      setState("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clustering failed");
      setState("error");
    }
  }, []);

  useInput((input, key) => {
    if (state === "running") {
      return;
    }

    if (key.escape || input === "b") {
      onBack();
    } else if (input === "1") {
      handleFullAnalysis();
    } else if (input === "2") {
      handleEmbeddingsOnly();
    } else if (input === "3") {
      handleClusteringOnly();
    }
  });

  const getPhaseLabel = (phase: string) => {
    switch (phase) {
      case "embedding":
        return "Generating embeddings";
      case "clustering":
        return "Clustering topics";
      case "indexing":
        return "Building search index";
      case "complete":
        return "Complete";
      default:
        return phase;
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Analyze" subtitle="Local ML analysis (no API needed)" />

      {state === "idle" && (
        <Box flexDirection="column">
          <Text bold>Analysis Options</Text>
          <Text>
            <Text color="cyan">[1]</Text> Full analysis - embeddings + clustering + search index
          </Text>
          <Text>
            <Text color="cyan">[2]</Text> Embeddings only - vectorize new bookmarks
          </Text>
          <Text>
            <Text color="cyan">[3]</Text> Clustering only - regroup into topics
          </Text>
          <Box marginTop={1}>
            <Text color="gray">
              First run downloads the ML model (~25MB). Runs locally, no API keys needed.
            </Text>
          </Box>
        </Box>
      )}

      {state === "running" && progress && (
        <Box flexDirection="column">
          <Text color="yellow">{getPhaseLabel(progress.phase)}...</Text>
          {progress.total > 0 && (
            <Text>
              {progress.current}/{progress.total}
            </Text>
          )}
        </Box>
      )}

      {state === "complete" && result && (
        <Box flexDirection="column">
          <Text color="green">Analysis complete!</Text>
          {result.embeddingsGenerated > 0 && (
            <Text>Embeddings: {result.embeddingsGenerated} generated</Text>
          )}
          {result.clustersCreated > 0 && (
            <Text>Clusters: {result.clustersCreated} topics created</Text>
          )}
          {result.ftsIndexed > 0 && (
            <Text>Search index: {result.ftsIndexed} bookmarks indexed</Text>
          )}
        </Box>
      )}

      <StatusBar
        error={error}
        hint={state === "running" ? "Processing..." : "1/2/3 to analyze · b back"}
      />
    </Box>
  );
}
