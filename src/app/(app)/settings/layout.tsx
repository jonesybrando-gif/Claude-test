import { requireAdmin } from "@/server/access";
import { SettingsTabs } from "./tabs";

export const metadata = { title: "Settings" };

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <SettingsTabs />
      </div>
      {children}
    </div>
  );
}
