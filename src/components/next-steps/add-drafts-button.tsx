"use client";

import { useTransition } from "react";
import { addDraftStepsAction } from "@/app/(app)/clients/[id]/next-steps-actions";
import { Button } from "@/components/ui/button";

export function AddDraftsButton({ clientId, texts }: { clientId: string; texts: string[] }) {
  const [pending, start] = useTransition();
  return (
    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => start(() => addDraftStepsAction(clientId, texts))}>
      {pending ? "Adding…" : "Add as drafts"}
    </Button>
  );
}
