PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('f8e16f6b-a506-44cc-9f73-161b8fbf4e88','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','workspace-chat','openai-compatible','deepseek/deepseek-v4.1-flash:floor',40253,2576,42829,0,0,0,4,'stop','05b82f2d-e9a3-481d-b82d-6b529e860e5b',1795322060936);
COMMIT;
