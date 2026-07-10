// Node-only server boot: starts the background Meta lead sync loop once per
// server process (Railway runs one long-lived instance).
import { startLeadSyncLoop } from "./lib/lead-sync";

startLeadSyncLoop();
