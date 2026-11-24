PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('017aec41-b9df-4af7-b733-4d5f8b7c43d7','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','drive-chat','openai-compatible','deepseek/deepseek-v4.1-flash:floor',23396,2457,25853,0,0,0,6,'stop','72ff77bd-5233-4069-8c12-9c1a83afe40d',1795321824112);
COMMIT;
