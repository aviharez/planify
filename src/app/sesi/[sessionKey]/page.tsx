import MainExperience from "@/features/main/MainExperience";

export default async function SessionPage({ params }: { params: Promise<{ sessionKey: string }> }) {
  const { sessionKey } = await params;
  return <MainExperience view="sesi" sessionKey={sessionKey} />;
}
