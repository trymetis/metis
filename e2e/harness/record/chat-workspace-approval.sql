PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('31053fe5-b35f-4a8f-aa60-119481f6186d','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','workspace-chat','openai-compatible','metis/demo',17862,371,18233,0,0,0,4,'stop','1fb1e782-fb77-4846-abaf-887ade421fdb',1795580657760);
COMMIT;
