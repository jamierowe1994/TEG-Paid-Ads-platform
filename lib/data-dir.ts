import "server-only";
import path from "path";

// Where server-side JSON stores live (users, feedback, events).
//
// Railway's default filesystem is EPHEMERAL — it's wiped on every deploy,
// which wipes accounts with it. Fix: attach a Railway Volume to the service
// (mounted at e.g. /data) and set the env var DATA_DIR=/data. Files on the
// volume survive deploys. Locally this falls back to ./data.
//
// This whole layer gets replaced by Postgres/Clerk later.
export const DATA_DIR =
  process.env.DATA_DIR ?? path.join(process.cwd(), "data");
