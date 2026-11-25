PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('2e5af461-3743-4625-9cdd-5d2493ca01c5','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','drive-chat','openai-compatible','metis/demo',25459,1935,27394,0,0,0,7,'stop','d85578ad-d31f-4964-8df5-29753b3758bc',1795579752068);
COMMIT;
