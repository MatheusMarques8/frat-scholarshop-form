import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  csvEscape,
  makeCaption,
  makePostCard,
  makeShortPost,
  normalizeLinkedin,
  typeLabels
} from "./lib/spotlight-output.mjs";

const PORT = Number(process.env.PORT || 4173);
const ROOT = resolve(".");
const PUBLIC_DIR = join(ROOT, "public");
const SUBMISSIONS_DIR = join(ROOT, "submissions");
const MAX_BODY_BYTES = 12 * 1024 * 1024;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const requiredFields = [
  "type",
  "name",
  "email",
  "organization",
  "location",
  "position",
  "lookingForward",
  "photo"
];

await mkdir(SUBMISSIONS_DIR, { recursive: true });

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/api/submit") {
      await handleSubmit(req, res);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(url.pathname, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Something went wrong. Please try again." });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\nScholarship spotlight form is running.`);
  console.log(`Local:   http://localhost:${PORT}`);
  console.log(`\nSubmissions folder: ${SUBMISSIONS_DIR}\n`);
  if (!process.env.PUBLIC_TUNNEL) {
    console.log(`For the public GroupMe link, run: npm run public\n`);
  }
});

async function serveStatic(pathname, res) {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(PUBLIC_DIR, `.${decodeURIComponent(normalized)}`);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      sendText(res, 404, "Not found");
      return;
    }

    const content = await readFile(filePath);
    const mimeType = mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mimeType, "Cache-Control": "no-store" });
    res.end(content);
  } catch {
    sendText(res, 404, "Not found");
  }
}

async function handleSubmit(req, res) {
  const payload = await readJsonBody(req);
  const cleaned = cleanSubmission(payload);
  const errors = validateSubmission(cleaned, payload.photo);

  if (errors.length > 0) {
    sendJson(res, 400, { errors });
    return;
  }

  const now = new Date();
  const id = `${formatStamp(now)}-${slugify(cleaned.name)}-${randomUUID().slice(0, 6)}`;
  const folderName = await uniquePersonFolderName(cleaned.name);
  const folder = join(SUBMISSIONS_DIR, folderName);
  await mkdir(folder, { recursive: true });

  const photoFile = await savePhoto(payload.photo, folder, id);

  const record = {
    id,
    folderName,
    submittedAt: now.toISOString(),
    ...cleaned,
    photoFile: photoFile || null
  };
  const caption = makeCaption(record);
  const shortPost = makeShortPost(record);

  await writeFile(join(folder, "submission.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await writeFile(join(folder, "social-caption.txt"), `${caption}\n`, "utf8");
  await writeFile(join(folder, "groupme-reply.txt"), `${shortPost}\n`, "utf8");
  await writeFile(join(folder, "post-card.html"), makePostCard(record), "utf8");
  await appendCsv(record);
  await appendFile(join(SUBMISSIONS_DIR, "latest-social-posts.md"), `\n## ${record.name}\n\n${caption}\n`, "utf8");

  sendJson(res, 200, {
    ok: true,
    id,
    savedAs: `submissions/${folderName}`,
    caption,
    shortPost
  });
}

function readJsonBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let total = 0;
    const chunks = [];

    req.on("data", chunk => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        rejectBody(new Error("Upload is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        rejectBody(new Error("Invalid JSON."));
      }
    });

    req.on("error", rejectBody);
  });
}

function cleanSubmission(payload = {}) {
  return {
    type: text(payload.type).toLowerCase(),
    name: text(payload.name),
    email: text(payload.email).toLowerCase(),
    linkedin: normalizeLinkedin(payload.linkedin),
    organization: text(payload.organization),
    location: text(payload.location),
    position: text(payload.position),
    startDate: text(payload.startDate),
    lookingForward: text(payload.lookingForward),
    shoutout: text(payload.shoutout),
    allowSocial: Boolean(payload.allowSocial)
  };
}

function validateSubmission(data, photo) {
  const errors = [];

  for (const field of requiredFields) {
    if (field === "photo") continue;
    if (!data[field]) errors.push(`${field} is required.`);
  }

  if (!Object.hasOwn(typeLabels, data.type)) errors.push("Choose internship, research, or job.");
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push("Enter a valid email.");
  if (data.linkedin && !/^https?:\/\/(www\.)?linkedin\.com\/.+/i.test(data.linkedin)) {
    errors.push("LinkedIn should be a full linkedin.com URL.");
  }
  if (!isValidPhoto(photo)) errors.push("Photo is required.");

  return errors;
}

async function savePhoto(photo, folder, id) {
  const match = String(photo.dataUrl).match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return "";

  const extension = match[1].includes("png")
    ? "png"
    : match[1].includes("webp")
      ? "webp"
      : "jpg";
  const photoFile = `photo-${id}.${extension}`;
  await writeFile(join(folder, photoFile), Buffer.from(match[2], "base64"));
  return photoFile;
}

function isValidPhoto(photo) {
  return /^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(String(photo?.dataUrl || ""));
}

async function appendCsv(record) {
  const csvFile = join(SUBMISSIONS_DIR, "all-submissions.csv");
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
  const row = headers.map(header => csvEscape(record[header] ?? "")).join(",");
  const needsHeader = !existsSync(csvFile);
  await appendFile(csvFile, `${needsHeader ? `${headers.join(",")}\n` : ""}${row}\n`, "utf8");
}

function formatStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
}

function text(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 1200);
}

function slugify(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "submission";
}

async function uniquePersonFolderName(name) {
  const base = text(name)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70) || "Unnamed Submission";

  let folderName = base;
  let counter = 2;

  while (existsSync(join(SUBMISSIONS_DIR, folderName))) {
    folderName = `${base} ${counter}`;
    counter += 1;
  }

  return folderName;
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendText(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}
