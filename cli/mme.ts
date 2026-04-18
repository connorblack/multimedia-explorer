#!/usr/bin/env bun
/**
 * mme — multimedia-explorer CLI for OpenRouter image generation.
 *
 * Wraps @openrouter/sdk with the same request/response handling used by the
 * Next.js /api/generate route (aspect-ratio validation, brand-context system
 * prompts, reference-image multipart content, and the three-shape image URL
 * extraction from SDK responses).
 *
 *   mme "editorial portrait, 5 AM Manhattan"
 *   mme -p "..." -o ~/Desktop/hero.png --aspect 16:9 --res 2K
 *   mme -p "add morning fog" -r source.png -o edited.png
 *   mme --prompts-file prompts.jsonl --concurrency 5
 */

import { parseArgs } from "node:util";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
	statSync,
} from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { homedir } from "node:os";
import { sleep } from "bun";
import { OpenRouter } from "@openrouter/sdk";
import {
	ASPECT_RATIOS,
	EXTENDED_ASPECT_RATIOS,
	RESOLUTIONS,
} from "@/lib/types";

const DEFAULT_MODEL = "google/gemini-3-pro-image-preview";
const DEFAULT_TEXT_MODEL = "x-ai/grok-4.20";
const DEFAULT_VIDEO_MODEL = "google/veo-3.1";
const DEFAULT_VIDEO_DURATION = 8;
const DEFAULT_VIDEO_ASPECT = "16:9";
const DEFAULT_VIDEO_RESOLUTION = "1080p";
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_POLL_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_OUT_DIR = "./images";
const DEFAULT_VIDEO_OUT_DIR = "./videos";
const OPENROUTER_VIDEO_URL = "https://openrouter.ai/api/v1/videos";
const MOOD_HTML_BYTE_LIMIT = 15000;
const MOOD_USER_AGENT =
	"Mozilla/5.0 (compatible; mme-cli/1.0; +https://github.com/connorblack/multimedia-explorer)";
const X_TITLE = "multimedia-explorer CLI";
const HTTP_REFERER = "https://github.com/connorblack/multimedia-explorer";

const VALID_ASPECT_RATIOS = new Set(ASPECT_RATIOS);
const VALID_EXTENDED_ASPECT_RATIOS = new Set(EXTENDED_ASPECT_RATIOS);
const VALID_RESOLUTIONS = new Set(RESOLUTIONS);
const FLASH_MODEL = "google/gemini-3.1-flash-image-preview";

type ContentPart =
	| { type: "text"; text: string }
	| { type: "image_url"; imageUrl: { url: string } };

type ChatMessage =
	| { role: "system"; content: string }
	| { role: "user"; content: string | ContentPart[] };

type BrandContext = {
	customSystemPrompt?: string;
	stylePrompt?: string;
	colors?: string[];
	personality?: string[];
	visualStyle?: string[];
};

type Job = {
	prompt: string;
	out?: string;
	ref?: string[];
	aspect?: string;
	res?: string;
	brand?: BrandContext;
	model?: string;
};

