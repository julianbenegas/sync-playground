import Link from "next/link";
import { SyncProvider } from "@/app/components/SyncProvider";
import { PRs } from "@/app/components/PRs";
import { ResetButton } from "@/app/components/ResetButton";

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
              <Link
                href="/"
                className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              >
                ← Back to repositories
              </Link>
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
