import { schemaMigration } from "@/db/migrations";

const NOW = "(strftime('%s', 'now') * 1000)";

const SYSTEM_THEMES: [string, string, string, string][] = [
  [
    "dd6487c8-2339-4f3c-8604-4178e640ab66",
    "amber",
    "Amber",
    '{"light":{"bg-base":"#faf8f3","bg-panel":"#f4f1e8","bg-surface":"#ffffff","bg-hover":"#ebe7d8","bg-active":"#e4dec8","bg-selected":"#e8e1c5","border":"rgba(60, 50, 30, 0.1)","border-soft":"rgba(60, 50, 30, 0.05)","text-primary":"#2a2620","text-secondary":"#676254","text-muted":"#9a9484","text-faint":"#787367","brand":"#b07d1f","brand-text":"#815b17","brand-on-tint":"#745214","brand-mark":"#a5751d","brand-soft":"rgba(176, 125, 31, 0.15)","brand-glow":"rgba(176, 125, 31, 0.08)"},"dark":{"bg-base":"#111110","bg-panel":"#161614","bg-surface":"#1c1c1a","bg-hover":"#222220","bg-active":"#252523","bg-selected":"#2a2925","border":"rgba(255, 255, 255, 0.07)","border-soft":"rgba(255, 255, 255, 0.04)","text-primary":"#e8e4d8","text-secondary":"#938f83","text-muted":"#4a4740","text-faint":"#7f7c77","brand":"#c8922a","brand-text":"#c8922a","brand-on-tint":"#d59e35","brand-mark":"#c8922a","brand-soft":"rgba(200, 146, 42, 0.12)","brand-glow":"rgba(200, 146, 42, 0.06)"}}',
  ],
  [
    "8edf8467-6fba-448b-9ead-38934e33906c",
    "blue",
    "Blue",
    '{"light":{"bg-base":"#f7f9ff","bg-panel":"#eef3ff","bg-surface":"#ffffff","bg-hover":"#e3ebff","bg-active":"#d8e3ff","bg-selected":"#cedcff","border":"rgba(30, 60, 120, 0.1)","border-soft":"rgba(30, 60, 120, 0.05)","text-primary":"#1f2937","text-secondary":"#546279","text-muted":"#96a3b8","text-faint":"#697381","brand":"#2563eb","brand-text":"#2158d2","brand-on-tint":"#1248c0","brand-mark":"#2563eb","brand-soft":"rgba(37, 99, 235, 0.14)","brand-glow":"rgba(37, 99, 235, 0.08)"},"dark":{"bg-base":"#0f1117","bg-panel":"#141821","bg-surface":"#1a2030","bg-hover":"#20283a","bg-active":"#253047","bg-selected":"#2a3654","border":"rgba(210, 225, 255, 0.08)","border-soft":"rgba(210, 225, 255, 0.04)","text-primary":"#e6edf7","text-secondary":"#94a3b8","text-muted":"#4f5f75","text-faint":"#808c9b","brand":"#60a5fa","brand-text":"#60a5fa","brand-on-tint":"#8abdfb","brand-mark":"#60a5fa","brand-soft":"rgba(96, 165, 250, 0.13)","brand-glow":"rgba(96, 165, 250, 0.07)"}}',
  ],
  [
    "8e26cce6-e206-4999-81fd-e2f297d8f680",
    "violet",
    "Violet",
    '{"light":{"bg-base":"#fbf8ff","bg-panel":"#f3edff","bg-surface":"#ffffff","bg-hover":"#ebe0ff","bg-active":"#e1d2ff","bg-selected":"#d9c7ff","border":"rgba(85, 45, 130, 0.1)","border-soft":"rgba(85, 45, 130, 0.05)","text-primary":"#2d2638","text-secondary":"#5f556d","text-muted":"#9b91aa","text-faint":"#6e6778","brand":"#7c3aed","brand-text":"#6c33cf","brand-on-tint":"#5813cf","brand-mark":"#7c3aed","brand-soft":"rgba(124, 58, 237, 0.14)","brand-glow":"rgba(124, 58, 237, 0.08)"},"dark":{"bg-base":"#121016","bg-panel":"#191520","bg-surface":"#201b2b","bg-hover":"#292139","bg-active":"#302743","bg-selected":"#392d50","border":"rgba(232, 220, 255, 0.08)","border-soft":"rgba(232, 220, 255, 0.04)","text-primary":"#ede7f7","text-secondary":"#a59ab6","text-muted":"#5c5367","text-faint":"#8b8593","brand":"#a78bfa","brand-text":"#a78bfa","brand-on-tint":"#bca7fb","brand-mark":"#a78bfa","brand-soft":"rgba(167, 139, 250, 0.13)","brand-glow":"rgba(167, 139, 250, 0.07)"}}',
  ],
  [
    "1f3f1793-59b8-4001-8118-c2a20800479f",
    "emerald",
    "Emerald",
    '{"light":{"bg-base":"#f5fbf8","bg-panel":"#eaf6ef","bg-surface":"#ffffff","bg-hover":"#dff0e7","bg-active":"#d4eadf","bg-selected":"#c7e4d5","border":"rgba(30, 95, 65, 0.1)","border-soft":"rgba(30, 95, 65, 0.05)","text-primary":"#1f2d27","text-secondary":"#54665e","text-muted":"#8ea197","text-faint":"#69766f","brand":"#059669","brand-text":"#04704f","brand-on-tint":"#036345","brand-mark":"#058f64","brand-soft":"rgba(5, 150, 105, 0.14)","brand-glow":"rgba(5, 150, 105, 0.08)"},"dark":{"bg-base":"#0e1210","bg-panel":"#131a16","bg-surface":"#19221d","bg-hover":"#1f2b24","bg-active":"#24332b","bg-selected":"#293c31","border":"rgba(210, 245, 228, 0.08)","border-soft":"rgba(210, 245, 228, 0.04)","text-primary":"#e2efe8","text-secondary":"#91a89c","text-muted":"#4e6158","text-faint":"#829089","brand":"#34d399","brand-text":"#34d399","brand-on-tint":"#45d7a2","brand-mark":"#34d399","brand-soft":"rgba(52, 211, 153, 0.13)","brand-glow":"rgba(52, 211, 153, 0.07)"}}',
  ],
  [
    "39498b57-48ef-4a7d-be47-59cd152458dd",
    "rose",
    "Rose",
    '{"light":{"bg-base":"#fff7f8","bg-panel":"#fdecef","bg-surface":"#ffffff","bg-hover":"#f9dfe5","bg-active":"#f4d3dc","bg-selected":"#efc6d2","border":"rgba(130, 35, 55, 0.1)","border-soft":"rgba(130, 35, 55, 0.05)","text-primary":"#342226","text-secondary":"#6d535b","text-muted":"#aa8e97","text-faint":"#7a656c","brand":"#e11d48","brand-text":"#b01738","brand-on-tint":"#951330","brand-mark":"#e11d48","brand-soft":"rgba(225, 29, 72, 0.13)","brand-glow":"rgba(225, 29, 72, 0.08)"},"dark":{"bg-base":"#151012","bg-panel":"#1d1518","bg-surface":"#261b20","bg-hover":"#302129","bg-active":"#392730","bg-selected":"#432d38","border":"rgba(255, 218, 226, 0.08)","border-soft":"rgba(255, 218, 226, 0.04)","text-primary":"#f4e6e9","text-secondary":"#b89aa3","text-muted":"#6a535a","text-faint":"#948388","brand":"#fb7185","brand-text":"#fb7185","brand-on-tint":"#fc95a4","brand-mark":"#fb7185","brand-soft":"rgba(251, 113, 133, 0.13)","brand-glow":"rgba(251, 113, 133, 0.07)"}}',
  ],
  [
    "d7bd2ea9-5072-4924-8572-bba38c05e701",
    "slate",
    "Slate",
    '{"light":{"bg-base":"#f8fafc","bg-panel":"#f1f5f9","bg-surface":"#ffffff","bg-hover":"#e8eef5","bg-active":"#dfe7f0","bg-selected":"#d7e0eb","border":"rgba(45, 55, 70, 0.1)","border-soft":"rgba(45, 55, 70, 0.05)","text-primary":"#202733","text-secondary":"#596474","text-muted":"#9aa5b5","text-faint":"#6d7480","brand":"#475569","brand-text":"#475569","brand-on-tint":"#465467","brand-mark":"#475569","brand-soft":"rgba(71, 85, 105, 0.14)","brand-glow":"rgba(71, 85, 105, 0.08)"},"dark":{"bg-base":"#0f1114","bg-panel":"#15181d","bg-surface":"#1b2027","bg-hover":"#222933","bg-active":"#28313d","bg-selected":"#303a49","border":"rgba(226, 232, 240, 0.08)","border-soft":"rgba(226, 232, 240, 0.04)","text-primary":"#e7ebf0","text-secondary":"#9ca8b8","text-muted":"#566273","text-faint":"#868f9b","brand":"#94a3b8","brand-text":"#95a4b8","brand-on-tint":"#b2bdcc","brand-mark":"#94a3b8","brand-soft":"rgba(148, 163, 184, 0.13)","brand-glow":"rgba(148, 163, 184, 0.07)"}}',
  ],
  [
    "a2514c4c-ef67-4ca5-96f6-67294650529e",
    "graphite",
    "Graphite",
    '{"light":{"bg-base":"#f7f7f8","bg-panel":"#efeff1","bg-surface":"#ffffff","bg-hover":"#e6e6e9","bg-active":"#dcdce0","bg-selected":"#d4d4d9","border":"rgba(20, 20, 24, 0.1)","border-soft":"rgba(20, 20, 24, 0.05)","text-primary":"#121214","text-secondary":"#55555c","text-muted":"#9a9aa2","text-faint":"#6b6b73","brand":"#18181b","brand-text":"#18181b","brand-on-tint":"#18181b","brand-mark":"#18181b","brand-soft":"rgba(24, 24, 27, 0.12)","brand-glow":"rgba(24, 24, 27, 0.06)"},"dark":{"bg-base":"#000000","bg-panel":"#070708","bg-surface":"#0e0e10","bg-hover":"#161618","bg-active":"#1d1d20","bg-selected":"#252529","border":"rgba(255, 255, 255, 0.08)","border-soft":"rgba(255, 255, 255, 0.04)","text-primary":"#ececee","text-secondary":"#a1a1a8","text-muted":"#52525a","text-faint":"#85858d","brand":"#e4e4e7","brand-text":"#e4e4e7","brand-on-tint":"#f4f4f5","brand-mark":"#e4e4e7","brand-soft":"rgba(228, 228, 231, 0.12)","brand-glow":"rgba(228, 228, 231, 0.06)"}}',
  ],
];

