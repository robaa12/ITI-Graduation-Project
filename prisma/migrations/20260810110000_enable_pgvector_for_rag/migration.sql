-- The workflow service owns its vector tables through Mastra's PgVector
-- adapter, while this migration owns the database extension and schema
-- boundary. PostgreSQL roles used in production need CREATE on this schema.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS rag;
