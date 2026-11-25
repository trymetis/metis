PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('5bef8568-3278-4a2f-9e66-bad6e97bd0bd','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','drive-chat','openai-compatible','metis/demo',20892,1605,22497,0,0,0,5,'stop','9371fc47-e2ec-42db-84bc-001ec0c89fd4',1795579732869);
COMMIT;
