PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('57eb206b-af39-46b5-8780-f9c38a71a9a6','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','workspace-chat','openai-compatible','metis/demo',160641,6115,166756,0,0,0,9,'stop','0295dd53-99fb-4b16-9fe5-89e2775285bc',1795580615692);
COMMIT;
