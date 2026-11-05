import { type ConnectionAuth, type DriveProvider, oauthToken } from "@/connections";
import {
  ftpCredentials,
  s3Credentials,
  sftpCredentials,
  webdavCredentials,
} from "@/connections/types";
import type { AstSearch } from "@/search/types";
import type {
  DriveDownloadTarget,
  DriveEntry,
  DriveListing,
  DriveQuota,
  DriveStream,
  DriveUploadSession,
  NewUpload,
} from "@/types/drive";

import { ftpDrive } from "./providers/ftp";
import { googleDrive } from "./providers/google";
import { microsoftDrive } from "./providers/microsoft";
import { s3Drive } from "./providers/s3";
import { sftpDrive } from "./providers/sftp";
import { webdavDrive } from "./providers/webdav";
import type { RelayScope } from "./relay";

export interface DriveChangeSignal {
  cursor: string;
  changed: boolean;
  expired?: boolean;
}

export interface DriveAdapter {
  listFolder(parentId: string | null, cursor?: string): Promise<DriveListing>;
  search(query: string, cursor?: string): Promise<DriveListing>;
  searchAst(search: AstSearch<DriveEntry>): Promise<DriveListing>;
  getEntry(fileId: string): Promise<DriveEntry>;
  getDownloadTarget(fileId: string): Promise<DriveDownloadTarget>;
  createUploadSession(upload: NewUpload): Promise<DriveUploadSession>;
  readStream(fileId: string, signal: AbortSignal): Promise<DriveStream>;
  writeStream(
    upload: NewUpload,
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
  ): Promise<DriveEntry>;
  createFolder(parentId: string | null, name: string): Promise<DriveEntry>;
  rename(fileId: string, name: string): Promise<void>;
  move(fileId: string, newParentId: string | null): Promise<void>;
  delete(fileId: string): Promise<void>;
  quota(): Promise<DriveQuota | null>;
  changes?(folderId: string | null, cursor: string | null): Promise<DriveChangeSignal | null>;
  topAncestor?(fileId: string): string;
}

const DRIVE_ADAPTERS: Record<
  DriveProvider,
  (auth: ConnectionAuth, selfEmail: string, scope?: RelayScope) => DriveAdapter
> = {
  google: (auth, self) => googleDrive(oauthToken(auth), self),
  microsoft: (auth) => microsoftDrive(oauthToken(auth)),
  s3: (auth, _self, scope) => s3Drive(s3Credentials(auth), scope),
  webdav: (auth, _self, scope) => webdavDrive(webdavCredentials(auth), scope),
  ftp: (auth, _self, scope) => ftpDrive(ftpCredentials(auth), scope),
  sftp: (auth, _self, scope) => sftpDrive(sftpCredentials(auth), scope),
};

export function getDriveAdapter(
  provider: DriveProvider,
  auth: ConnectionAuth,
  selfEmail = "",
  scope?: RelayScope,
): DriveAdapter {
  return DRIVE_ADAPTERS[provider](auth, selfEmail, scope);
}
