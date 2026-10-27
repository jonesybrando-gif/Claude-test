import { redirect } from "next/navigation";

/** Dashboards live in the client page's "Dashboards" tab. */
export default async function ClientDashboardsIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/clients/${id}?tab=reports`);
}
