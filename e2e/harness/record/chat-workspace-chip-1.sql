PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('a57b1ac5-2f0a-4e2a-b821-f45da33a2a76','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','workspace-chat','openai-compatible','deepseek/deepseek-v4.1-flash:floor',20550,1896,22446,0,0,0,4,'stop','7bc9b90b-5d06-43bc-9cef-7fe976f61511',1795322026417);
COMMIT;
