PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('b72afd7c-93ff-4ebc-b5cc-c695d06658bf','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','drive-chat','openai-compatible','metis/demo',14233,1509,15742,0,0,0,4,'stop','a8739a13-df2b-4812-bb38-66c76c38ed14',1795579735449);
COMMIT;
