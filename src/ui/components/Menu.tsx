import React from "react";
import { Box, Text, useInput } from "ink";

export interface MenuItem {
  key: string;
  label: string;
  description?: string;
}

interface MenuProps {
  items: MenuItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onActivate: (item: MenuItem) => void;
}

export function Menu({ items, selectedIndex, onSelect, onActivate }: MenuProps) {
  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      onSelect(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow || input === "j") {
      onSelect(Math.min(items.length - 1, selectedIndex + 1));
    } else if (key.return) {
      const item = items[selectedIndex];
      if (item) onActivate(item);
    } else {
      // Number keys for quick select
      const num = parseInt(input, 10);
      if (num >= 1 && num <= items.length) {
        onSelect(num - 1);
        const item = items[num - 1];
        if (item) onActivate(item);
      }
    }
  });

  return (
    <Box flexDirection="column">
      {items.map((item, index) => (
        <Box key={item.key}>
          <Text
            color={index === selectedIndex ? "green" : undefined}
            bold={index === selectedIndex}
          >
            {index === selectedIndex ? ">" : " "} {index + 1}. {item.label}
          </Text>
          {item.description && (
            <Text color="gray" dimColor>
              {" "}
              - {item.description}
            </Text>
          )}
        </Box>
      ))}
    </Box>
  );
}
