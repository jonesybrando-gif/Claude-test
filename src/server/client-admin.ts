import "server-only";
import { prisma } from "./db";

// Removing clients and managing client labels. Callers check permissions.

export const LABEL_COLORS = ["neutral", "info", "good", "purple", "teal", "pink"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

export class ClientAdminError extends Error {}

async function clientInAgency(agencyId: string, clientId: string) {
  const c = await prisma.client.findFirst({ where: { id: clientId, agencyId }, select: { id: true, name: true, archivedAt: true } });
  if (!c) throw new ClientAdminError("Client not found.");
  return c;
}

/**
 * Removes a client from every list, report and alert. Its ad accounts stop
 * syncing and become free to link elsewhere; history, budgets and settings
 * are kept so the client can be restored.
 */
export async function archiveClient(agencyId: string, clientId: string): Promise<string> {
  const c = await clientInAgency(agencyId, clientId);
  const now = new Date();
  await prisma.$transaction([
    prisma.client.update({ where: { id: c.id }, data: { archivedAt: now } }),
    prisma.adAccount.updateMany({ where: { clientId: c.id, status: { not: "DISCONNECTED" } }, data: { status: "DISCONNECTED" } }),
    prisma.reportShareLink.updateMany({ where: { clientId: c.id, revokedAt: null }, data: { revokedAt: now } }),
    prisma.alert.updateMany({ where: { clientId: c.id, status: { not: "RESOLVED" } }, data: { status: "RESOLVED", resolvedAt: now } }),
  ]);
  return c.name;
}

/** Brings a removed client back. Its ad accounts stay unlinked until linked again. */
export async function restoreClient(agencyId: string, clientId: string): Promise<string> {
  const c = await clientInAgency(agencyId, clientId);
  await prisma.client.update({ where: { id: c.id }, data: { archivedAt: null } });
  return c.name;
}

/** Permanently deletes a removed client and all its data. Only allowed after removing. */
export async function deleteClientPermanently(agencyId: string, clientId: string): Promise<string> {
  const c = await clientInAgency(agencyId, clientId);
  if (!c.archivedAt) throw new ClientAdminError("Remove the client first; only removed clients can be deleted permanently.");
  await prisma.client.delete({ where: { id: c.id } });
  return c.name;
}

export async function createLabel(agencyId: string, rawName: string, color: string): Promise<{ id: string; name: string }> {
  const name = rawName.trim().replace(/\s+/g, " ");
  if (!name) throw new ClientAdminError("Enter a label name.");
  if (name.length > 40) throw new ClientAdminError("Keep label names to 40 characters or fewer.");
  const tone: LabelColor = (LABEL_COLORS as readonly string[]).includes(color) ? (color as LabelColor) : "neutral";
  const existing = await prisma.clientLabel.findFirst({ where: { agencyId, name: { equals: name, mode: "insensitive" } } });
  if (existing) throw new ClientAdminError(`A label called “${existing.name}” already exists.`);
  return prisma.clientLabel.create({ data: { agencyId, name, color: tone }, select: { id: true, name: true } });
}

export async function deleteLabel(agencyId: string, labelId: string): Promise<void> {
  await prisma.clientLabel.deleteMany({ where: { id: labelId, agencyId } });
}

/** Replaces a client's labels; ids from another agency are ignored. */
export async function setClientLabels(agencyId: string, clientId: string, labelIds: string[]): Promise<void> {
  const c = await clientInAgency(agencyId, clientId);
  const valid = await prisma.clientLabel.findMany({ where: { agencyId, id: { in: labelIds } }, select: { id: true } });
  await prisma.client.update({ where: { id: c.id }, data: { labels: { set: valid.map((l) => ({ id: l.id })) } } });
}

/** Adds or removes one label on many clients; ids outside the agency are ignored. Returns how many clients changed. */
export async function bulkLabel(agencyId: string, labelId: string, clientIds: string[], mode: "add" | "remove"): Promise<{ label: string; changed: number }> {
  const label = await prisma.clientLabel.findFirst({ where: { id: labelId, agencyId }, select: { id: true, name: true } });
  if (!label) throw new ClientAdminError("Choose a label.");
  const ids = [...new Set(clientIds)];
  if (!ids.length) throw new ClientAdminError("Select at least one client.");
  // Only clients in this agency that would actually change.
  const targets = await prisma.client.findMany({
    where: { id: { in: ids }, agencyId, labels: mode === "add" ? { none: { id: label.id } } : { some: { id: label.id } } },
    select: { id: true },
  });
  await prisma.clientLabel.update({
    where: { id: label.id },
    data: { clients: mode === "add" ? { connect: targets } : { disconnect: targets } },
  });
  return { label: label.name, changed: targets.length };
}

/** The agency's label with this name (any case), created if it doesn't exist yet. */
export async function findOrCreateLabel(agencyId: string, rawName: string): Promise<string> {
  const name = rawName.trim().replace(/\s+/g, " ");
  const existing = name ? await prisma.clientLabel.findFirst({ where: { agencyId, name: { equals: name, mode: "insensitive" } }, select: { id: true } }) : null;
  return existing?.id ?? (await createLabel(agencyId, name, "info")).id;
}
