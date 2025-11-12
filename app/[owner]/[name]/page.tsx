import { SyncProvider } from "@/app/components/SyncProvider";
import { PRs } from "@/app/components/PRs";
import { ResetButton } from "@/app/components/ResetButton";
import { BackButton } from "@/app/components/BackButton";

export const dynamic = "force-static";

export default async function RepoPage({
  params,
}: {
  params: Promise<{ owner: string; name: string }>;
}) {
  const { owner, name } = await params;

  return (
    <SyncProvider>
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex min-h-screen w-full max-w-4xl flex-col gap-8 py-16 px-8 bg-white dark:bg-black">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <BackButton />
              <ResetButton />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-black dark:text-zinc-50">
              {owner}/{name}
            </h1>
          </div>

          <PRs owner={owner} name={name} />
        </main>
      </div>
    </SyncProvider>
  );
}
