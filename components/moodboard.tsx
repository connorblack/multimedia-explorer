"use client";

import { useState } from "react";
import AuthPrompt from "./auth-prompt";

export interface BrandData {
  colors: string[];
  personality: string[];
  visualStyle: string[];
  tone: string;
  stylePrompt: string;
}

export default function Moodboard({
  apiKey,
  brandData,
  onBrandData,
  onAuthNeeded,
}: {
  apiKey: string | null;
  brandData: BrandData | null;
  onBrandData: (data: BrandData | null) => void;
  onAuthNeeded: (key: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    if (!apiKey) {
      setShowAuthPrompt(true);
      return;
    }

    setShowAuthPrompt(false);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/moodboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to analyze brand");
      }

      const data: BrandData = await res.json();
      onBrandData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-heading font-semibold">Moodboard</h2>
        {brandData && (
          <button
            onClick={() => onBrandData(null)}
            className="text-xs text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter a company URL (e.g. https://stripe.com)"
          className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
              Analyzing
            </span>
          ) : (
            "Analyze"
          )}
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {showAuthPrompt && <AuthPrompt onAuthNeeded={onAuthNeeded} onDismiss={() => setShowAuthPrompt(false)} />}

      {brandData && (
        <div className="p-4 bg-surface border border-border rounded-lg space-y-4">
          {/* Color palette */}
          <div>
            <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
              Color Palette
            </h3>
            <div className="flex gap-2 flex-wrap">
              {brandData.colors.map((color, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div
                    className="w-6 h-6 rounded-md border border-border"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs text-muted font-mono">{color}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Personality */}
          <div>
            <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
              Brand Personality
            </h3>
            <div className="flex gap-1.5 flex-wrap">
              {brandData.personality.map((trait, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 text-xs bg-accent/10 text-accent rounded-full"
                >
                  {trait}
                </span>
              ))}
            </div>
          </div>

          {/* Visual style */}
          <div>
            <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
              Visual Style
            </h3>
            <div className="flex gap-1.5 flex-wrap">
              {brandData.visualStyle.map((style, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 text-xs bg-surface-hover text-foreground border border-border rounded-full"
                >
                  {style}
                </span>
              ))}
            </div>
          </div>

          {/* Tone */}
          <div>
            <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
              Tone
            </h3>
            <p className="text-sm text-foreground/80">{brandData.tone}</p>
          </div>

          {/* Style prompt */}
          <div>
            <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
              Generated Style Prompt
            </h3>
            <p className="text-sm text-accent/90 italic">
              &ldquo;{brandData.stylePrompt}&rdquo;
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
