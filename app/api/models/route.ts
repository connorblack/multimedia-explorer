const OPENROUTER_API = "https://openrouter.ai/api/v1/models";

interface OpenRouterModel {
  id: string;
  name: string;
  architecture: {
    output_modalities: string[];
  };
}

interface OpenRouterResponse {
  data: OpenRouterModel[];
}

type ModelEntry = { id: string; label: string };
type CacheData = { image: ModelEntry[]; video: ModelEntry[] };

let cache: { data: CacheData; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function stripProviderPrefix(name: string): string {
  const colonIdx = name.indexOf(": ");
  return colonIdx !== -1 ? name.slice(colonIdx + 2) : name;
}

async function fetchByModality(modality: string): Promise<ModelEntry[]> {
  const res = await fetch(`${OPENROUTER_API}?output_modalities=${modality}`);
  if (!res.ok) return [];
  const { data } = (await res.json()) as OpenRouterResponse;
  return data.map((m) => ({ id: m.id, label: stripProviderPrefix(m.name) }));
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return Response.json(cache.data);
  }

  const [image, video] = await Promise.all([
    fetchByModality("image"),
    fetchByModality("video"),
  ]);

  const result: CacheData = { image, video };
  cache = { data: result, ts: Date.now() };

  return Response.json(result);
}
