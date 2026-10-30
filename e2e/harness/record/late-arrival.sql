PRAGMA foreign_keys=OFF;
BEGIN;
INSERT INTO "ai_usage" ("id","user_id","workspace_id","feature","provider","model","input_tokens","output_tokens","total_tokens","cache_read_tokens","cache_write_tokens","reasoning_tokens","steps","finish_reason","run_id","created_at") VALUES ('1b1b8369-35b6-4d29-ae6d-8623963d7349','f0c4be98-b2fd-59d7-b11e-c921e7d22615','39e2a274-68d1-5615-b91e-ed3087e0400f','workflow-decision','decision:systemone','jev-1.14.0',356,21,377,0,0,0,1,NULL,'6e2d93f1-583d-40a9-95b3-92801071732c',1793273091874);
COMMIT;
