# Explain-Back Development Guidelines

## Project Structure & Architecture
- **Backend (`/backend`)**: FastAPI engine for formative AI evaluation of learner explanations against source text.
- **Frontend (`/frontend`)**: React SPA with Vite, React Router, and a multi-step session wizard preventing source recall bias.
- **Database / Auth (`/supabase`)**: Supabase Row-Level Security (RLS) for owner-scoped session persistence.

## Key Invariants & Quality Rules
1. **Source Recall Shield**: Source material must never be visible during explanation recording (Step 2).
2. **Owner-Scoped Persistence**: All session attempts, cleared gaps, and saved stats are strictly bound to the authenticated learner.
3. **Formative Evaluation Integrity**: Evaluation output provides formative diagnostic feedback (not grades or harsh scores).
