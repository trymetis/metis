PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('c95bf90f-d6e9-4384-9840-1fe0ef33dae2','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','drive-chat','openai-compatible','deepseek/deepseek-v4.1-flash:floor',25459,1935,27394,0,0,0,7,'stop','f6a1d860-292f-4402-b8a3-29fdb874ea07',1795321825690);
COMMIT;
