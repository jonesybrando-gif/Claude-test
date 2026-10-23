"use client";

import { disconnectDataSource } from "@/app/(app)/integrations/data-sources/actions";
import { Button } from "@/components/ui/button";

/** Shared Disconnect button for data-source connections (never revokes at the provider). */
export function DisconnectDataSourceButton({ connectionId, confirmText }: { connectionId: string; confirmText?: string }) {
  return (
    <form
      action={disconnectDataSource.bind(null, connectionId)}
      onSubmit={(e) => {
        if (!confirm(confirmText ?? "Disconnect this login? Syncing stops for everything linked through it. Existing data is kept.")) e.preventDefault();
      }}
    >
      <Button type="submit" variant="ghost" size="sm" className="text-critical-ink">Disconnect</Button>
    </form>
  );
}
