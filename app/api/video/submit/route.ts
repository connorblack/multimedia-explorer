import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_VIDEO_URL = "https://openrouter.ai/api/alpha/videos";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }

  const body = await request.json();
  const { prompt, model } = body;

  if (!prompt || !model) {
    return NextResponse.json(
      { error: "Prompt and model are required" },
      { status: 400 }
    );
  }

  // Build the request payload, only including optional fields if provided
  const payload: Record<string, unknown> = { model, prompt };

  if (body.aspect_ratio) payload.aspect_ratio = body.aspect_ratio;
  if (body.duration) payload.duration = body.duration;
  if (body.resolution) payload.resolution = body.resolution;
  if (body.generate_audio !== undefined) payload.generate_audio = body.generate_audio;
  if (body.seed !== undefined) payload.seed = body.seed;
  if (Array.isArray(body.input_references) && body.input_references.length > 0) {
    payload.input_references = body.input_references;
  }

  try {
    const res = await fetch(OPENROUTER_VIDEO_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Media Playground",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    console.log("OpenRouter video submit response:", res.status, JSON.stringify(data));

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || "Failed to submit video generation" },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to submit video generation" },
      { status: 500 }
    );
  }
}
