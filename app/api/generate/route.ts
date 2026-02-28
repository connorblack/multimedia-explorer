import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/openrouter";

const ASPECT_RATIOS: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1536, height: 864 },
  "9:16": { width: 864, height: 1536 },
  "4:3": { width: 1365, height: 1024 },
  "3:2": { width: 1536, height: 1024 },
};

const RESOLUTIONS: Record<string, number> = {
  "1K": 1,
  "2K": 2,
};

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }
  const apiKey = authHeader.slice(7);

  const { prompt, brandContext, model, aspectRatio, resolution, referenceImages } = await request.json();

  if (!prompt || !model) {
    return NextResponse.json(
      { error: "Prompt and model are required" },
      { status: 400 }
    );
  }

  const aspect = ASPECT_RATIOS[aspectRatio] || ASPECT_RATIOS["1:1"];
  const scale = RESOLUTIONS[resolution] || 1;

  // Build messages with brand context as a system message when available
  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; imageUrl: { url: string } };
  const messages: Array<
    | { role: "system"; content: string }
    | { role: "user"; content: string | ContentPart[] }
  > = [];

  if (brandContext) {
    const systemContent = brandContext.customSystemPrompt ?? [
      "The user wants the generated image to match a specific brand identity. Apply the following brand guidelines to the image:",
      "",
      `Visual style: ${brandContext.stylePrompt}`,
      `Color palette: ${brandContext.colors?.join(", ")}`,
      `Personality: ${brandContext.personality?.join(", ")}`,
      `Visual descriptors: ${brandContext.visualStyle?.join(", ")}`,
      "",
      "Incorporate these brand elements naturally into the image. The user's prompt below describes what to generate — the brand context above describes how it should look and feel.",
    ].join("\n");

    messages.push({
      role: "system" as const,
      content: systemContent,
    });
  }

  // Build user message — multipart when reference images are provided
  if (Array.isArray(referenceImages) && referenceImages.length > 0) {
    const contentParts: ContentPart[] = [
      { type: "text", text: prompt },
      ...referenceImages.map((url: string) => ({
        type: "image_url" as const,
        imageUrl: { url },
      })),
    ];
    messages.push({ role: "user" as const, content: contentParts });
  } else {
    messages.push({ role: "user" as const, content: prompt });
  }

  console.log("Generate request:", JSON.stringify({ model, messages, aspectRatio, resolution }, null, 2));

  try {
    const client = createClient(apiKey);

    const result = await client.chat.send({
      chatGenerationParams: {
        model,
        messages,
        modalities: ["image"],
        imageConfig: {
          width: aspect.width * scale,
          height: aspect.height * scale,
        },
      },
    });

    const message = result.choices?.[0]?.message as Record<string, unknown>;
    if (!message) {
      throw new Error("No response from model");
    }

    // Extract image from response. The SDK may return images in several places:
    // 1. message.images[] — dedicated array with { imageUrl: { url } } objects
    // 2. message.content[] — content parts with type "image_url" and { imageUrl: { url } }
    // 3. message.content as a string — raw base64 data URL
    let imageUrl: string | null = null;

    // Check message.images first (SDK-parsed dedicated field)
    const images = message.images as Array<{ imageUrl?: { url?: string } }> | undefined;
    if (Array.isArray(images) && images.length > 0) {
      imageUrl = images[0]?.imageUrl?.url ?? null;
    }

    // Fall back to content array parts (SDK uses camelCase imageUrl)
    if (!imageUrl && Array.isArray(message.content)) {
      for (const part of message.content as Array<Record<string, unknown>>) {
        if (part.type === "image_url") {
          const img = part.imageUrl as { url?: string } | undefined;
          if (img?.url) {
            imageUrl = img.url;
            break;
          }
        }
      }
    }

    // Fall back to string content (raw base64 data URL)
    if (!imageUrl && typeof message.content === "string") {
      if ((message.content as string).startsWith("data:image")) {
        imageUrl = message.content as string;
      }
    }

    if (!imageUrl) {
      console.error("Could not extract image. Raw message:", JSON.stringify(message, null, 2));
      return NextResponse.json({
        error: "Could not extract image from response",
        raw: message,
      }, { status: 500 });
    }

    return NextResponse.json({ imageUrl, model: result.model });
  } catch (err) {
    console.error("Generate error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to generate image",
      },
      { status: 500 }
    );
  }
}