type Usage = {
	promptTokens?: number;
	completionTokens?: number;
	totalTokens?: number;
	// OpenRouter extension — not always present on the SDK response
	cost?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function readEnvFile(path: string, key: string): string | undefined {
	if (!existsSync(path)) return undefined;
	const line = readFileSync(path, "utf8")
		.split("\n")
		.find((l) => l.trim().startsWith(`${key}=`));
	if (!line) return undefined;
	return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

function loadApiKey(): string {
	if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
	for (const candidate of [".env", `${homedir()}/.env`]) {
		const value = readEnvFile(candidate, "OPENROUTER_API_KEY");
		if (value) return value;
	}
	console.error(
		"OPENROUTER_API_KEY not set. Export it in your shell or add it to ./.env or ~/.env.",
	);
	process.exit(1);
}

function printUsage(): void {
	console.log(`Usage: mme [options] [prompt]

Generate images via OpenRouter (default model: ${DEFAULT_MODEL}).

Options:
  -p, --prompt <text>       Prompt text (or pass as positional, or pipe via stdin)
  -o, --out <path>          Output file or directory (default: ${DEFAULT_OUT_DIR})
  -m, --model <id>          OpenRouter model id (default: ${DEFAULT_MODEL})
  -n, --count <n>           Variants from a single prompt (default: 1)
  -r, --ref <path>          Reference image for edit/compose mode (repeatable)
  -a, --aspect <ratio>      Aspect ratio: 1:1, 16:9, 9:16, 4:3, 3:2 (Nano Banana 2: +1:4, 4:1, 1:8, 8:1)
  -s, --res <res>           Resolution: 1K | 2K | 4K (default: 1K)
      --brand <json|@file>  Brand context JSON (inline or @path) — see README for shape
      --mood <url|text>     Generate brand context from a website URL or mood description
                            (overridden by --brand if both provided)
      --improve             Run each prompt through the LLM prompt-improver first
      --text-model <id>     Text LLM for --mood and --improve (default: ${DEFAULT_TEXT_MODEL})
      --prompts-file <path> JSONL batch file, one Job per line
      --concurrency <n>     Parallel requests (default: 3)
      --dry-run             Print request plan without calling API
  -h, --help                Show this help

Env:
  OPENROUTER_API_KEY        Required. Falls back to ./.env, ~/.env.
`);
}

function mimeFromPath(path: string): string {
	switch (extname(path).toLowerCase()) {
		case ".png": return "image/png";
		case ".jpg":
		case ".jpeg": return "image/jpeg";
		case ".webp": return "image/webp";
		case ".gif": return "image/gif";
		default: return "application/octet-stream";
	}
}

const dataUrlCache = new Map<string, string>();
function toDataUrl(pathOrUrl: string): string {
	if (pathOrUrl.startsWith("data:") || URL.canParse(pathOrUrl)) {
		return pathOrUrl;
	}
	const cached = dataUrlCache.get(pathOrUrl);
	if (cached) return cached;
	const buf = readFileSync(resolve(pathOrUrl));
	const url = `data:${mimeFromPath(pathOrUrl)};base64,${buf.toString("base64")}`;
	dataUrlCache.set(pathOrUrl, url);
	return url;
}

function validateAspect(aspect: string | undefined, model: string): string {
	if (!aspect) return "1:1";
	if (VALID_ASPECT_RATIOS.has(aspect)) return aspect;
	if (model === FLASH_MODEL && VALID_EXTENDED_ASPECT_RATIOS.has(aspect)) return aspect;
	console.warn(`[warn] aspect "${aspect}" not valid for ${model}; falling back to 1:1`);
	return "1:1";
}

function validateResolution(res: string | undefined): string {
	if (res && VALID_RESOLUTIONS.has(res)) return res;
	if (res) console.warn(`[warn] resolution "${res}" not valid; falling back to 1K`);
	return "1K";
}

function buildMessages(job: Job): ChatMessage[] {
	const messages: ChatMessage[] = [];

	if (job.brand) {
		const systemContent = job.brand.customSystemPrompt ?? [
			"The user wants the generated image to match a specific brand identity. Apply the following brand guidelines to the image:",
			"",
			`Visual style: ${job.brand.stylePrompt ?? ""}`,
			`Color palette: ${job.brand.colors?.join(", ") ?? ""}`,
			`Personality: ${job.brand.personality?.join(", ") ?? ""}`,
			`Visual descriptors: ${job.brand.visualStyle?.join(", ") ?? ""}`,
			"",
			"Incorporate these brand elements naturally into the image. The user's prompt below describes what to generate — the brand context above describes how it should look and feel.",
		].join("\n");
		messages.push({ role: "system", content: systemContent });
	}

	if (job.ref && job.ref.length > 0) {
		const parts: ContentPart[] = [{ type: "text", text: job.prompt }];
		for (const ref of job.ref) {
			parts.push({ type: "image_url", imageUrl: { url: toDataUrl(ref) } });
		}
		messages.push({ role: "user", content: parts });
	} else {
		messages.push({ role: "user", content: job.prompt });
	}

	return messages;
}

function extractImageUrl(message: Record<string, unknown>): string | null {
	// 1. message.images[] — dedicated array with { imageUrl: { url } }
	const images = message.images;
	if (Array.isArray(images) && images.length > 0) {
		const first = images[0];
		if (isRecord(first) && isRecord(first.imageUrl) && typeof first.imageUrl.url === "string") {
			return first.imageUrl.url;
		}
	}
	// 2. message.content[] content parts with type "image_url"
	if (Array.isArray(message.content)) {
		for (const part of message.content) {
			if (
				isRecord(part) &&
				part.type === "image_url" &&
				isRecord(part.imageUrl) &&
				typeof part.imageUrl.url === "string"
			) {
				return part.imageUrl.url;
			}
		}
	}
	// 3. string content that is a raw data URL
	if (typeof message.content === "string" && message.content.startsWith("data:image")) {
		return message.content;
	}
	return null;
}

function extractErrorMessage(err: unknown): { message: string; statusCode?: number } {
	if (!(err instanceof Error)) return { message: String(err) };
	let message = err.message;
	let statusCode: number | undefined;

	// OpenRouter SDK errors carry structured detail on the Error instance itself.
	if ("error" in err && isRecord(err.error)) {
		const nestedMessage = err.error.message;
		if (typeof nestedMessage === "string" && nestedMessage) message = nestedMessage;
	}

	if (message === err.message && "body" in err && typeof err.body === "string") {
		try {
			const body: unknown = JSON.parse(err.body);
			if (isRecord(body) && isRecord(body.error)) {
				const detail =
					typeof body.error.message === "string" ? body.error.message : undefined;
				const rawMeta =
					isRecord(body.error.metadata) && typeof body.error.metadata.raw === "string"
						? body.error.metadata.raw
						: undefined;
				if (detail) message = detail;
				else if (rawMeta) message = rawMeta;
			}
		} catch {
			// body was not JSON — keep the original message
		}
	}

	if ("statusCode" in err && typeof err.statusCode === "number") {
		statusCode = err.statusCode;
	}
	return { message, statusCode };
}

function isExistingDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

function timestampSlug(): string {
	return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

type OutPathOpts = {
	explicit: string | undefined;
	defaultDir: string;
	prefix: string;
	ext: string;
	suffix?: string;
	// When true (default), suffix is inserted into explicit filenames too —
	// needed for multi-variant image runs where each variant gets its own file.
	// Video disables this so a jobId disambiguator only appears in auto-naming.
	suffixExplicit?: boolean;
};

function decideOutPath({
	explicit,
	defaultDir,
	prefix,
	ext,
	suffix = "",
	suffixExplicit = true,
}: OutPathOpts): string {
	const treatAsDir =
		explicit && (explicit.endsWith("/") || isExistingDirectory(explicit));

	if (!explicit || treatAsDir) {
		const dir = explicit ? explicit.replace(/\/$/, "") : defaultDir;
		mkdirSync(dir, { recursive: true });
		return `${dir}/${prefix}-${timestampSlug()}${suffix}${ext}`;
	}

	mkdirSync(dirname(explicit), { recursive: true });
	if (suffix && suffixExplicit) {
		const existing = extname(explicit) || ext;
		const stem = explicit.slice(0, explicit.length - existing.length);
		return `${stem}${suffix}${existing}`;
	}
	return explicit;
}

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString("utf8").trim();
}

const MIME_TO_EXT: Record<string, string> = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/webp": ".webp",
	"image/gif": ".gif",
};

function parseDataUrl(dataUrl: string): { mime: string; bytes: Buffer } {
	const comma = dataUrl.indexOf(",");
	if (comma < 0 || !dataUrl.startsWith("data:")) {
		throw new Error("Malformed data URL from model");
	}
	const header = dataUrl.slice(5, comma);
	const mime = header.split(";")[0] || "application/octet-stream";
	const bytes = Buffer.from(dataUrl.slice(comma + 1), "base64");
	return { mime, bytes };
}

function reconcileOutExtension(outPath: string, mime: string): string {
	const desired = MIME_TO_EXT[mime];
	if (!desired) return outPath;
	const current = extname(outPath).toLowerCase();
	if (current === desired) return outPath;
	// .jpg and .jpeg both map to image/jpeg — don't flip one for the other.
	if (desired === ".jpg" && current === ".jpeg") return outPath;
	const stem = current ? outPath.slice(0, outPath.length - current.length) : outPath;
	const next = `${stem}${desired}`;
	if (current) {
		console.warn(`[warn] model returned ${mime}; writing ${next} instead of ${outPath}`);
	}
	return next;
}

function writeDataUrl(dataUrl: string, outPath: string): string {
	const { mime, bytes } = parseDataUrl(dataUrl);
	const reconciled = reconcileOutExtension(outPath, mime);
	writeFileSync(reconciled, bytes);
	return reconciled;
}

function parseBrandArg(value: string | undefined): BrandContext | undefined {
	if (!value) return undefined;
	try {
		const raw = value.startsWith("@")
			? readFileSync(resolve(value.slice(1)), "utf8")
			: value;
		return JSON.parse(raw) as BrandContext;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`--brand: failed to load ${value}: ${msg}`, { cause: err });
	}
}

