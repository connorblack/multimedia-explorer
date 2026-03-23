"use client";

import { useState } from "react";
import type { HistoryEntry } from "@/lib/types";

export default function HistoryTimeline({
  entries,
  activeId,
  onSelect,
  onReturnToCurrent,
}: {
  entries: HistoryEntry[];
  activeId: string | null;
  onSelect: (entry: HistoryEntry) => void;
  onReturnToCurrent: () => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col items-center pt-1">
      <span className="text-[9px] uppercase tracking-wider text-muted mb-2">History</span>

      {/* Current / return-to-top dot */}
      <button
        type="button"
        onClick={onReturnToCurrent}
        className={`w-3 h-3 rounded-full border-2 border-accent hover:scale-125 transition-all cursor-pointer ${
          activeId === null ? "bg-accent ring-2 ring-accent/30" : "bg-accent/40"
        }`}
        title="Current"
      />

      {entries.length > 0 && (
        <>
          {/* Divider */}
          <div className="w-px h-2 bg-border mt-2" />

          {/* History dots (newest first) */}
          <div className="flex flex-col items-center mt-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="relative flex items-center justify-center py-[5px] px-2 cursor-pointer"
                onMouseEnter={() => setHoveredId(entry.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => onSelect(entry)}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    activeId === entry.id
                      ? "bg-accent scale-125 ring-2 ring-accent/30"
                      : hoveredId === entry.id
                        ? "bg-muted scale-125"
                        : "bg-border"
                  }`}
                />

                {/* Thumbnail popover */}
                {hoveredId === entry.id && entry.imageUrl && (
                  <div className="absolute top-1/2 right-full mr-2 -translate-y-1/2 z-50 w-[6.5rem] p-1 bg-surface border border-border rounded-lg shadow-lg">
                    <img
                      src={entry.imageUrl}
                      alt="History thumbnail"
                      className="w-24 h-24 object-cover rounded"
                    />
                  </div>
                )}
                {hoveredId === entry.id && !entry.imageUrl && entry.mediaType === "video" && (
                  <div className="absolute top-1/2 right-full mr-2 -translate-y-1/2 z-50 w-[6.5rem] p-1 bg-surface border border-border rounded-lg shadow-lg flex items-center justify-center">
                    <div className="w-24 h-24 flex flex-col items-center justify-center text-muted">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                        <line x1="7" y1="2" x2="7" y2="22" />
                        <line x1="17" y1="2" x2="17" y2="22" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <line x1="2" y1="7" x2="7" y2="7" />
                        <line x1="2" y1="17" x2="7" y2="17" />
                        <line x1="17" y1="7" x2="22" y2="7" />
                        <line x1="17" y1="17" x2="22" y2="17" />
                      </svg>
                      <span className="text-[9px] mt-1">Video</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
