-- One ChatSession per Rule: drop the old sort index, add a unique constraint.
-- Postgres allows multiple NULL ruleId rows under a UNIQUE constraint, so
-- ruleless onboarding sessions are unaffected.
DROP INDEX "chat_sessions_ruleId_updatedAt_idx";

CREATE UNIQUE INDEX "chat_sessions_ruleId_key" ON "chat_sessions"("ruleId");
