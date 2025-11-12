import { SyncProvider } from "./components/SyncProvider";
import { Repos } from "./components/Repos";
import { ResetButton } from "./components/ResetButton";

export default function Home() {
  return (
    <SyncProvider>
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex min-h-screen w-full max-w-4xl flex-col gap-8 py-16 px-8 bg-white dark:bg-black">
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-bold tracking-tight text-black dark:text-zinc-50">
              GitHub Repositories
            </h1>
            <ResetButton />
          </div>

          <Repos owner="julianbenegas" />
        </main>
      </div>
    </SyncProvider>
  );
}
