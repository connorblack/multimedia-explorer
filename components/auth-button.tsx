"use client";

import { useState, useEffect } from "react";
import { generateCodeVerifier, generateCodeChallenge } from "@/lib/oauth";

export default function AuthButton({
  apiKey,
  onLogin,
  onLogout,
}: {
  apiKey: string | null;
  onLogin: (key: string) => void;
  onLogout: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    const verifier = generateCodeVerifier();
    sessionStorage.setItem("code_verifier", verifier);

    const challenge = await generateCodeChallenge(verifier);
    const callbackUrl = `${window.location.origin}/callback`;

    const params = new URLSearchParams({
      callback_url: callbackUrl,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    window.location.href = `https://openrouter.ai/auth?${params.toString()}`;
  }

  function handleLogout() {
    onLogout();
  }

  if (apiKey) {
    return (
      <button
        onClick={handleLogout}
        className="px-4 py-2 text-sm rounded-lg border border-border text-muted hover:text-foreground hover:border-accent transition-colors cursor-pointer"
      >
        Sign out
      </button>
    );
  }

  return (
    <button
      onClick={handleLogin}
      disabled={loading}
      className="px-4 py-2 text-sm font-medium rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 cursor-pointer"
    >
      {loading ? "Redirecting..." : "Sign in with OpenRouter"}
    </button>
  );
}
