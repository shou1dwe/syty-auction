CREATE TABLE IF NOT EXISTS users (
	user_id TEXT NOT NULL PRIMARY KEY,
	first_name TEXT NOT NULL,
	last_name TEXT NOT NULL,
	company TEXT,
	table_number INTEGER NOT NULL
)