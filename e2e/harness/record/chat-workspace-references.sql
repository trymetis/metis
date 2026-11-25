PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('fbaf0c07-1cd1-4b6f-a716-bf9c6a134e90','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','workspace-chat','openai-compatible','metis/demo',19177,1130,20307,0,0,0,3,'stop','dda8c962-e4db-48f9-86ce-c296dd37cdc3',1795580521826);
COMMIT;
