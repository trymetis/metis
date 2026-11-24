PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('93953f85-752e-41dc-9473-b9cae7e0a280','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','workspace-chat','openai-compatible','deepseek/deepseek-v4.1-flash:floor',17862,371,18233,0,0,0,4,'stop','a860b308-5575-4c38-91ac-5171ff293a95',1795322069315);
COMMIT;
