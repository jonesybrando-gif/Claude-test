/** Evaluate alerts and send due daily summaries for every agency:  npm run alerts */
import "dotenv/config";
import { runAllAlerts } from "../src/server/alerts";
import { prisma } from "../src/server/db";

runAllAlerts()
  .then((r) => {
    for (const a of r) console.log(`agency ${a.agencyId}: ${a.created} new, ${a.refreshed} still open, ${a.resolved} resolved, ${a.emailsQueued} alert emails, ${a.summaries} daily summaries`);
  })
  .finally(() => prisma.$disconnect());
