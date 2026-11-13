export interface SeededExport {
  createdAt: string;
  appVersion: string;
  migration: string;
  maintenanceSince: string | null;
  fileName: string;
  size: number;
  sha256: string;
  recipients: { fingerprint: string; passphrase: boolean }[];
  locations: {
    kind: "instance" | "local" | "s3";
    location: string;
    host: string | null;
    endpoint: string | null;
  }[];
  instanceUrl: string;
}

export const SEEDED_EXPORTS: SeededExport[] = [
  {
    createdAt: "2026-11-10T09:00:00.000Z",
    appVersion: "0.3.1",
    migration: "0009_mail_signatures",
    maintenanceSince: "2026-11-10T08:58:00.000Z",
    fileName: "metis-export-20261110T090000Z.tar",
    size: 48_234_496,
    sha256: "5f2c1a0e9b8d7c6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a29",
    recipients: [{ fingerprint: "3f2a9c0d4b1e8a7f6c5d2e1b0a9f8e7d", passphrase: false }],
    locations: [
      {
        kind: "instance",
        location: "/opt/metis-suite/exports/metis-export-20261110T090000Z.tar",
        host: "mail-server-1",
        endpoint: null,
      },
    ],
    instanceUrl: "https://mail.example.com",
  },
  {
    createdAt: "2026-11-11T10:00:00.000Z",
    appVersion: "0.3.2",
    migration: "0009_mail_signatures",
    maintenanceSince: null,
    fileName: "metis-export-20261111T100000Z.tar",
    size: 50_331_648,
    sha256: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    recipients: [
      { fingerprint: "3f2a9c0d4b1e8a7f6c5d2e1b0a9f8e7d", passphrase: false },
      { fingerprint: "a1b2c3d4e5f60718293a4b5c6d7e8f90", passphrase: true },
    ],
    locations: [
      {
        kind: "s3",
        location: "s3://acme-backups/metis/metis-export-20261111T100000Z.tar",
        host: null,
        endpoint: null,
      },
      {
        kind: "local",
        location: "/home/owner/backups/metis-export-20261111T100000Z.tar",
        host: "owner-laptop",
        endpoint: null,
      },
    ],
    instanceUrl: "https://mail.example.com",
  },
];
