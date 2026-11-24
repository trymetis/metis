PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('7f008397-2ff3-4508-bd5d-4f40cee83438','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','workspace-chat','openai-compatible','metis/demo',40253,2576,42829,0,0,0,4,'stop','f44b55ee-6686-4aea-bcea-dfefc2dc375f',1795410891391);
COMMIT;
