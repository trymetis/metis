PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('e8b6aae7-b793-4ba6-8642-c0844e870242','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','drive-chat','openai-compatible','deepseek/deepseek-v4.1-flash:floor',14233,1509,15742,0,0,0,4,'stop','5660ff35-92a0-4b26-b3f7-85d496839659',1795321816460);
COMMIT;
