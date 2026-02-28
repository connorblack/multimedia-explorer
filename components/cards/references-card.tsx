"use client";

import { useState, useRef } from "react";
import type { ReferenceImage } from "@/lib/types";

export function ReferencesCardHeader({ images }: { images: ReferenceImage[] }) {
  return (
    <div>
      <div className="text-sm font-medium">Input Images</div>
      <div className="text-xs text-muted mt-1">
        {images.length > 0 ? `${images.length} image${images.length === 1 ? "" : "s"}` : "None"}
      </div>
    </div>
  );
}

export function ReferencesCardBody({
  images,
  onImagesChange,
}: {
  images: ReferenceImage[];
  onImagesChange: (images: ReferenceImage[]) => void;
}) {
  const [urlInput, setUrlInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addImage(img: ReferenceImage) {
    onImagesChange([...images, img]);
  }

  function removeImage(id: string) {
    onImagesChange(images.filter((img) => img.id !== id));
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        addImage({
          id: crypto.randomUUID(),
          url: reader.result as string,
          name: file.name,
        });
      };
      reader.readAsDataURL(file);
    });
  }

  function handleAddUrl() {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    addImage({
      id: crypto.randomUUID(),
      url: trimmed,
      name: new URL(trimmed).pathname.split("/").pop() || "image",
    });
    setUrlInput("");
  }

  return (
    <div className="space-y-3">
      {/* Thumbnail grid */}
      {images.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {images.map((img) => (
            <div key={img.id} className="relative group">
              <img
                src={img.url}
                alt={img.name}
                className="w-16 h-16 object-cover rounded-md border border-border"
              />
              <button
                onClick={() => removeImage(img.id)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload + URL inputs */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-1.5 text-xs font-medium bg-surface border border-border rounded-lg hover:border-accent/50 transition-colors cursor-pointer"
        >
          Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddUrl())}
          placeholder="Paste image URL..."
          className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
        />
        <button
          type="button"
          onClick={handleAddUrl}
          disabled={!urlInput.trim()}
          className="px-3 py-1.5 text-xs font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
        >
          Add
        </button>
      </div>
    </div>
  );
}
