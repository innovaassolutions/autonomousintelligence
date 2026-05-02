import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import { InstanceForm } from "../../_components/instance-form";

export default async function EditInstancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data: instance, error } = await supabase
    .from("newsletter_instances")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !instance) {
    notFound();
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Edit instance</h1>
        <p className="text-gray-500 text-sm mt-1">{instance.name}</p>
      </div>
      <InstanceForm instanceId={id} defaultValues={instance} />
    </div>
  );
}
