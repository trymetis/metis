PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('4a5b55ac-931b-4c13-b12b-bc8543f69531','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','workspace-chat','openai-compatible','metis/demo',12496,1070,13566,0,0,0,3,'stop','277c6072-25eb-432c-a302-84cf0283dcd0',1795580539431);
COMMIT;
