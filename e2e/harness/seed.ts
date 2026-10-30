import { env } from "../lib/env";
import { seedCalendar, seedStressCalendar } from "../seed/calendar";
import { seedFiles } from "../seed/files";
import { seedMail } from "../seed/mail";
import { rejections } from "../seed/report";
import { ftpSink } from "../seed/sinks/ftp";
import { s3Sink } from "../seed/sinks/s3";
import { sftpSink } from "../seed/sinks/sftp";
import { webdavSink } from "../seed/sinks/webdav";
import { loadMastraSeedSql, loadSeedSql } from "./database";

await loadSeedSql();
await loadMastraSeedSql();

await seedMail(env.imap);
await seedCalendar(env.caldav);
await seedStressCalendar(env.caldavStress);
await seedFiles(await s3Sink(env.s3), { bulkConcurrency: 32 });
await seedFiles(await webdavSink(env.webdav));
await seedFiles(await ftpSink(env.ftp));
await seedFiles(await sftpSink(env.sftp));

console.log(JSON.stringify({ seeded: true, rejectedByTestServers: rejections() }, null, 2));
