import React, { useEffect, useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { Header } from "../components/Header";
import { StatusBar } from "../components/StatusBar";
import { getItemsByType, updateItemStatus, type Item } from "../../db/queries";

interface TasksProps {
  onBack: () => void;
}

type FilterType = "all" | "pending" | "done";

export function Tasks({ onBack }: TasksProps) {
  const [tasks, setTasks] = useState<Item[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState<FilterType>("pending");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | undefined>();

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getItemsByType("task");
      const filtered =
        filter === "all"
          ? data
          : data.filter((t) => t.status === filter);
      setTasks(filtered);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const toggleTaskStatus = async () => {
    const task = tasks[selectedIndex];
    if (!task) return;

    const newStatus = task.status === "pending" ? "done" : "pending";
    await updateItemStatus(task.id, newStatus);
    setMessage(`Task marked as ${newStatus}`);
    setTimeout(() => setMessage(undefined), 2000);
    loadTasks();
  };

  useInput((input, key) => {
    if (key.escape || input === "b") {
      onBack();
    } else if (key.upArrow || input === "k") {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex(Math.min(tasks.length - 1, selectedIndex + 1));
    } else if (input === " " || key.return) {
      toggleTaskStatus();
    } else if (input === "1") {
      setFilter("pending");
      setSelectedIndex(0);
    } else if (input === "2") {
      setFilter("done");
      setSelectedIndex(0);
    } else if (input === "3") {
      setFilter("all");
      setSelectedIndex(0);
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Header title="Tasks" />
        <Text color="yellow">Loading...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="Tasks" subtitle="Extracted action items from bookmarks" />

      <Box marginBottom={1}>
        <Text>
          Filter:{" "}
          <Text color={filter === "pending" ? "green" : "gray"}>[1] Pending</Text>{" "}
          <Text color={filter === "done" ? "green" : "gray"}>[2] Done</Text>{" "}
          <Text color={filter === "all" ? "green" : "gray"}>[3] All</Text>
        </Text>
      </Box>

      {tasks.length === 0 ? (
        <Text color="gray">
          No tasks found. Run analysis to extract tasks from bookmarks.
        </Text>
      ) : (
        <Box flexDirection="column">
          {tasks.map((task, index) => (
            <Box key={task.id} marginBottom={1}>
              <Text
                color={index === selectedIndex ? "green" : undefined}
                bold={index === selectedIndex}
              >
                {index === selectedIndex ? ">" : " "}
                {task.status === "done" ? "[x]" : "[ ]"} {task.title}
              </Text>
              {task.description && index === selectedIndex && (
                <Box marginLeft={4}>
                  <Text color="gray" wrap="wrap">
                    {task.description}
                  </Text>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}

      <StatusBar
        message={message}
        hint="j/k navigate · Space/Enter toggle · 1/2/3 filter · b back"
      />
    </Box>
  );
}
