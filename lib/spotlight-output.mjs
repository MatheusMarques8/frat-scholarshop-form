export const typeLabels = {
  internship: "Internship",
  research: "Research",
  job: "Job"
};

export function normalizeLinkedin(value) {
  const raw = text(value);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    url.search = "";
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();

    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    return url.toString();
  } catch {
    return raw.split(/[?#]/)[0].trim().replace(/\/+$/, "");
  }
}

export function makeCaption(record) {
  const label = typeLabels[record.type];
  const intro = record.type === "research"
    ? `${record.name} is joining ${record.organization} as a ${record.position} in ${record.location}.`
    : `${record.name} is headed to ${record.organization} as a ${record.position} in ${record.location}.`;
  const dateLine = record.startDate ? ` Starting ${record.startDate}.` : "";
  const linkedinLine = record.linkedin ? `\n\nLinkedIn: ${record.linkedin}` : "";
  const shoutoutLine = record.shoutout ? `\n\nShoutout: ${record.shoutout}` : "";

  return `Brother Spotlight: ${label}\n\n${intro}${dateLine}\n\nLooking forward to: ${record.lookingForward}${shoutoutLine}${linkedinLine}\n\n#Scholarship #Brotherhood #CareerSpotlight`;
}

export function makeShortPost(record) {
  return `${record.name} submitted a ${typeLabels[record.type].toLowerCase()} spotlight for ${record.organization}. Saved in submissions/${record.folderName}.`;
}

export function makePostCard(record) {
  const safeName = escapeHtml(record.name);
  const safeOrg = escapeHtml(record.organization);
  const safePosition = escapeHtml(record.position);
  const safeLookingForward = escapeHtml(record.lookingForward);
  const safeLinkedin = escapeHtml(record.linkedin || "");
  const safeLinkedinHref = escapeHtml(record.linkedin || "");
  const safeShoutout = escapeHtml(record.shoutout || "");
  const safeStartDate = escapeHtml(record.startDate || "");
  const photoMarkup = record.photoFile
    ? `<img src="./${encodeURIComponent(record.photoFile)}" alt="${safeName} photo">`
    : `<div class="placeholder">${initials(record.name)}</div>`;
  const startDateMarkup = safeStartDate ? `<p class="meta">Starting ${safeStartDate}</p>` : "";
  const shoutoutMarkup = safeShoutout ? `<p class="shoutout">Shoutout: ${safeShoutout}</p>` : "";
  const linkedinMarkup = safeLinkedin
    ? `<a class="linkedin-card" href="${safeLinkedinHref}" target="_blank" rel="noopener"><span>LinkedIn:</span> ${safeLinkedin}</a>`
    : "";

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
    .copy { min-height: 0; padding: 28px 32px 26px; display: grid; grid-template-rows: auto auto auto auto minmax(0, 1fr) auto; align-content: start; gap: 8px; }
    .kicker { color: #fde68a; text-transform: uppercase; font-size: 15px; letter-spacing: 0; font-weight: 800; }
    h1 { margin: 0; font-size: clamp(34px, 7vw, 48px); line-height: .96; }
    h2 { margin: 0; font-size: clamp(19px, 4vw, 25px); color: #dbeafe; font-weight: 700; line-height: 1.12; }
    p { margin: 0; color: #e5e7eb; line-height: 1.32; font-size: 16px; }
    .meta { color: #fde68a; font-weight: 700; }
    .looking { min-height: 0; margin-top: 4px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; }
    .shoutout { color: #fef3c7; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .linkedin-card { align-self: end; display: block; padding: 10px 12px; background: linear-gradient(135deg, rgba(253, 230, 138, .92), rgba(191, 219, 254, .88)); color: #14213d; font-size: 16px; font-weight: 850; line-height: 1.22; text-decoration: none; overflow-wrap: anywhere; word-break: break-word; border: 1px solid rgba(255, 255, 255, .34); border-radius: 6px; box-shadow: 0 10px 22px rgba(15, 23, 42, .22); }
    .linkedin-card span { color: #7c2d12; font-weight: 950; }
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

export function csvEscape(value) {
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`;
  return stringValue;
}

function text(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 1200);
}

function initials(name) {
  return text(name).split(" ").slice(0, 2).map(part => part[0]?.toUpperCase() || "").join("") || "SP";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
