export const EXPORT_LOCATION_KINDS = ["instance", "local", "s3"] as const;
export type ExportLocationKind = (typeof EXPORT_LOCATION_KINDS)[number];

export interface ExportRecipient {
  fingerprint: string;
  passphrase: boolean;
}

export interface ExportLocation {
  kind: ExportLocationKind;
  location: string;
  host: string | null;
  endpoint: string | null;
}
