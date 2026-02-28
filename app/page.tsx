"use client";

import { useState, useEffect } from "react";
import AuthButton from "@/components/auth-button";
import Moodboard, { type BrandData } from "@/components/moodboard";
import GenerateForm from "@/components/generate-form";
import ImageResult from "@/components/image-result";

export default function Home() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [brandData, setBrandData] = useState<BrandData | null>(null);
  const [imageResult, setImageResult] = useState<{
    imageUrl: string;
    model: string;
  } | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const envKey = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
    if (envKey) {
      setApiKey(envKey);
    } else {
      const storedKey = localStorage.getItem("openrouter_api_key");
      if (storedKey) setApiKey(storedKey);
    }

    const storedBrand = localStorage.getItem("moodboard_data");
    if (storedBrand) {
      try {
        setBrandData(JSON.parse(storedBrand));
      } catch {}
    }
  }, []);

  function handleLogin(key: string) {
    localStorage.setItem("openrouter_api_key", key);
    setApiKey(key);
  }

  function handleLogout() {
    localStorage.removeItem("openrouter_api_key");
    setApiKey(null);
    setBrandData(null);
    setImageResult(null);
  }

  function handleBrandData(data: BrandData | null) {
    setBrandData(data);
    if (data) {
      localStorage.setItem("moodboard_data", JSON.stringify(data));
    } else {
      localStorage.removeItem("moodboard_data");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="text-white"
              >
                <path
                  d="M2 4l6-3 6 3v8l-6 3-6-3V4z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 7v6M2 4l6 3 6-3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="text-lg font-heading font-semibold">
              Media Playground
            </h1>
          </div>

          <AuthButton
            apiKey={apiKey}
            onLogin={handleLogin}
            onLogout={handleLogout}
          />
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="space-y-8">
          {/* Moodboard section */}
          <section className="p-6 bg-surface/50 border border-border rounded-xl">
            <Moodboard
              apiKey={apiKey}
              brandData={brandData}
              onBrandData={handleBrandData}
              onAuthNeeded={handleLogin}
            />
          </section>

          {/* Generate section */}
          <section className="p-6 bg-surface/50 border border-border rounded-xl">
            <GenerateForm
              apiKey={apiKey}
              brandData={brandData}
              onResult={setImageResult}
              onLoading={setGenerating}
              onAuthNeeded={handleLogin}
            />
          </section>

          {/* Result section */}
          {(imageResult || generating) && (
            <section className="p-6 bg-surface/50 border border-border rounded-xl">
              <ImageResult result={imageResult} loading={generating} />
            </section>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between text-xs text-muted">
          <span>
            Built with{" "}
            <a
              href="https://openrouter.ai"
              className="text-accent hover:text-accent-hover transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenRouter
            </a>
          </span>
          <span>
            <a
              href="https://github.com/openrouter"
              className="hover:text-foreground transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
