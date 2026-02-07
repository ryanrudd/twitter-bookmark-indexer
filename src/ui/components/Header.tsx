import React from "react";
import { Box, Text } from "ink";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="cyan" bold>
          {title}
        </Text>
      </Box>
      {subtitle && (
        <Text color="gray" dimColor>
          {subtitle}
        </Text>
      )}
      <Text color="gray">{"─".repeat(50)}</Text>
    </Box>
  );
}
