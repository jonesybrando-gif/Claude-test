"use client";

import { disconnectDataSource } from "@/app/(app)/integrations/data-sources/actions";
import { Button } from "@/components/ui/button";

/**
 * Shared Disconnect button for data-source connections. With `offerDelete`, a
 * checkbox lets the admin delete everything imported through the login too.
 */
export function DisconnectDataSourceButton({ connectionId, confirmText, offerDelete }: { connectionId: string; confirmText?: string; offerDelete?: boolean }) {
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      action={disconnectDataSource.bind(null, connectionId)}
      onSubmit={(e) => {
        const del = (e.currentTarget.elements.namedItem("deleteData") as HTMLInputElement | null)?.checked;
        const text = del ? "Disconnect this login and permanently delete everything imported through it? This can't be undone." : confirmText ?? "Disconnect this login? Syncing stops for everything linked through it. Existing data is kept.";
        if (!confirm(text)) e.preventDefault();
      }}
    >
      {offerDelete && (
        <label className="flex items-center gap-1.5 text-xs text-text-2">
          <input type="checkbox" name="deleteData" value="1" /> Also delete imported data
        </label>
      )}
      <Button type="submit" variant="ghost" size="sm" className="text-critical-ink">Disconnect</Button>
    </form>
  );
}
