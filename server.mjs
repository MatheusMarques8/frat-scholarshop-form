import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

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

const typeLabels = {
  internship: "Internship",
  research: "Research",
  job: "Job"
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
    linkedin: text(payload.linkedin),
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

function makeCaption(record) {
  const label = typeLabels[record.type];
  const intro = record.type === "research"
    ? `${record.name} is joining ${record.organization} as a ${record.position} in ${record.location}.`
    : `${record.name} is headed to ${record.organization} as a ${record.position} in ${record.location}.`;
  const dateLine = record.startDate ? ` Starting ${record.startDate}.` : "";
  const linkedinLine = record.linkedin ? `\n\nLinkedIn: ${record.linkedin}` : "";
  const shoutoutLine = record.shoutout ? `\n\nShoutout: ${record.shoutout}` : "";

  return `Brother Spotlight: ${label}\n\n${intro}${dateLine}\n\nLooking forward to: ${record.lookingForward}${shoutoutLine}${linkedinLine}\n\n#Scholarship #Brotherhood #CareerSpotlight`;
}

function makeShortPost(record) {
  return `${record.name} submitted a ${typeLabels[record.type].toLowerCase()} spotlight for ${record.organization}. Saved in submissions/${record.folderName}.`;
}

function makePostCard(record) {
  const safeName = escapeHtml(record.name);
  const safeOrg = escapeHtml(record.organization);
  const safePosition = escapeHtml(record.position);
  const safeLookingForward = escapeHtml(record.lookingForward);
  const safeLinkedin = escapeHtml(record.linkedin || "");
  const safeShoutout = escapeHtml(record.shoutout || "");
  const safeStartDate = escapeHtml(record.startDate || "");
  const photoMarkup = record.photoFile
    ? `<img src="./${encodeURIComponent(record.photoFile)}" alt="${safeName} photo">`
    : `<div class="placeholder">${initials(record.name)}</div>`;
  const startDateMarkup = safeStartDate ? `<p class="meta">Starting ${safeStartDate}</p>` : "";
  const shoutoutMarkup = safeShoutout ? `<p class="shoutout">Shoutout: ${safeShoutout}</p>` : "";
  const linkedinMarkup = safeLinkedin ? `<p class="linkedin">LinkedIn: ${safeLinkedin}</p>` : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeName} Spotlight</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111827; font-family: Arial, sans-serif; color: #f8fafc; }
    .post { width: min(92vw, 720px); aspect-ratio: 4 / 5; background: linear-gradient(145deg, #0f172a 0%, #172554 45%, #7c2d12 100%); display: grid; grid-template-rows: 56% 44%; overflow: hidden; border-radius: 22px; box-shadow: 0 26px 70px rgba(0,0,0,.38); }
    img, .placeholder { width: 100%; height: 100%; object-fit: cover; }
    .placeholder { display: grid; place-items: center; font-size: 120px; font-weight: 900; background: #f59e0b; color: #111827; }
    .copy { min-height: 0; padding: 28px 32px 26px; display: grid; grid-template-rows: auto auto auto minmax(0, 1fr) auto auto; gap: 8px; }
    .kicker { color: #fde68a; text-transform: uppercase; font-size: 15px; letter-spacing: 0; font-weight: 800; }
    h1 { margin: 0; font-size: clamp(34px, 7vw, 48px); line-height: .96; }
    h2 { margin: 0; font-size: clamp(19px, 4vw, 25px); color: #dbeafe; font-weight: 700; line-height: 1.12; }
    p { margin: 0; color: #e5e7eb; line-height: 1.32; font-size: 16px; }
    .meta { color: #fde68a; font-weight: 700; }
    .looking { min-height: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; }
    .shoutout { color: #fef3c7; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .linkedin { align-self: end; color: #bfdbfe; font-size: 13px; line-height: 1.22; overflow-wrap: anywhere; word-break: break-word; }
  </style>
</head>
<body>
  <article class="post">
    ${photoMarkup}
    <section class="copy">
      <div class="kicker">${escapeHtml(typeLabels[record.type])} Spotlight</div>
      <h1>${safeName}</h1>
      <h2>${safePosition} at ${safeOrg}</h2>
      ${startDateMarkup}
      <p class="looking">Looking forward to: ${safeLookingForward}</p>
      ${shoutoutMarkup}
      ${linkedinMarkup}
    </section>
  </article>
</body>
</html>
`;
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

function initials(name) {
  return text(name).split(" ").slice(0, 2).map(part => part[0]?.toUpperCase() || "").join("") || "SP";
}

function csvEscape(value) {
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`;
  return stringValue;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendText(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}
