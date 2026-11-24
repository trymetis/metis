PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('2f282c3a-9a18-4b04-839c-14368d7f5510','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','drive-chat','openai-compatible','deepseek/deepseek-v4.1-flash:floor',16643,2178,18821,0,0,0,4,'stop','39eb5d16-866e-4fec-8ba8-712c3da8223c',1795321838261);
COMMIT;
