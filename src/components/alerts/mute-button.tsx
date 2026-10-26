"use client";

import { useTransition } from "react";
import { muteAlertType, unmuteAlertType } from "@/app/(app)/alerts/actions";
import { Button } from "@/components/ui/button";

/** "Mute for this client" (with a confirm step) or "Unmute" for one alert type. */
export function MuteAlertTypeButton({ clientId, type, typeLabel, muted = false }: { clientId: string; type: string; typeLabel: string; muted?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (muted) return start(() => unmuteAlertType(clientId, type));
        if (window.confirm(`Stop “${typeLabel}” alerts for this client? Open ones close, and no new ones (or emails) are sent until you unmute.`)) start(() => muteAlertType(clientId, type));
      }}
    >
      {pending ? "Saving…" : muted ? "Unmute" : "Mute for this client"}
    </Button>
  );
}