type GenerateResult = {
	dataUrl: string;
	usage?: Usage;
	model?: string;
	textNote?: string;
};

type SdkResponse = {
	model?: string;
	usage?: Usage;
	choices?: Array<{ message?: Record<string, unknown> }>;
};

async function generate(client: OpenRouter, job: Job): Promise<GenerateResult> {
	const model = job.model ?? DEFAULT_MODEL;
	const aspect_ratio = validateAspect(job.aspect, model);
	const image_size = validateResolution(job.res);

	const raw = await client.chat.send({
		chatRequest: {
			model,
			messages: buildMessages(job),
			modalities: ["image"],
			imageConfig: { aspect_ratio, image_size },
		},
	});
	const result = raw as SdkResponse;

	const message = result.choices?.[0]?.message;
	if (!message) throw new Error("No message in model response");
	const dataUrl = extractImageUrl(message);
	if (!dataUrl) {
		const textPreview =
			typeof message.content === "string" ? message.content.slice(0, 200) : "<non-text>";
		throw new Error(`No image in response. Model text: ${textPreview}`);
	}

	return {
		dataUrl,
		usage: result.usage,
		model: result.model,
		textNote: typeof message.content === "string" ? message.content.trim() : undefined,
	};
}

async function callChatText(
	client: OpenRouter,
	model: string,
	system: string,
	user: string,
): Promise<string> {
	const raw = await client.chat.send({
		chatRequest: {
			model,
			messages: [
				{ role: "system", content: system },
				{ role: "user", content: user },
			],
		},
	});
	const result = raw as SdkResponse;
	const content = result.choices?.[0]?.message?.content;
	if (typeof content !== "string" || !content.trim()) {
		throw new Error("No text content in LLM response");
	}
	return content.trim();
}

