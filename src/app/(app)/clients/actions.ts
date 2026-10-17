"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/access";

export type ClientFormState = { errors?: string[] } | undefined;

const schema = z.object({
  name: z.string().trim().min(1, "Enter a client name").max(120),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid timezone"),
  managerId: z.string().optional(),
});

export async function createClient(_prev: ClientFormState, form: FormData): Promise<ClientFormState> {
  const user = await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const managerId = parsed.data.managerId
    ? (await prisma.user.findFirst({ where: { id: parsed.data.managerId, agencyId: user.agencyId, role: "ACCOUNT_MANAGER" } }))?.id ?? null
    : null;
  const client = await prisma.client.create({
    data: {
      agencyId: user.agencyId,
      name: parsed.data.name,
      timezone: parsed.data.timezone,
      primaryManagerId: managerId,
      assignments: managerId ? { create: [{ userId: managerId }] } : undefined,
    },
  });
  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
}
