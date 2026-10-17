"use client";

import { useRouter } from "next/navigation";
import { Select, Label } from "./ui/input";

export function ClientJump({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="client-jump">Jump to client</Label>
      <Select id="client-jump" defaultValue="" onChange={(e) => e.target.value && router.push(`/clients/${e.target.value}`)}>
        <option value="" disabled>Select…</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </Select>
    </div>
  );
}