async function improvePrompt(
	client: OpenRouter,
	prompt: string,
	model: string,
): Promise<string> {
	const system =
		"You are an expert at writing image generation prompts. Given a user's rough prompt, rewrite it to be more detailed, vivid, and effective for AI image generation. Keep the core intent but add specific details about composition, lighting, style, colors, and mood where appropriate. Return ONLY the improved prompt text, nothing else. Do not wrap it in quotes.";
	return callChatText(client, model, system, prompt);
}

function looksLikeUrl(input: string): boolean {
	const trimmed = input.trim();
	return URL.canParse(trimmed) && /^https?:/i.test(trimmed);
}

async function generateMoodBrand(
	client: OpenRouter,
	input: string,
	model: string,
): Promise<BrandContext> {
	let system: string;
	let user: string;

	if (looksLikeUrl(input)) {
		const pageResponse = await fetch(input, {
			headers: { "User-Agent": MOOD_USER_AGENT },
		});
		if (!pageResponse.ok) {
			throw new Error(`Moodboard fetch failed: ${pageResponse.status} ${pageResponse.statusText}`);
		}
		const html = (await pageResponse.text()).slice(0, MOOD_HTML_BYTE_LIMIT);
		system = `You are a brand identity analyst. Given a website's HTML, extract the brand's visual identity and return a JSON object with these fields:
- colors: array of hex color codes found or implied by the brand (max 6)
- personality: array of 3-5 adjective descriptors of the brand personality
- visualStyle: array of 3-5 visual style descriptors (e.g., "minimalist", "bold typography", "organic shapes")
- tone: a brief description of the brand's communication tone (1-2 sentences)
- stylePrompt: a concise image generation style prompt that captures this brand's visual identity (1-2 sentences, suitable for prepending to an image generation prompt)

Return ONLY valid JSON, no markdown fences.`;
		user = `Analyze this website HTML and extract the brand identity:\n\nURL: ${input}\n\n${html}`;
	} else {
		system = `You are a creative visual identity designer. Given a mood or style description, generate a cohesive visual identity and return a JSON object with these fields:
- colors: array of hex color codes that match the described mood (max 6)
- personality: array of 3-5 adjective descriptors that capture the mood
- visualStyle: array of 3-5 visual style descriptors (e.g., "minimalist", "bold typography", "organic shapes")
- tone: a brief description of the overall tone and feeling (1-2 sentences)
- stylePrompt: a concise image generation style prompt that captures this visual identity (1-2 sentences, suitable for prepending to an image generation prompt)

Return ONLY valid JSON, no markdown fences.`;
		user = `Generate a visual identity based on this mood/style description:\n\n${input}`;
	}

	const raw = await callChatText(client, model, system, user);
	const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
	const parsed: unknown = JSON.parse(cleaned);
	if (!isRecord(parsed)) {
		throw new Error("Moodboard response was not a JSON object");
	}
	return parsed as BrandContext;
}

function summarizeBrand(brand: BrandContext): string {
	const parts: string[] = [];
	if (brand.stylePrompt) parts.push(`style: ${brand.stylePrompt}`);
	if (brand.colors?.length) parts.push(`colors: ${brand.colors.join(", ")}`);
	if (brand.personality?.length) parts.push(`personality: ${brand.personality.join(", ")}`);
	return parts.join(" · ");
}

async function runWithConcurrency<T, R>(
	items: T[],
	limit: number,
	worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let cursor = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (true) {
			const i = cursor++;
			if (i >= items.length) return;
			results[i] = await worker(items[i]!, i);
		}
	});
	await Promise.all(workers);
	return results;
}

