import { readFileSync, readdirSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";

const schema = JSON.parse(readFileSync("registry/schema/registry-item.schema.json", "utf8"));
const ajv = new Ajv2020();
const validate = ajv.compile(schema);
let bad = 0;
for (const name of readdirSync("registry/blocks")) {
  const item = JSON.parse(readFileSync(`registry/blocks/${name}/registry-item.json`, "utf8"));
  if (!validate(item)) {
    bad++;
    process.stderr.write(`INVALID ${name} ${ajv.errorsText(validate.errors)}\n`);
  }
  const html = readFileSync(`registry/blocks/${name}/${name}.html`, "utf8");
  const demo = readFileSync(`registry/blocks/${name}/demo.html`, "utf8");
  for (const b of item.bindings) {
    if (!html.includes(b)) {
      bad++;
      process.stderr.write(`BINDING MISSING in markup: ${name} ${b}\n`);
    }
  }
  if (!demo.includes("doctype")) {
    bad++;
    process.stderr.write(`NO DEMO: ${name}\n`);
  }
}
process.stdout.write(
  bad === 0 ? "ALL ITEMS VALID (schema, bindings match markup, demos present)" : `${bad} problems`,
);
