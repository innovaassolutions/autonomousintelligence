import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gray-900 text-white">
        <div className="max-w-6xl mx-auto px-6 flex items-center gap-8 h-14">
          <span className="font-semibold tracking-tight">Autonomous Intelligence</span>
          <div className="flex items-center gap-6 text-sm text-gray-300">
            <Link href="/editions" className="hover:text-white transition-colors">Editions</Link>
            <Link href="/instances" className="hover:text-white transition-colors">Instances</Link>
            <Link href="/analytics" className="hover:text-white transition-colors">Analytics</Link>
            <Link href="/settings/beehiiv" className="hover:text-white transition-colors">Settings</Link>
          </div>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}
