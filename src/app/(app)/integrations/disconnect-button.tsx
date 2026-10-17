"use client";

import { disconnectConnection } from "./actions";
import { Button } from "@/components/ui/button";

export function DisconnectButton({ connectionId }: { connectionId: string }) {
  return (
    <form
      action={disconnectConnection.bind(null, connectionId)}
      onSubmit={(e) => {
        if (!confirm("Disconnect this login? Syncing stops for every account linked through it. Existing data is kept.")) e.preventDefault();
      }}
    >
      <Button type="submit" variant="ghost" size="sm" className="text-critical-ink">Disconnect</Button>
    </form>
  );
}
