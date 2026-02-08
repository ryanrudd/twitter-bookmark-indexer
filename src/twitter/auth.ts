import { randomBytes, createHash } from "crypto";

const TWITTER_AUTH_URL = "https://twitter.com/i/oauth2/authorize";
const TWITTER_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const REDIRECT_URI = "http://localhost:3000/callback";
const SCOPES = ["bookmark.read", "tweet.read", "users.read", "offline.access"];

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

let tokenData: TokenData | null = null;
let pkceVerifier: string | null = null;

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function generateState(): string {
  return randomBytes(16).toString("hex");
}

export function getAuthorizationUrl(): { url: string; state: string } {
  pkceVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(pkceVerifier);
  const state = generateState();

  const clientId = process.env.TWITTER_CLIENT_ID;
  if (!clientId) {
    throw new Error("TWITTER_CLIENT_ID environment variable is required");
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const url = `${TWITTER_AUTH_URL}?${params.toString()}`;

  console.log("\n[Debug] OAuth Configuration:");
  console.log(`  Client ID: ${clientId.slice(0, 8)}...`);
  console.log(`  Redirect URI: ${REDIRECT_URI}`);
  console.log(`  Scopes: ${SCOPES.join(", ")}`);
  console.log("");

  return { url, state };
}

export async function exchangeCodeForToken(code: string): Promise<TokenData> {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;

  if (!clientId) {
    throw new Error("TWITTER_CLIENT_ID environment variable is required");
  }
  if (!pkceVerifier) {
    throw new Error("No PKCE verifier found. Start authorization flow first.");
  }

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: pkceVerifier,
    client_id: clientId,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  // If client secret is provided, use basic auth
  if (clientSecret) {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    headers["Authorization"] = `Basic ${credentials}`;
  }

  const response = await fetch(TWITTER_TOKEN_URL, {
    method: "POST",
    headers,
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  tokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  // Save tokens to file
  await saveTokens(tokenData);
  pkceVerifier = null;

  return tokenData;
}

export async function refreshAccessToken(): Promise<TokenData> {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;

  if (!clientId) {
    throw new Error("TWITTER_CLIENT_ID environment variable is required");
  }

  const currentTokens = await loadTokens();
  if (!currentTokens?.refresh_token) {
    throw new Error("No refresh token available. Re-authorize the app.");
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: currentTokens.refresh_token,
    client_id: clientId,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (clientSecret) {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    headers["Authorization"] = `Basic ${credentials}`;
  }

  const response = await fetch(TWITTER_TOKEN_URL, {
    method: "POST",
    headers,
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  tokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || currentTokens.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  await saveTokens(tokenData);
  return tokenData;
}

export async function getAccessToken(): Promise<string> {
  let tokens = tokenData || (await loadTokens());

  if (!tokens) {
    throw new Error("Not authenticated. Please authorize the app first.");
  }

  // Refresh if token expires in less than 5 minutes
  if (tokens.expires_at - Date.now() < 5 * 60 * 1000) {
    tokens = await refreshAccessToken();
  }

  return tokens.access_token;
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const tokens = await loadTokens();
    return tokens !== null;
  } catch {
    return false;
  }
}

async function saveTokens(tokens: TokenData): Promise<void> {
  const file = Bun.file(".twitter-tokens.json");
  await Bun.write(file, JSON.stringify(tokens, null, 2));
}

async function loadTokens(): Promise<TokenData | null> {
  try {
    const file = Bun.file(".twitter-tokens.json");
    if (!(await file.exists())) {
      return null;
    }
    const data = await file.json();
    tokenData = data as TokenData;
    return tokenData;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  tokenData = null;
  try {
    const file = Bun.file(".twitter-tokens.json");
    if (await file.exists()) {
      await Bun.write(file, "");
    }
  } catch {
    // Ignore errors
  }
}

// Start a local server to handle OAuth callback
export function startCallbackServer(
  expectedState: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = Bun.serve({
      port: 3000,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/callback") {
          const code = url.searchParams.get("code");
          const state = url.searchParams.get("state");
          const error = url.searchParams.get("error");

          if (error) {
            server.stop();
            reject(new Error(`OAuth error: ${error}`));
            return new Response(
              "<html><body><h1>Authorization Failed</h1><p>You can close this window.</p></body></html>",
              { headers: { "Content-Type": "text/html" } }
            );
          }

          if (state !== expectedState) {
            server.stop();
            reject(new Error("Invalid state parameter"));
            return new Response(
              "<html><body><h1>Invalid State</h1><p>Authorization failed due to state mismatch.</p></body></html>",
              { headers: { "Content-Type": "text/html" } }
            );
          }

          if (!code) {
            server.stop();
            reject(new Error("No authorization code received"));
            return new Response(
              "<html><body><h1>No Code</h1><p>No authorization code received.</p></body></html>",
              { headers: { "Content-Type": "text/html" } }
            );
          }

          server.stop();
          resolve(code);
          return new Response(
            "<html><body><h1>Success!</h1><p>Authorization complete. You can close this window and return to the app.</p></body></html>",
            { headers: { "Content-Type": "text/html" } }
          );
        }

        return new Response("Not Found", { status: 404 });
      },
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.stop();
      reject(new Error("Authorization timeout"));
    }, 5 * 60 * 1000);
  });
}