async function runImage(argv: string[]): Promise<void> {
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			prompt: { type: "string", short: "p" },
			out: { type: "string", short: "o" },
			model: { type: "string", short: "m", default: DEFAULT_MODEL },
			count: { type: "string", short: "n", default: "1" },
			ref: { type: "string", short: "r", multiple: true },
			aspect: { type: "string", short: "a" },
			res: { type: "string", short: "s" },
			brand: { type: "string" },
			mood: { type: "string" },
			improve: { type: "boolean", default: false },
			"text-model": { type: "string", default: DEFAULT_TEXT_MODEL },
			"prompts-file": { type: "string" },
			concurrency: { type: "string", default: "3" },
			"dry-run": { type: "boolean", default: false },
			help: { type: "boolean", short: "h", default: false },
		},
	});

	if (values.help) {
		printUsage();
		return;
	}

	const apiKey = loadApiKey();
	const model = values.model ?? DEFAULT_MODEL;
	const textModel = values["text-model"] ?? DEFAULT_TEXT_MODEL;
	const count = Math.max(1, Number.parseInt(values.count ?? "1", 10));
	const concurrency = Math.max(1, Number.parseInt(values.concurrency ?? "3", 10));
	const dryRun = values["dry-run"] ?? false;
	const improve = values.improve ?? false;
	let brand = parseBrandArg(values.brand);

	const jobs: Job[] = [];
	if (values["prompts-file"]) {
		const lines = readFileSync(values["prompts-file"], "utf8")
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l.length > 0 && !l.startsWith("//"));
		for (const line of lines) {
			const parsed = JSON.parse(line) as Job;
			if (!parsed.prompt) throw new Error(`Missing "prompt" in: ${line}`);
			jobs.push({
				model: parsed.model ?? model,
				aspect: parsed.aspect ?? values.aspect,
				res: parsed.res ?? values.res,
				brand: parsed.brand ?? brand,
				...parsed,
			});
		}
	} else {
		let prompt = values.prompt ?? positionals.join(" ").trim();
		if (!prompt && !process.stdin.isTTY) prompt = await readStdin();
		if (!prompt) {
			printUsage();
			console.error("\nNo prompt provided.");
			process.exit(1);
		}
		const base: Job = {
			prompt,
			out: values.out,
			ref: values.ref,
			aspect: values.aspect,
			res: values.res,
			brand,
			model,
		};
		for (let i = 0; i < count; i++) jobs.push({ ...base });
	}

	console.log(
		`→ ${jobs.length} job(s), model=${model}, concurrency=${concurrency}${
			dryRun ? " [dry-run]" : ""
		}`,
	);

	const client = new OpenRouter({ apiKey, httpReferer: HTTP_REFERER, appTitle: X_TITLE });

	if (values.mood && !dryRun) {
		const kind = looksLikeUrl(values.mood) ? "URL" : "description";
		console.log(`→ Generating brand context from mood (${kind}) via ${textModel}…`);
		const moodBrand = await generateMoodBrand(client, values.mood, textModel);
		if (!brand) brand = moodBrand;
		for (const j of jobs) if (!j.brand) j.brand = moodBrand;
		console.log(`  ${summarizeBrand(moodBrand)}`);
	}

	if (improve && !dryRun) {
		const unique = [...new Set(jobs.map((j) => j.prompt))];
		console.log(
			`→ Improving ${unique.length} unique prompt(s) via ${textModel} (concurrency ${concurrency})…`,
		);
		const improvedMap = new Map<string, string>();
		await runWithConcurrency(unique, concurrency, async (original) => {
			try {
				const improved = await improvePrompt(client, original, textModel);
				improvedMap.set(original, improved);
				const before = original.length > 60 ? `${original.slice(0, 57)}…` : original;
				const after = improved.length > 140 ? `${improved.slice(0, 137)}…` : improved;
				console.log(`  [improve] "${before}" → "${after}"`);
			} catch (err) {
				const { message } = extractErrorMessage(err);
				console.warn(`[warn] improve failed for "${original.slice(0, 40)}…": ${message}`);
				improvedMap.set(original, original);
			}
		});
		for (const j of jobs) {
			const improved = improvedMap.get(j.prompt);
			if (improved) j.prompt = improved;
		}
	}

	const started = Date.now();
	let totalPromptTokens = 0;
	let totalCompletionTokens = 0;
	let totalCost = 0;

	const results = await runWithConcurrency(jobs, concurrency, async (job, i) => {
		const variantSuffix =
			jobs.length > 1 && !values["prompts-file"]
				? `-${String(i + 1).padStart(2, "0")}`
				: "";
		const outPath = decideOutPath({
			explicit: job.out,
			defaultDir: DEFAULT_OUT_DIR,
			prefix: "img",
			ext: ".png",
			suffix: variantSuffix,
		});

		if (dryRun) {
			console.log(
				`[dry-run] → ${outPath}\n  prompt: ${job.prompt.slice(0, 80)}${job.prompt.length > 80 ? "…" : ""}${
					job.ref ? `\n  ref: ${job.ref.join(", ")}` : ""
				}`,
			);
			return { ok: true as const, outPath };
		}

		try {
			const r = await generate(client, job);
			const writtenPath = writeDataUrl(r.dataUrl, outPath);
			if (r.usage) {
				totalPromptTokens += r.usage.promptTokens ?? 0;
				totalCompletionTokens += r.usage.completionTokens ?? 0;
				totalCost += r.usage.cost ?? 0;
			}
			const costBit =
				r.usage?.cost !== undefined ? ` $${r.usage.cost.toFixed(4)}` : "";
			const tokenBit = r.usage
				? ` (${r.usage.promptTokens ?? 0}/${r.usage.completionTokens ?? 0} tok${costBit})`
				: "";
			console.log(`✓ ${writtenPath}${tokenBit}`);
			if (r.textNote) console.log(`  note: ${r.textNote.slice(0, 140)}`);
			return { ok: true as const, outPath: writtenPath };
		} catch (err) {
			const { message, statusCode } = extractErrorMessage(err);
			const code = statusCode ? ` [${statusCode}]` : "";
			console.error(`✗ job ${i + 1}${code}: ${message}`);
			return { ok: false as const, error: message };
		}
	});

	const okCount = results.filter((r) => r.ok).length;
	const elapsed = ((Date.now() - started) / 1000).toFixed(1);
	console.log(
		`\nDone: ${okCount}/${jobs.length} in ${elapsed}s` +
			(totalCost > 0
				? ` · ${totalPromptTokens}/${totalCompletionTokens} tok · $${totalCost.toFixed(4)}`
				: ""),
	);
	if (okCount < jobs.length) process.exit(1);
}

