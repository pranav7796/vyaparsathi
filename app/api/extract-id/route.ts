import { NextResponse } from "next/server";
import sharp from "sharp";
import { IdExtractSchema, type IdExtract } from "@/lib/schemas";
import { llmVisionJson } from "@/lib/llm";

export const maxDuration = 60;

const INSTRUCTION = `Read this Indian ID image (Aadhaar, PAN, or Udyam certificate).
Return JSON with exactly these keys:
name, dob, age, gender, address, district, pincode, idType, idNumber.
Use null when a value is not clearly printed. Do not guess.
gender is "male", "female", "other", or null.
idType is "aadhaar", "pan", "udyam", "sample", "other", or null.
If the card is marked as a sample or not a real ID, set idType to "sample".
age is a number or null. dob is the date as printed, or null.
district is the district name printed in the address, or null.
idNumber is the ID number as printed, or null.`;

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /^null$/i.test(trimmed)) return null;
  return trimmed;
}

function maskNumber(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const compact = raw.replace(/[^0-9A-Za-z]/g, "");
  if (compact.length < 4) return null;
  return `XXXX${compact.slice(-4)}`;
}

function redact(value: string | null, masked: string | null): string | null {
  if (!value) return null;
  return value.replace(/\d[\d\s-]{6,}\d/g, masked ?? "XXXX");
}

function gender(value: unknown): IdExtract["gender"] {
  const raw = text(value)?.toLowerCase() ?? "";
  if (/female|\bwoman\b|^f\b/.test(raw)) return "female";
  if (/male|\bman\b|^m\b/.test(raw)) return "male";
  if (/other/.test(raw)) return "other";
  return null;
}

function idType(value: unknown): IdExtract["idType"] {
  const raw = text(value)?.toLowerCase() ?? "";
  if (/sample|not a real/.test(raw)) return "sample";
  if (/aadhaar|aadhar|uid/.test(raw)) return "aadhaar";
  if (/\bpan\b/.test(raw)) return "pan";
  if (/udyam/.test(raw)) return "udyam";
  if (raw) return "other";
  return null;
}

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const dmy = dob.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  const ymd = dob.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  const year = dmy ? Number(dmy[3]) : ymd ? Number(ymd[1]) : NaN;
  const month = dmy ? Number(dmy[2]) : ymd ? Number(ymd[2]) : NaN;
  const day = dmy ? Number(dmy[1]) : ymd ? Number(ymd[3]) : NaN;
  if (!year || !month || !day) return null;
  const born = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let years = now.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < born.getUTCMonth() ||
    (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate());
  if (beforeBirthday) years -= 1;
  if (years < 1 || years > 120) return null;
  return years;
}

function age(value: unknown, dob: string | null): number | null {
  const fromDob = ageFromDob(dob);
  if (fromDob != null) return fromDob;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (Number.isFinite(parsed)) {
    const years = Math.round(parsed);
    if (years >= 1 && years <= 120) return years;
  }
  return null;
}

async function prepareImage(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw new Error("Image data is required");
  const buf = Buffer.from(match[2], "base64");
  if (buf.length <= 4 * 1024 * 1024 && match[1] !== "image/gif") {
    return `data:${match[1]};base64,${buf.toString("base64")}`;
  }
  const jpeg = await sharp(buf)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { image?: unknown } | null;
    const image = typeof body?.image === "string" ? body.image : "";
    if (!image.startsWith("data:image/")) {
      return NextResponse.json({ error: "An image is required" }, { status: 400 });
    }

    if (process.env.DEMO_MODE === "true") {
      const dob = "05/12/2004";
      return NextResponse.json(
        IdExtractSchema.parse({
          name: "Pranav P Bharadwaj",
          dob,
          age: ageFromDob(dob),
          gender: "male",
          address: "12 Sample Road, Saraswathipuram, Mysuru, Karnataka - 570009",
          district: "Mysuru",
          pincode: "570009",
          idType: "sample",
          idNumberMasked: "XXXX0000",
        }),
      );
    }

    const raw = await llmVisionJson<Record<string, unknown>>(INSTRUCTION, await prepareImage(image));
    const masked = maskNumber(raw.idNumber ?? raw.idNumberMasked);
    const dob = text(raw.dob);
    const extracted = IdExtractSchema.parse({
      name: redact(text(raw.name), masked),
      dob,
      age: age(raw.age, dob),
      gender: gender(raw.gender),
      address: redact(text(raw.address), masked),
      district: text(raw.district),
      pincode: text(raw.pincode)?.replace(/\D/g, "").slice(0, 6) || null,
      idType: idType(raw.idType),
      idNumberMasked: masked,
    });

    return NextResponse.json(extracted);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read the ID";
    console.error("extract-id provider error", message);
    return NextResponse.json({ error: "We could not read the ID just now." }, { status: 400 });
  }
}
