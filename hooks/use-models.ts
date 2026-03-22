"use client";

import { useState, useEffect } from "react";

export interface ModelOption {
  id: string;
  label: string;
}

interface ModelsState {
  imageModels: ModelOption[];
  videoModels: ModelOption[];
  loading: boolean;
}

let cachedData: { image: ModelOption[]; video: ModelOption[] } | null = null;

export function useModels(): ModelsState {
  const [imageModels, setImageModels] = useState<ModelOption[]>(cachedData?.image ?? []);
  const [videoModels, setVideoModels] = useState<ModelOption[]>(cachedData?.video ?? []);
  const [loading, setLoading] = useState(!cachedData);

  useEffect(() => {
    if (cachedData) return;

    let cancelled = false;

    fetch("/api/models")
      .then((res) => res.json())
      .then((data: { image: ModelOption[]; video: ModelOption[] }) => {
        if (cancelled) return;
        cachedData = data;
        setImageModels(data.image);
        setVideoModels(data.video);
      })
      .catch(() => {
        // Fail silently — dropdowns will just be empty
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { imageModels, videoModels, loading };
}
