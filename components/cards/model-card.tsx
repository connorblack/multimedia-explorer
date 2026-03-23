"use client";

import type { ModelOption } from "@/hooks/use-models";

export function ModelCardHeader({
  model,
  imageModels,
  videoModels,
}: {
  model: string;
  imageModels: ModelOption[];
  videoModels?: ModelOption[];
}) {
  const selected = [...imageModels, ...(videoModels ?? [])].find((m) => m.id === model);
  return (
    <div>
      <div className="text-sm font-medium">Select Image or Video Model</div>
      <div className="text-xs text-muted truncate mt-1">{selected?.label ?? model}</div>
    </div>
  );
}

export function ModelCardBody({
  model,
  onModelChange,
  imageModels,
  videoModels,
  loading,
}: {
  model: string;
  onModelChange: (model: string) => void;
  imageModels: ModelOption[];
  videoModels: ModelOption[];
  loading: boolean;
}) {
  return (
    <div>
      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5">
          Select Image or Video Model
        </label>
        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={loading}
          className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading && <option>Loading models…</option>}
          <optgroup label="Video Models">
            {videoModels.length === 0 ? (
              <option disabled>No video models available</option>
            ) : (
              videoModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))
            )}
          </optgroup>
          <optgroup label="Image Models">
            {imageModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
    </div>
  );
}
