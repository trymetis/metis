PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('b0e8b484-d9ff-41a0-8c0c-08dcc53bb235','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','drive-chat','openai-compatible','metis/demo',23396,2457,25853,0,0,0,6,'stop','2b5894e8-0932-4cea-a8bc-325ba70a6cc9',1795410702589);
COMMIT;
