"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

function CallbackHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function exchangeCode() {
      const code = searchParams.get("code");
      if (!code) {
        setError("No authorization code received");
        return;
      }

      const codeVerifier = sessionStorage.getItem("code_verifier");
      if (!codeVerifier) {
        setError("No code verifier found. Please try signing in again.");
        return;
      }

      try {
        const response = await fetch(
          "https://openrouter.ai/api/v1/auth/keys",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code,
              code_verifier: codeVerifier,
              code_challenge_method: "S256",
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`Auth exchange failed: ${response.status}`);
        }

        const data = await response.json();
        const apiKey = data.key;

        if (!apiKey) {
          throw new Error("No API key in response");
        }

        localStorage.setItem("openrouter_api_key", apiKey);
        sessionStorage.removeItem("code_verifier");
        router.push("/");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to exchange code"
        );
      }
    }

    exchangeCode();
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-heading font-semibold text-red-400">
            Authentication Error
          </h1>
          <p className="text-muted">{error}</p>
          <a
            href="/"
            className="inline-block px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
          >
            Back to home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-muted">Completing sign in...</p>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