// =========================================================================
// Video subcommand
// =========================================================================

type VideoSubmitParams = {
	model: string;
	prompt: string;
	aspect_ratio?: string;
	duration?: number;
	resolution?: string;
	generate_audio?: boolean;
	seed?: number;
	input_references?: Array<{ type: "image_url"; image_url: { url: string } }>;
};

type VideoStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "expired";
const VIDEO_STATUSES: readonly VideoStatus[] = [
	"pending",
	"in_progress",
	"completed",
	"failed",
	"cancelled",
	"expired",
] as const;

type VideoJob = {
	id: string;
	status: VideoStatus;
	errorMessage?: string;
	model?: string;
};

function parseVideoJob(data: unknown, fallbackStatus?: VideoStatus): VideoJob {
	if (!isRecord(data) || typeof data.id !== "string") {
		throw new Error("Video response missing job id");
	}
	const rawStatus = typeof data.status === "string" ? data.status : fallbackStatus ?? "pending";
	const status: VideoStatus = VIDEO_STATUSES.includes(rawStatus as VideoStatus)
		? (rawStatus as VideoStatus)
		: "pending";

	let errorMessage: string | undefined;
	if (typeof data.error === "string") {
		errorMessage = data.error;
	} else if (isRecord(data.error) && typeof data.error.message === "string") {
		errorMessage = data.error.message;
	}

	const model = typeof data.model === "string" ? data.model : undefined;
	return { id: data.id, status, errorMessage, model };
}

function extractApiErrorMessage(data: unknown, fallback: string): string {
	if (isRecord(data)) {
		if (typeof data.error === "string") return data.error;
		if (isRecord(data.error) && typeof data.error.message === "string") return data.error.message;
	}
	return fallback;
}

function printVideoUsage(): void {
	console.log(`Usage: mme video [options] [prompt]

Generate videos via OpenRouter (default: ${DEFAULT_VIDEO_MODEL}, ${DEFAULT_VIDEO_DURATION}s, ${DEFAULT_VIDEO_ASPECT}, ${DEFAULT_VIDEO_RESOLUTION}).

Options:
  -p, --prompt <text>       Prompt text (or positional arg, or stdin)
  -o, --out <path>          Output path or directory (default: ${DEFAULT_VIDEO_OUT_DIR})
  -m, --model <id>          Video model id (default: ${DEFAULT_VIDEO_MODEL})
  -a, --aspect <ratio>      Aspect ratio (default: ${DEFAULT_VIDEO_ASPECT})
  -d, --duration <sec>      Duration in seconds (default: ${DEFAULT_VIDEO_DURATION})
  -s, --res <res>           Resolution: 720p, 1080p, 4K (default: ${DEFAULT_VIDEO_RESOLUTION})
      --audio               Generate audio (default: true for veo/sora)
      --no-audio            Disable audio generation
      --seed <n>            RNG seed for reproducibility
  -r, --ref <path>          Reference image (repeatable)
      --poll-interval <sec> Poll interval while waiting (default: ${DEFAULT_POLL_INTERVAL_MS / 1000})
      --timeout <sec>       Max wait (default: ${DEFAULT_POLL_TIMEOUT_MS / 1000})
      --no-wait             Submit and exit — prints job id for later retrieval
      --job-id <id>         Attach to an existing job (skip submit; poll + download)
      --dry-run             Print plan without calling API
  -h, --help                Show this help

Env:
  OPENROUTER_API_KEY        Required. Falls back to ./.env, ~/.env.

Examples:
  mme video "a pear on a table, soft studio light, locked camera"
  mme video -p "…" -o hero.mp4 -d 6 --aspect 16:9 --res 1080p --no-audio
  mme video -p "add fog" -r source.png -o edited.mp4
  mme video --job-id vid_abc123 -o recovered.mp4   # resume a prior job
  mme video -p "…" --no-wait                      # submit only, print job id
`);
}

