import React from "react";
import { render } from "ink";
import { App } from "./ui/App";

const LOGO = `
    \\
     \\  >  )
      \\/  /
      / \\_/
     /
    /
   ─────────────────────────

   BIRDBRAIN
   Twitter Bookmark Indexer

   ─────────────────────────
`;

async function main() {
  // Check if we're in a TTY (interactive terminal)
  if (!process.stdin.isTTY) {
    console.log(LOGO);
    console.log("Note: Run this in an interactive terminal for the full TUI experience.");
    console.log("");
    console.log("Usage:");
    console.log("  bun run start     Launch interactive TUI");
    console.log("");
    console.log("Environment variables needed:");
    console.log("  TWITTER_CLIENT_ID       Your Twitter OAuth 2.0 client ID");
    console.log("  TWITTER_CLIENT_SECRET   Your Twitter OAuth 2.0 client secret");
    console.log("  ANTHROPIC_API_KEY       Your Anthropic API key for Claude");
    console.log("");
    console.log("Optional:");
    console.log("  TURSO_DATABASE_URL      Remote Turso database URL");
    console.log("  TURSO_AUTH_TOKEN        Turso auth token");
    return;
  }

  // Clear the screen and show our TUI
  console.clear();
  render(React.createElement(App));
}

main().catch(console.error);
