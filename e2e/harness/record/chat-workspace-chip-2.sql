PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('37385c19-f394-4ece-858d-a5543ae01391','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','workspace-chat','openai-compatible','deepseek/deepseek-v4.1-flash:floor',324882,9255,334137,0,0,0,13,'stop','d7b2e6c4-8598-482d-9b8b-f75256417da6',1795322050915);
COMMIT;
