import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  message?: string;
  error?: string;
  hint?: string;
}

export function StatusBar({ message, error, hint }: StatusBarProps) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">{"─".repeat(50)}</Text>
      {error && <Text color="red">{error}</Text>}
      {message && <Text color="yellow">{message}</Text>}
      {hint && (
        <Text color="gray" dimColor>
          {hint}
        </Text>
      )}
    </Box>
  );
}
