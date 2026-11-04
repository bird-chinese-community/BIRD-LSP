import { startLspServer } from "../../dist/lsp-server.js";

startLspServer({
  asnDbPath: process.argv[2],
  disableAsnIntel: process.argv[3] === "disabled",
});
