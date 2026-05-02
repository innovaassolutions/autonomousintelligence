import { createServerClient } from "@/lib/supabase";
import { BeehiivAccountsManager } from "./_components/beehiiv-accounts-manager";

export const revalidate = 0;

export default async function BeehiivSettingsPage() {
  const supabase = createServerClient();

  const { data: accounts } = await supabase
    .from("beehiiv_accounts")
    .select("id, name, created_at")
    .order("created_at", { ascending: true });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Beehiiv Accounts</h1>
        <p className="text-gray-500 text-sm mt-1">
          API keys are encrypted at rest using Supabase Vault. Each newsletter instance selects one account.
        </p>
      </div>
      <BeehiivAccountsManager initialAccounts={accounts ?? []} />
    </div>
  );
}