function openRouterFetch(apiKey: string, url: string, init?: RequestInit): Promise<Response> {
	return fetch(url, {
		...init,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"HTTP-Referer": HTTP_REFERER,
			"X-Title": X_TITLE,
			...(init?.body ? { "Content-Type": "application/json" } : {}),
			...init?.headers,
		},
	});
}

async function submitVideo(apiKey: string, params: VideoSubmitParams): Promise<VideoJob> {
	const res = await openRouterFetch(apiKey, OPENROUTER_VIDEO_URL, {
		method: "POST",
		body: JSON.stringify(params),
	});
	const data: unknown = await res.json();
	if (!res.ok) {
		throw new Error(extractApiErrorMessage(data, `Video submit failed: ${res.status} ${res.statusText}`));
	}
	return parseVideoJob(data, "pending");
}

async function pollVideoJob(apiKey: string, jobId: string): Promise<VideoJob> {
	const res = await openRouterFetch(apiKey, `${OPENROUTER_VIDEO_URL}/${jobId}`);
	const data: unknown = await res.json();
	if (!res.ok) {
		throw new Error(extractApiErrorMessage(data, `Video poll failed: ${res.status} ${res.statusText}`));
	}
	return parseVideoJob(data);
}

async function waitForVideoCompletion(
	apiKey: string,
	jobId: string,
	opts: { pollIntervalMs: number; timeoutMs: number },
): Promise<VideoJob> {
	const started = Date.now();
	let lastStatus: VideoStatus | undefined;

	while (true) {
		const job = await pollVideoJob(apiKey, jobId);
		if (job.status !== lastStatus) {
			const elapsed = ((Date.now() - started) / 1000).toFixed(0);
			console.log(`  [${elapsed}s] ${jobId} → ${job.status}`);
			lastStatus = job.status;
		}

		if (job.status === "completed") return job;
		if (job.status === "failed" || job.status === "cancelled" || job.status === "expired") {
			throw new Error(`Video job ${job.status}: ${job.errorMessage ?? job.status}`);
		}

		if (Date.now() - started > opts.timeoutMs) {
			throw new Error(
				`Timeout after ${(opts.timeoutMs / 1000).toFixed(0)}s (last status: ${job.status}). Resume with: mme video --job-id ${jobId} -o <out>`,
			);
		}

		await sleep(opts.pollIntervalMs);
	}
}

async function downloadVideoContent(
	apiKey: string,
	jobId: string,
	index: number,
): Promise<{ bytes: Buffer; contentType: string }> {
	const res = await openRouterFetch(
		apiKey,
		`${OPENROUTER_VIDEO_URL}/${jobId}/content?index=${index}`,
	);
	if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
	const contentType = res.headers.get("content-type") ?? "video/mp4";
	const bytes = Buffer.from(await res.arrayBuffer());
	return { bytes, contentType };
}

function decideVideoOutPath(explicit: string | undefined, jobId: string): string {
	const resolved = decideOutPath({
		explicit,
		defaultDir: DEFAULT_VIDEO_OUT_DIR,
		prefix: "video",
		ext: ".mp4",
		suffix: `-${jobId.slice(0, 8)}`,
		suffixExplicit: false,
	});
	return resolved.endsWith(".mp4") ? resolved : `${resolved}.mp4`;
}

