import { startLspServer } from "../../dist/lsp-server.js";

startLspServer({ dn42CacheDir: process.argv[2], dn42BaseUrl: process.argv[3] });
