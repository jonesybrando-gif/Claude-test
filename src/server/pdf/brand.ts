import "server-only";
import { prisma } from "../db";
import { fetchLogo, type Brand } from "./primitives";

export async function agencyBrand(agencyId: string): Promise<Brand & { timezone: string }> {
  const a = await prisma.agency.findUniqueOrThrow({ where: { id: agencyId } });
  return { name: a.name, color: a.brandColor, header: a.reportHeader, footer: a.reportFooter, logo: await fetchLogo(a.logoUrl), timezone: a.defaultTimezone };
}

/**
 * Branding for a client's own copy of their report: the client's logo and
 * name in the page header, never the agency's. The agency's colour and its
 * report header/footer text still apply (the agency writes those).
 */
export async function clientReportBrand(agencyId: string, client: { name: string; logoUrl: string | null }): Promise<Brand & { timezone: string }> {
  const agency = await agencyBrand(agencyId);
  return { ...agency, name: client.name, logo: await fetchLogo(client.logoUrl) };
}
