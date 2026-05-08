import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  csvEscape,
  makeCaption,
  makePostCard,
  makeShortPost,
  normalizeLinkedin
} from "../lib/spotlight-output.mjs";

const ROOT = resolve(".");
const SUBMISSIONS_DIR = join(ROOT, "submissions");
const headers = [
  "submittedAt",
  "type",
  "name",
  "email",
  "linkedin",
  "organization",
  "location",
  "position",
  "startDate",
  "lookingForward",
  "shoutout",
  "allowSocial",
  "photoFile",
  "folderName",
  "id"
];

const records = [];
const entries = await readdir(SUBMISSIONS_DIR, { withFileTypes: true });

for (const entry of entries) {
  if (!entry.isDirectory()) continue;

  const folder = join(SUBMISSIONS_DIR, entry.name);
  const jsonFile = join(folder, "submission.json");

  try {
    const record = JSON.parse(await readFile(jsonFile, "utf8"));
    record.folderName ||= entry.name;
    record.linkedin = normalizeLinkedin(record.linkedin);

    const caption = makeCaption(record);
    const shortPost = makeShortPost(record);

    await writeFile(jsonFile, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await writeFile(join(folder, "social-caption.txt"), `${caption}\n`, "utf8");
    await writeFile(join(folder, "groupme-reply.txt"), `${shortPost}\n`, "utf8");
    await writeFile(join(folder, "post-card.html"), makePostCard(record), "utf8");
    records.push(record);
  } catch (error) {
    console.warn(`Skipped ${entry.name}: ${error.message}`);
  }
}

records.sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)));

const csvRows = records.map(record => headers.map(header => csvEscape(record[header] ?? "")).join(","));
await writeFile(join(SUBMISSIONS_DIR, "all-submissions.csv"), `${headers.join(",")}\n${csvRows.join("\n")}${csvRows.length ? "\n" : ""}`, "utf8");

const posts = records.map(record => `## ${record.name}\n\n${makeCaption(record)}`).join("\n\n");
await writeFile(join(SUBMISSIONS_DIR, "latest-social-posts.md"), `${posts}${posts ? "\n" : ""}`, "utf8");

console.log(`Cleaned ${records.length} submission${records.length === 1 ? "" : "s"}.`);
