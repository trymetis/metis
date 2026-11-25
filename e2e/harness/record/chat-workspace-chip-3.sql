PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('ab2bea6c-beeb-4c16-a8c2-aad295ca6c50','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','workspace-chat','openai-compatible','metis/demo',58137,2306,60443,0,0,0,5,'stop','cd4dc491-5388-419b-bcf2-398d34734b94',1795580648571);
COMMIT;
