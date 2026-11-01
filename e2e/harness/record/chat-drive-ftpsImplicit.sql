PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('b1580140-4ab2-41ca-9bfd-56db61ae5ec2','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','drive-chat','openai-compatible','deepseek/deepseek-v4.1-flash:floor',14484,1085,15569,0,0,0,5,'tool-calls','e3cc49d8-bf63-4dc9-aa9d-6b22ec58ee2d',1793534139670);
COMMIT;
