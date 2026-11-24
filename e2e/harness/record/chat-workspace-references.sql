PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('883fa0f4-1ffc-4bf1-8c37-273d87190d61','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','workspace-chat','openai-compatible','deepseek/deepseek-v4.1-flash:floor',19177,1130,20307,0,0,0,3,'stop','85c9b0d0-4ca6-4f66-9b0f-3df9114358da',1795322018000);
COMMIT;
