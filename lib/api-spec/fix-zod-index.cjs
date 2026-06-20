const fs = require("fs");
const path = require("path");
const file = path.resolve(__dirname, "../../lib/api-zod/src/index.ts");
let content = fs.readFileSync(file, "utf8");
content = content.replace(/export \* from ['"]\.\/generated\/types['"];?\n?/g, "");
fs.writeFileSync(file, content);
console.log("Fixed api-zod/src/index.ts — removed stale types re-export");
