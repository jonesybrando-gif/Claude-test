import "server-only";
import type { DataSourceConnection } from "@prisma/client";
import { prisma } from "../../db";
import { readSecret } from "../credentials";
import { getUserData } from "./api";

/** The agency's DataForSEO login (at most one is kept), or null. Disconnected logins are ignored. */
export async function agencyDataForSeoConnection(agencyId: string): Promise<DataSourceConnection | null> {
  return prisma.dataSourceConnection.findFirst({
    where: { agencyId, provider: "DATAFORSEO", status: { not: "DISCONNECTED" } },
    orderBy: { createdAt: "desc" },
  });
}

/** Live account balance in USD from /appendix/user_data. Never throws. */
export async function dataForSeoBalance(c: DataSourceConnection | null): Promise<{ balance: number | null; error?: string }> {
  if (!c || c.status !== "ACTIVE") return { balance: null };
  try {
    const secret = readSecret(c);
    if (!secret) return { balance: null, error: "No API login stored." };
    return { balance: (await getUserData(secret)).balance };
  } catch (e) {
    return { balance: null, error: (e as Error).message };
  }
}

export const formatUsd = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
