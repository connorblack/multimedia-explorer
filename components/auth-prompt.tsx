"use client";

import { useOpenRouterAuth } from "@/hooks/use-openrouter-auth";

export default function AuthPrompt({
  onDismiss,
}: {
  onDismiss: () => void;
}) {
  const { signIn } = useOpenRouterAuth();

  return (
    <div className="p-4 bg-accent/5 border border-accent/20 rounded-lg space-y-3">
      <p className="text-sm text-foreground">
        You need an OpenRouter API key to continue.
      </p>
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => signIn()}
          className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors cursor-pointer"
        >
          Sign in with OpenRouter
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
