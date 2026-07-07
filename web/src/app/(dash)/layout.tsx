import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { getSessionUser } from "@/lib/auth";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} />
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
