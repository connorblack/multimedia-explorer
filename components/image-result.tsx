"use client";

import { useState, useEffect } from "react";
import type { MediaResult } from "@/lib/types";
import type { VideoStatus } from "@/hooks/use-video-generation";

const VIDEO_STATUS_MESSAGES: Record<string, string> = {
  submitting: "Submitting video job…",
  pending: "Video queued for processing…",
  in_progress: "Generating your video…",
};

export default function ImageResult({
  result,
  loading,
  onAddAsInputImage,
  videoStatus,
  videoError,
}: {
  result: MediaResult | null;
  loading: boolean;
  onAddAsInputImage?: (url: string) => void;
  videoStatus?: VideoStatus;
  videoError?: string | null;
}) {
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setAdded(false);
  }, [loading, result]);

  const isVideoGenerating =
    videoStatus === "submitting" ||
    videoStatus === "pending" ||
    videoStatus === "in_progress";

  if (loading || isVideoGenerating) {
    const message = isVideoGenerating
      ? VIDEO_STATUS_MESSAGES[videoStatus!] ?? "Generating…"
      : "Generating your image…";

    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted">{message}</p>
      </div>
    );
  }

  if (videoStatus === "failed" && videoError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <p className="text-sm text-red-400">{videoError}</p>
      </div>
    );
  }

  if (!result) return null;

  const isVideo = result.type === "video";

  function handleDownload() {
    if (!result) return;

    const link = document.createElement("a");
    if (result.type === "image") {
      link.href = result.imageUrl;
      link.download = `media-playground-${Date.now()}.png`;
    } else {
      link.href = result.videoUrl;
      link.download = `media-playground-${Date.now()}.mp4`;
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const mediaUrl = result.type === "image" ? result.imageUrl : result.videoUrl;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-heading font-semibold">Result</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">{result.model}</span>
          {!isVideo && onAddAsInputImage && (
            <button
              onClick={() => {
                if (result.type === "image") {
                  onAddAsInputImage(result.imageUrl);
                  setAdded(true);
                }
              }}
              className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:border-accent hover:text-accent transition-colors cursor-pointer"
            >
              {added ? "Added as Input" : "Add as Input Image"}
            </button>
          )}
          <button
            onClick={handleDownload}
            className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:border-accent hover:text-accent transition-colors cursor-pointer"
          >
            Download
          </button>
        </div>
      </div>

      <div className="rounded-lg overflow-hidden border border-border bg-surface">
        {isVideo ? (
          <video
            src={mediaUrl}
            controls
            autoPlay
            loop
            className="w-full h-auto"
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={mediaUrl}
            alt="Generated image"
            className="w-full h-auto"
          />
        )}
      </div>
    </div>
  );
}
