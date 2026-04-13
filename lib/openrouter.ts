import { OpenRouter } from "@openrouter/sdk";

export function createClient(apiKey: string): OpenRouter {
  return new OpenRouter({
    apiKey,
    httpReferer: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
    xTitle: "Multimedia Explorer",
  });
}
