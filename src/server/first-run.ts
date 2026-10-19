import "server-only";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "./db";

// First-run setup (/setup) for a fresh deployment, as a browser alternative to
// `npm run setup:owner`. It is open only while SETUP_TOKEN is set (24+
// characters) and the database has no users; after that it's a 404.

const token = () => process.env.SETUP_TOKEN ?? "";

export async function setupAvailable(): Promise<boolean> {
  return token().length >= 24 && (await prisma.user.count()) === 0;
}

export function setupTokenMatches(given: string): boolean {
  const expected = Buffer.from(token());
  const got = Buffer.from(given);
  return expected.length >= 24 && got.length === expected.length && timingSafeEqual(got, expected);
}
