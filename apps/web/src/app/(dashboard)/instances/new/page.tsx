import { InstanceForm } from "../_components/instance-form";

export default function NewInstancePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">New instance</h1>
        <p className="text-gray-500 text-sm mt-1">Configure a new newsletter vertical.</p>
      </div>
      <InstanceForm />
    </div>
  );
}