const DEFAULT_THEME_ID = "a2514c4c-ef67-4ca5-96f6-67294650529e";

const LEGACY_BRANDS = ["amber", "blue", "violet", "emerald", "rose", "slate"];

export default schemaMigration("0011_themes", [
  "CREATE TABLE `theme` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`workspace_id` text,\n\t`system_key` text,\n\t`name` text NOT NULL,\n\t`tokens` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  "CREATE INDEX `theme_workspace_idx` ON `theme` (`workspace_id`)",
  "CREATE UNIQUE INDEX `theme_system_key_idx` ON `theme` (`system_key`)",
  "CREATE UNIQUE INDEX `theme_workspace_name_idx` ON `theme` (`workspace_id`,`name`)",
  'CREATE UNIQUE INDEX `theme_instance_name_idx` ON `theme` (`name`) WHERE "theme"."workspace_id" is null',
  ...SYSTEM_THEMES.map(([id, key, name, tokens]) => ({
    sql: `INSERT INTO \`theme\` (\`id\`, \`workspace_id\`, \`system_key\`, \`name\`, \`tokens\`, \`created_at\`, \`updated_at\`) VALUES (?, NULL, ?, ?, ?, ${NOW}, ${NOW})`,
    args: [id, key, name, tokens],
  })),
  `ALTER TABLE \`workspace\` ADD \`theme_id\` text DEFAULT '${DEFAULT_THEME_ID}' NOT NULL REFERENCES theme(id) ON DELETE set default`,
  {
    sql: `UPDATE \`workspace\` SET \`theme_id\` = (SELECT \`theme\`.\`id\` FROM \`theme\` WHERE \`theme\`.\`system_key\` = json_extract(\`workspace\`.\`branding\`, '$.themeBrand')) WHERE json_extract(\`branding\`, '$.themeBrand') IN (${LEGACY_BRANDS.map(() => "?").join(", ")})`,
    args: LEGACY_BRANDS,
  },
  "UPDATE `workspace` SET `branding` = CASE WHEN json_remove(`branding`, '$.themeBrand') = '{}' THEN NULL ELSE json_remove(`branding`, '$.themeBrand') END WHERE json_extract(`branding`, '$.themeBrand') IS NOT NULL",
]);
