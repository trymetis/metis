PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('7642b8e9-1f5e-4985-b4ac-3491a3b1b2cb','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','drive-chat','openai-compatible','metis/demo',18042,1316,19358,0,0,0,5,'stop','cd2fbe69-2a99-4cae-a136-bd0da5176676',1795579730510);
COMMIT;
