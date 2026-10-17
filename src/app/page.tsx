import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";

export default async function Home() {
  const user = await requireUser();
  redirect(user.role === "CLIENT_USER" && user.clientId ? `/clients/${user.clientId}` : "/dashboard");
}
