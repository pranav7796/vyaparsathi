import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getSchemes, isStale, saveSchemes } from "@/lib/db";
import { portals } from "@/lib/portals";
import { SchemeSchema, ProfileSchema, type Scheme } from "@/lib/schemas";
import seedSchemesJson from "@/lib/seed-schemes.json";
import { runAgent } from "@/lib/tinyfish";

export const maxDuration = 300;

const RequestSchema = z.object({ profile: ProfileSchema });

const ExtractedSchema = z.object({
  name: z.string().min(1),
  benefit: z.string().min(1),
  eligibility: z.array(z.string()).min(1),
  documents: z.array(z.string()),
  howToApply: z.string().min(1),
});

function asStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value.map((item) => String(item).trim()).filter(Boolean);
    return items.length ? items : undefined;
  }
  if (typeof value === "string") {
    const items = value
      .split(/\n|•|;/)
      .map((item) => item.replace(/^[-*\d.)\s]+/, "").trim())
      .filter(Boolean);
    return items.length ? items : undefined;
  }
  return undefined;
}

function asText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(asText).filter((item): item is string => Boolean(item));
    return parts.length ? parts.join(". ") : undefined;
  }
  if (value && typeof value === "object") {
    const parts = Object.entries(value).flatMap(([key, item]) => {
      const text = asText(item);
      return text ? [`${key.replaceAll("_", " ")}: ${text}`] : [];
    });
    return parts.length ? parts.join("; ") : undefined;
  }
  return undefined;
}

function unwrap(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const record = raw as Record<string, unknown>;
  if (Array.isArray(record.schemes)) return record.schemes;
  if (record.scheme && typeof record.scheme === "object") return [record.scheme];
  if (typeof record.name === "string") return [record];
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const nested = unwrap(value);
      if (nested.length) return nested;
    }
  }
  return [];
}

function toSchemes(portalId: string, sourceUrl: string, raw: unknown): Scheme[] {
  const fetchedAt = new Date().toISOString();
  const schemes: Scheme[] = [];

  unwrap(raw).forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const record = item as Record<string, unknown>;
    const parsed = ExtractedSchema.safeParse({
      name: asText(record.name),
      benefit: asText(record.benefit),
      eligibility: asStringArray(record.eligibility),
      documents: asStringArray(record.documents) ?? [],
      howToApply: asText(record.howToApply ?? record.how_to_apply),
    });
    if (!parsed.success) return;
    const id = index === 0 ? portalId : `${portalId}-${index + 1}`;
    schemes.push(
      SchemeSchema.parse({
        id,
        ...parsed.data,
        sourceUrl,
        fetchedAt,
      }),
    );
  });

  if (!schemes.length) {
    throw new Error(`TinyFish result for ${portalId} did not match the scheme schema`);
  }
  return schemes;
}

function seedSchemes(): Scheme[] {
  return z.array(SchemeSchema).parse(seedSchemesJson);
}

function covers(schemes: Scheme[], portalId: string) {
  return schemes.some((scheme) => scheme.id === portalId || scheme.id.startsWith(`${portalId}-`));
}

export async function POST(request: Request) {
  try {
    RequestSchema.parse(await request.json());

    const cached = getSchemes().filter((scheme) => !isStale(scheme.fetchedAt));
    const missing = portals.filter((portal) => !covers(cached, portal.id));
    if (missing.length > 0 && process.env.DEMO_MODE !== "true") {
      after(() => {
        void Promise.all(
          missing.map(async (portal) => {
            try {
              const raw = await runAgent(portal.url, portal.goal, 30_000);
              saveSchemes(toSchemes(portal.id, portal.url, raw));
            } catch {
              // Keep the cached schemes. A later visit can pick up a live result.
            }
          }),
        );
      });
    }

    const publish = (schemes: Scheme[]) =>
      schemes.map((scheme) => ({
        ...scheme,
        name: scheme.name.replace(/^\[SEED DATA\]\s*/i, ""),
      }));

    if (cached.length > 0) {
      return NextResponse.json({ schemes: publish(cached), source: "cache" });
    }

    return NextResponse.json({ schemes: publish(seedSchemes()), source: "seed" });
  } catch {
    return NextResponse.json({ error: "Could not find schemes" }, { status: 400 });
  }
}
