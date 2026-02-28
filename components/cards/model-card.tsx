"use client";

import { MODELS } from "@/lib/types";

export function ModelCardHeader({ model }: { model: string }) {
  const selected = MODELS.find((m) => m.id === model);
  return (
    <div>
      <div className="text-sm font-medium">Model</div>
      <div className="text-xs text-muted truncate mt-1">{selected?.label ?? model}</div>
    </div>
  );
}

export function ModelCardBody({
  model,
  onModelChange,
}: {
  model: string;
  onModelChange: (model: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5">
        Model
      </label>
      <select
        value={model}
        onChange={(e) => onModelChange(e.target.value)}
        className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent transition-colors cursor-pointer"
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}
