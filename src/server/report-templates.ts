import "server-only";
import { prisma } from "./db";
import { DEFAULT_TEMPLATE, parseTemplate, type ReportTemplate } from "@/lib/report-template";

const KIND = "TEMPLATE";

async function findTemplateRow(agencyId: string, clientId: string | null) {
  return prisma.report.findFirst({ where: { agencyId, kind: KIND, clientId }, orderBy: { createdAt: "asc" } });
}

/** The agency default, falling back to the built-in template. */
export async function getAgencyTemplate(agencyId: string): Promise<ReportTemplate> {
  const row = await findTemplateRow(agencyId, null);
  return row ? parseTemplate(row.config, DEFAULT_TEMPLATE) : DEFAULT_TEMPLATE;
}

/**
 * The template a client's report uses: the client's override if it has one,
 * else the agency default. `custom` says whether an override exists.
 */
export async function getClientTemplate(agencyId: string, clientId: string): Promise<{ template: ReportTemplate; agency: ReportTemplate; custom: boolean }> {
  const [agencyRow, clientRow] = await Promise.all([findTemplateRow(agencyId, null), findTemplateRow(agencyId, clientId)]);
  const agency = agencyRow ? parseTemplate(agencyRow.config, DEFAULT_TEMPLATE) : DEFAULT_TEMPLATE;
  return { template: clientRow ? parseTemplate(clientRow.config, agency) : agency, agency, custom: !!clientRow };
}

/** Saves the agency default (clientId null) or a client override. Callers check permissions. */
export async function saveTemplate(agencyId: string, clientId: string | null, template: ReportTemplate): Promise<void> {
  const config = { ...template, sections: { ...template.sections } };
  await prisma.$transaction(async (tx) => {
    const existing = await tx.report.findFirst({ where: { agencyId, kind: KIND, clientId }, select: { id: true } });
    if (existing) await tx.report.update({ where: { id: existing.id }, data: { config, name: template.title } });
    else await tx.report.create({ data: { agencyId, clientId, kind: KIND, name: template.title, config } });
  });
}

/** Removes a client's override so it follows the agency default again. */
export async function resetClientTemplate(agencyId: string, clientId: string): Promise<void> {
  await prisma.report.deleteMany({ where: { agencyId, kind: KIND, clientId } });
}
