PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('fcdd786b-1553-47de-9244-90649fe3885b','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','drive-chat','openai-compatible','metis/demo',16643,2178,18821,0,0,0,4,'stop','898aa48b-e34b-4d6b-9f77-737abd196eb5',1795579757386);
COMMIT;
