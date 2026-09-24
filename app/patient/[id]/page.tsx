import PatientDetailView from "@/components/PatientDetailView";

type PatientParams = { id: string };

export default async function PatientPage({
  params,
}: {
  params: Promise<PatientParams>;
}) {
  const { id } = await params;

  return <PatientDetailView patientId={id} />;
}
