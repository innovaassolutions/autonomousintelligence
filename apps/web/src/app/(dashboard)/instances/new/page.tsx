import { createServerClient } from "@/lib/supabase";
import { InstanceForm } from "../_components/instance-form";

export default async function NewInstancePage() {
  const supabase = createServerClient();
  const { data: beehiivAccounts } = await supabase
    .from("beehiiv_accounts")
    .select("id, name")
    .order("created_at", { ascending: true });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">New instance</h1>
        <p className="text-gray-500 text-sm mt-1">Configure a new newsletter vertical.</p>
      </div>
      <InstanceForm beehiivAccounts={beehiivAccounts ?? []} />
    </div>
  );
}
