import Link from "next/link";

export function InviteUnavailable({ message }: { message: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-white dark:bg-neutral-950 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-6 text-center">
        <h2 className="text-sm font-semibold text-red-700 dark:text-red-300">Invite unavailable</h2>
        <p className="mt-1.5 text-xs text-red-700 dark:text-red-300">{message}</p>
        <Link
          href="/"
          className="mt-4 inline-block text-xs text-neutral-500 underline-offset-4 hover:underline"
        >
          Go to sign in
        </Link>
      </div>
    </main>
  );
}
