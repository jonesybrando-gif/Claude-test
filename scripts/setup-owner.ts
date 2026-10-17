/**
 * Create your agency and your administrator login, then print a one-time link
 * to set your password (no password ever goes through the command line).
 *
 *   npm run setup:owner -- --email you@agency.com --name "Your Name" --agency "Your Agency" [--timezone America/Chicago] [--remove-demo]
 *
 * Running it again for an existing email just prints a fresh password link.
 * --remove-demo deletes the demo agency (and its demo logins) created by `npm run db:seed`.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { prisma } from "../src/server/db";
import { createAuthToken } from "../src/server/auth-tokens";
import { appUrl } from "../src/server/email";
import { slug } from "../src/lib/csv";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      agency: { type: "string" },
      timezone: { type: "string", default: "America/New_York" },
      "remove-demo": { type: "boolean", default: false },
    },
  });
  const email = values.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Pass --email you@agency.com");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: values.timezone });
  } catch {
    throw new Error(`Unknown time zone: ${values.timezone}`);
  }

  if (values["remove-demo"]) {
    const { count } = await prisma.agency.deleteMany({ where: { slug: "demo-agency" } });
    console.log(count ? "Removed the demo agency and its demo logins." : "No demo agency to remove.");
  }

  let user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    if (user.role !== "AGENCY_ADMIN") throw new Error(`${email} exists but is not an administrator; change their role in Settings → Team instead.`);
    if (user.deactivatedAt) user = await prisma.user.update({ where: { id: user.id }, data: { deactivatedAt: null } });
    console.log(`${email} already exists in agency ${user.agencyId}.`);
  } else {
    if (!values.name?.trim() || !values.agency?.trim()) throw new Error('Pass --name "Your Name" and --agency "Your Agency" for a new account');
    let s = slug(values.agency);
    if (await prisma.agency.findUnique({ where: { slug: s } })) s = `${s}-${Date.now().toString(36)}`;
    const agency = await prisma.agency.create({ data: { name: values.agency.trim(), slug: s, defaultTimezone: values.timezone } });
    user = await prisma.user.create({ data: { agencyId: agency.id, email, name: values.name.trim(), role: "AGENCY_ADMIN", passwordHash: null } });
    console.log(`Created agency "${agency.name}" and administrator ${email}.`);
  }

  const kind = user.passwordHash ? "PASSWORD_RESET" : "INVITE";
  const token = await createAuthToken(user.id, kind);
  const link = appUrl(kind === "INVITE" ? `/accept-invite?token=${token}` : `/reset-password?token=${token}`);
  console.log(`\nOpen this link to ${kind === "INVITE" ? "set" : "reset"} your password (single use, expires in ${kind === "INVITE" ? "72 hours" : "60 minutes"}):\n\n  ${link}\n`);
  if (!process.env.APP_URL) console.log("(APP_URL isn't set, so the link uses http://localhost:3000.)");
}

main()
  .catch((e) => {
    console.error(`Error: ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