async function runVideo(argv: string[]): Promise<void> {
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			prompt: { type: "string", short: "p" },
			out: { type: "string", short: "o" },
			model: { type: "string", short: "m", default: DEFAULT_VIDEO_MODEL },
			aspect: { type: "string", short: "a", default: DEFAULT_VIDEO_ASPECT },
			duration: { type: "string", short: "d", default: String(DEFAULT_VIDEO_DURATION) },
			res: { type: "string", short: "s", default: DEFAULT_VIDEO_RESOLUTION },
			audio: { type: "boolean", default: true },
			"no-audio": { type: "boolean", default: false },
			seed: { type: "string" },
			ref: { type: "string", short: "r", multiple: true },
			"poll-interval": {
				type: "string",
				default: String(DEFAULT_POLL_INTERVAL_MS / 1000),
			},
			timeout: { type: "string", default: String(DEFAULT_POLL_TIMEOUT_MS / 1000) },
			"no-wait": { type: "boolean", default: false },
			"job-id": { type: "string" },
			"dry-run": { type: "boolean", default: false },
			help: { type: "boolean", short: "h", default: false },
		},
	});

	if (values.help) {
		printVideoUsage();
		return;
	}

	const apiKey = loadApiKey();
	const dryRun = values["dry-run"] ?? false;
	const pollIntervalMs = Math.max(1, Number.parseFloat(values["poll-interval"] ?? "5")) * 1000;
	const timeoutMs = Math.max(1, Number.parseFloat(values.timeout ?? "600")) * 1000;
	const existingJobId = values["job-id"];

	if (existingJobId) {
		console.log(`→ Attaching to existing video job ${existingJobId}`);
		if (dryRun) {
			console.log("[dry-run] would poll and download this job");
			return;
		}
		const job = await waitForVideoCompletion(apiKey, existingJobId, {
			pollIntervalMs,
			timeoutMs,
		});
		const { bytes } = await downloadVideoContent(apiKey, existingJobId, 0);
		const outPath = decideVideoOutPath(values.out, existingJobId);
		writeFileSync(outPath, bytes);
		console.log(`✓ ${outPath} (${(bytes.length / 1024 / 1024).toFixed(1)} MB, model=${job.model ?? "?"})`);
		return;
	}

	let prompt = values.prompt ?? positionals.join(" ").trim();
	if (!prompt && !process.stdin.isTTY) prompt = await readStdin();
	if (!prompt) {
		printVideoUsage();
		console.error("\nNo prompt provided.");
		process.exit(1);
	}

	const model = values.model ?? DEFAULT_VIDEO_MODEL;
	const generateAudio = values["no-audio"] ? false : (values.audio ?? true);

	const refs = values.ref?.length
		? values.ref.map((r) => ({ type: "image_url" as const, image_url: { url: toDataUrl(r) } }))
		: undefined;

	const submitParams: VideoSubmitParams = {
		model,
		prompt,
		aspect_ratio: values.aspect,
		duration: Number.parseInt(values.duration ?? String(DEFAULT_VIDEO_DURATION), 10),
		resolution: values.res,
		generate_audio: generateAudio,
		seed: values.seed ? Number.parseInt(values.seed, 10) : undefined,
		input_references: refs,
	};

	console.log(
		`→ video model=${model} ${submitParams.aspect_ratio} ${submitParams.resolution} ${submitParams.duration}s audio=${generateAudio}${submitParams.seed !== undefined ? ` seed=${submitParams.seed}` : ""}${refs?.length ? ` refs=${refs.length}` : ""}${dryRun ? " [dry-run]" : ""}`,
	);

	if (dryRun) {
		console.log(`  prompt: ${prompt.slice(0, 120)}${prompt.length > 120 ? "…" : ""}`);
		return;
	}

	const started = Date.now();
	let submitted: VideoJob;
	try {
		submitted = await submitVideo(apiKey, submitParams);
	} catch (err) {
		const { message } = extractErrorMessage(err);
		console.error(`✗ submit failed: ${message}`);
		process.exit(1);
	}

	console.log(`  submitted: ${submitted.id} (status=${submitted.status})`);

	if (values["no-wait"]) {
		console.log(`\nResume later with:\n  mme video --job-id ${submitted.id} -o <out>`);
		return;
	}

	let completed: VideoJob;
	try {
		completed = await waitForVideoCompletion(apiKey, submitted.id, { pollIntervalMs, timeoutMs });
	} catch (err) {
		const { message } = extractErrorMessage(err);
		console.error(`✗ ${message}`);
		process.exit(1);
	}

	const { bytes } = await downloadVideoContent(apiKey, submitted.id, 0);
	const outPath = decideVideoOutPath(values.out, submitted.id);
	writeFileSync(outPath, bytes);
	const elapsed = ((Date.now() - started) / 1000).toFixed(1);
	console.log(
		`✓ ${outPath} (${(bytes.length / 1024 / 1024).toFixed(1)} MB, ${elapsed}s, model=${completed.model ?? model})`,
	);
}

// =========================================================================
// Subcommand dispatch
// =========================================================================

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const sub = argv[0];
	if (sub === "video") {
		await runVideo(argv.slice(1));
		return;
	}
	if (sub === "image") {
		await runImage(argv.slice(1));
		return;
	}
	await runImage(argv);
}

await main();
