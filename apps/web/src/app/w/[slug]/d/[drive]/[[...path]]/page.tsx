import { DriveShell } from "./_components/drive-shell";

export default async function DrivePage({ params }: PageProps<"/w/[slug]/d/[drive]/[[...path]]">) {
  const { path } = await params;
  const trail = (path ?? []).map(decodeURIComponent);
  return <DriveShell trail={trail} />;
}
