"use client";

import { OpenRouterAuthProvider } from "@/hooks/use-openrouter-auth";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <OpenRouterAuthProvider>{children}</OpenRouterAuthProvider>;
}
