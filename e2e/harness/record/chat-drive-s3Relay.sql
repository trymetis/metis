PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('7a982ab3-921f-49a5-a465-0f16e559a0c3','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','drive-chat','openai-compatible','deepseek/deepseek-v4.1-flash:floor',18042,1316,19358,0,0,0,5,'stop','46e16fc4-78f7-4ee2-8de8-839f6011e266',1795321809085);
COMMIT;
