PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('5749fa51-587f-4f9f-aeaf-568e66bcda35','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','drive-chat','openai-compatible','metis/demo',20892,1605,22497,0,0,0,5,'stop','3e9234fd-dc05-4bab-a1c3-dcd70905de4b',1795410690235);
COMMIT;
