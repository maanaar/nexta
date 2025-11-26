import PatientDetailView from "@/components/PatientDetailView";

type PatientParams = { id: string };

export default async function PatientPage({
  params,
}: {
  params: Promise<PatientParams>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-col min-h-screen gap-2 pt-12">
      <h1 className="text-3xl font-semibold text-white/90">Patient Overview</h1>
      <div className="w-full rounded-t-xl bg-[#D9D9D9]/95 min-h-screen pt-10 flex justify-center">

      <PatientDetailView patientId={id} />
      </div>
    </div>
  );
}

