import type { DriveProvider } from "@/connections/types";

export const DRIVE_PROVIDER_LABELS: Record<DriveProvider, string> = {
  google: "Google Drive",
  microsoft: "OneDrive",
  s3: "S3 storage",
  webdav: "WebDAV",
  ftp: "FTP",
  sftp: "SFTP",
};

export interface NamedDrive {
  provider: DriveProvider;
  email: string;
  server: string | null;
}

function baseName(drive: NamedDrive): string {
  return drive.server ?? `${DRIVE_PROVIDER_LABELS[drive.provider]} · ${drive.email}`;
}

export function driveName(drive: NamedDrive, all: readonly NamedDrive[]): string {
  const base = baseName(drive);
  if (drive.server === null) return base;
  const clash = all.some(
    (other) =>
      other.server !== null && other.provider !== drive.provider && baseName(other) === base,
  );
  return clash ? `${base} · ${DRIVE_PROVIDER_LABELS[drive.provider]}` : base;
}
