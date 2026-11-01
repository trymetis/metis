PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('6c2a64e8-8d52-4ecf-af9f-c5b9e6351f1f','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','workspace-chat','openai-compatible','deepseek/deepseek-v4.1-flash:floor',33911,1812,35723,0,0,0,5,'tool-calls','af6d8847-cec2-4244-9bf3-8c3c24cf109d',1793534201647);
COMMIT;
