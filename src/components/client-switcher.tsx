"use client";

import { startNavigationProgress } from "@/components/navigation-progress";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronsUpDown } from "lucide-react";
import { switchClientHref } from "@/lib/client-nav";
import { ClientCombobox, type ComboOption } from "./ui/client-combobox";

/**
 * Jump to another client from the client header, staying on the same
 * sub-page and tab with the same date range.
 */
export function ClientSwitcher({ clientId, clients }: { clientId: string; clients: ComboOption[] }) {
  const router = useRouter();
  const pathname = usePathname() ?? `/clients/${clientId}`;
  const params = useSearchParams();
  if (clients.length < 2) return null;
  return (
    <ClientCombobox
      name="switchClient"
      options={clients}
      defaultValue={clientId}
      ariaLabel="Switch client"
      onChange={(id) => {
        startNavigationProgress();
        router.push(switchClientHref(pathname, params.toString(), id));
      }}
      buttonContent={<ChevronsUpDown className="h-4 w-4 text-text-2" aria-hidden />}
      className="h-10 w-10 shrink-0 justify-center border-transparent px-0 hover:bg-surface-2"
    />
  );
}
