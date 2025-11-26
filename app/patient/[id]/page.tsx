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
      <h2 className="text-5xl w-[25%] text-center font-bold text-white px-6">
        Patient Overview
      </h2>
      <div className="w-full rounded-t-xl bg-[#D9D9D9]/95 min-h-screen pt-10 flex justify-center">

      <PatientDetailView patientId={id} />
      </div>
    </div>
  );
}

