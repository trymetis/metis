PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('1a93e58f-6155-4c0a-8296-d1f2ed0a30df','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','workspace-chat','openai-compatible','metis/demo',20550,1896,22446,0,0,0,4,'stop','487e9c09-4eed-48ae-a4db-78713ce5c5c2',1795410857122);
COMMIT;
