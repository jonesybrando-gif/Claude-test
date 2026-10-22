import "server-only";
import { agencyLogo } from "@/lib/logo";
import { prisma } from "../db";
import { fetchLogo, type Brand } from "./primitives";

export async function agencyBrand(agencyId: string): Promise<Brand & { timezone: string }> {
  const a = await prisma.agency.findUniqueOrThrow({ where: { id: agencyId } });
  return { name: a.name, color: a.brandColor, header: a.reportHeader, footer: a.reportFooter, logo: await fetchLogo(agencyLogo(a)), timezone: a.defaultTimezone };
}
