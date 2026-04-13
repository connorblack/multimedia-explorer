# Multimedia Explorer

An open-source example app from [OpenRouter](https://openrouter.ai) that demonstrates how to combine different AI models for creative media experimentation. Generate images using 17+ models — from Google Gemini to OpenAI GPT-5 to FLUX — all through a single API.

## Features

- **Multi-model image generation** — Switch between 17+ models (Gemini, GPT-5, FLUX, Seedream, and more) with one click
- **Brand moodboards** — Analyze a website URL or describe a mood to generate a brand identity (colors, personality, visual style) that guides all subsequent generations
- **Reference images** — Upload images or paste URLs to use as visual input alongside your prompt
- **Output controls** — Choose aspect ratio (1:1, 16:9, 9:16, 4:3, 3:2) and resolution (1K, 2K)
- **Generation history** — Browse a visual timeline of past generations with hover previews and one-click restore
- **OAuth authentication** — Connects to OpenRouter via OAuth 2.0 with PKCE, so users bring their own API credits
- **Fully client-side storage** — All data lives in localStorage and IndexedDB; nothing is persisted server-side

## Getting Started

### Prerequisites

- Node.js 18+
- An [OpenRouter](https://openrouter.ai) account

### Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with your OpenRouter account.

### Environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_OPENROUTER_API_KEY` | Optional. Set this to skip OAuth and use an API key directly (development only). |

In production, users authenticate via OAuth and use their own OpenRouter credits.

## How It Works

### OpenRouter SDK

The app uses the [`@openrouter/sdk`](https://www.npmjs.com/package/@openrouter/sdk) to call models through a unified API. A single client handles all model calls — image generation, brand analysis, and multimodal inputs:

```typescript
import OpenRouter from "@openrouter/sdk";

const client = new OpenRouter({ apiKey });
```

### API Routes

| Route | Purpose |
|---|---|
| `/api/generate` | Sends a prompt (with optional reference images and brand context) to the selected model and returns a generated image |
| `/api/moodboard` | Analyzes a website URL or text description to extract brand identity data (colors, personality, visual style, tone) |

### Architecture

```
app/
├── api/
│   ├── generate/     # Image generation endpoint
│   └── moodboard/    # Brand identity analysis endpoint
├── callback/         # OAuth callback handler
├── page.tsx          # Main app — state management and layout
└── components/       # UI components (form, moodboard, history, cards)

lib/
├── openrouter.ts     # SDK client factory
├── oauth.ts          # OAuth 2.0 PKCE helpers
├── history-db.ts     # IndexedDB for image storage
├── models.ts         # Available model definitions
└── types.ts          # Shared TypeScript types
```

## Tech Stack

- [Next.js](https://nextjs.org) 16 (App Router)
- [OpenRouter SDK](https://www.npmjs.com/package/@openrouter/sdk)
- [Tailwind CSS](https://tailwindcss.com) v4
- TypeScript

## License

MIT
