"use client";

import { useState } from "react";
import type { BrandData } from "./moodboard";
import AuthPrompt from "./auth-prompt";

const MODELS = [
  { id: "google/gemini-3.1-flash-image-preview", label: "Nano Banana 2 (Gemini 3.1 Flash)" },
  { id: "google/gemini-3-pro-image-preview", label: "Nano Banana Pro (Gemini 3 Pro)" },
  { id: "google/gemini-2.5-flash-image", label: "Nano Banana (Gemini 2.5 Flash)" },
  { id: "openai/gpt-5-image", label: "GPT-5 Image" },
  { id: "openai/gpt-5-image-mini", label: "GPT-5 Image Mini" },
  { id: "black-forest-labs/flux.2-max", label: "FLUX.2 Max" },
  { id: "black-forest-labs/flux.2-pro", label: "FLUX.2 Pro" },
  { id: "black-forest-labs/flux.2-flex", label: "FLUX.2 Flex" },
  { id: "black-forest-labs/flux.2-klein-4b", label: "FLUX.2 Klein 4B" },
  { id: "bytedance-seed/seedream-4.5", label: "Seedream 4.5" },
  { id: "sourceful/riverflow-v2-pro", label: "Riverflow V2 Pro" },
  { id: "sourceful/riverflow-v2-fast", label: "Riverflow V2 Fast" },
  { id: "sourceful/riverflow-v2-max-preview", label: "Riverflow V2 Max Preview" },
  { id: "sourceful/riverflow-v2-standard-preview", label: "Riverflow V2 Standard Preview" },
  { id: "sourceful/riverflow-v2-fast-preview", label: "Riverflow V2 Fast Preview" },
];

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:2"];
const RESOLUTIONS = ["1K", "2K"];

export default function GenerateForm({
  apiKey,
  brandData,
  onResult,
  onLoading,
  onAuthNeeded,
}: {
  apiKey: string | null;
  brandData: BrandData | null;
  onResult: (result: { imageUrl: string; model: string } | null) => void;
  onLoading: (loading: boolean) => void;
  onAuthNeeded: (key: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [resolution, setResolution] = useState("1K");
  const [loading, setLoadingState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;

    if (!apiKey) {
      setShowAuthPrompt(true);
      return;
    }

    setShowAuthPrompt(false);
    setLoadingState(true);
    onLoading(true);
    setError(null);
    onResult(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          brandContext: brandData ?? undefined,
          model,
          aspectRatio,
          resolution,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate image");
      }

      onResult({ imageUrl: data.imageUrl, model: data.model });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoadingState(false);
      onLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-heading font-semibold">Generate Image</h2>

      <form onSubmit={handleGenerate} className="space-y-4">
        {/* Prompt */}
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5">
            Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the image you want to generate..."
            rows={3}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors resize-none"
          />
        </div>

        {/* Brand context indicator */}
        {brandData && prompt.trim() && (
          <div className="p-3 bg-accent/5 border border-accent/20 rounded-lg space-y-1">
            <p className="text-xs text-muted">Brand context will be applied:</p>
            <p className="text-sm text-accent/90 italic">&ldquo;{brandData.stylePrompt}&rdquo;</p>
          </div>
        )}

        {/* Model selector */}
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5">
            Model
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent transition-colors cursor-pointer"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Aspect ratio and resolution */}
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5">
              Aspect Ratio
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setAspectRatio(ratio)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
                    aspectRatio === ratio
                      ? "bg-accent text-white border-accent"
                      : "bg-surface border-border text-muted hover:text-foreground hover:border-accent/50"
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5">
              Resolution
            </label>
            <div className="flex gap-1.5">
              {RESOLUTIONS.map((res) => (
                <button
                  key={res}
                  type="button"
                  onClick={() => setResolution(res)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
                    resolution === res
                      ? "bg-accent text-white border-accent"
                      : "bg-surface border-border text-muted hover:text-foreground hover:border-accent/50"
                  }`}
                >
                  {res}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {showAuthPrompt && <AuthPrompt onAuthNeeded={onAuthNeeded} onDismiss={() => setShowAuthPrompt(false)} />}

        {/* Generate button */}
        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="w-full py-2.5 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Generating...
            </span>
          ) : (
            "Generate"
          )}
        </button>
      </form>
    </div>
  );
}
