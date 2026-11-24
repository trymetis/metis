PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('c1fdb72e-06a6-4886-aab1-f6bfa8d1faeb','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','drive-chat','openai-compatible','metis/demo',25459,1935,27394,0,0,0,7,'stop','71b5a266-e3eb-4430-a4cd-0dfc2d34a0cf',1795410694846);
COMMIT;
