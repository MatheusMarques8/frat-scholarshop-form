const form = document.querySelector("#spotlight-form");
const steps = [...document.querySelectorAll(".step")];
const typeCards = [...document.querySelectorAll(".type-card")];
const progressBar = document.querySelector("#progress-bar");
const organizationLabel = document.querySelector("#organization-label");
const photoInput = document.querySelector("#photo");
const photoPreview = document.querySelector("#photo-preview");
const success = document.querySelector("#success");
const savedPath = document.querySelector("#saved-path");
const captionOutput = document.querySelector("#caption-output");
const newSubmission = document.querySelector("#new-submission");
const submitButton = form.querySelector('[type="submit"]');
const field = name => form.elements.namedItem(name);

let currentStep = 1;
let selectedType = "internship";
let photo = null;

const copyByType = {
  internship: {
    label: "Company",
    placeholder: "Company",
    preview: "Internship Spotlight"
  },
  research: {
    label: "Lab / Research Group",
    placeholder: "Lab, professor, institute, or program",
    preview: "Research Spotlight"
  },
  job: {
    label: "Employer",
    placeholder: "Employer",
    preview: "Job Spotlight"
  }
};

typeCards.forEach(card => {
  card.addEventListener("click", () => {
    selectedType = card.dataset.type;
    typeCards.forEach(item => {
      item.classList.toggle("active", item === card);
      item.setAttribute("aria-pressed", String(item === card));
    });
    organizationLabel.textContent = copyByType[selectedType].label;
    field("organization").placeholder = copyByType[selectedType].placeholder;
    updatePreview();
  });
});

document.querySelectorAll("[data-next]").forEach(button => {
  button.addEventListener("click", () => {
    if (currentStep === 2 && !validateDetails()) return;
    setStep(currentStep + 1);
  });
});

document.querySelectorAll("[data-back]").forEach(button => {
  button.addEventListener("click", () => setStep(currentStep - 1));
});

["input", "change"].forEach(eventName => {
  form.addEventListener(eventName, updatePreview);
});

photoInput.addEventListener("change", async () => {
  const file = photoInput.files?.[0];
  photo = null;

  if (!file) {
    photoPreview.hidden = true;
    photoPreview.innerHTML = "";
    return;
  }

  if (!file.type.startsWith("image/")) {
    showError("Please choose an image file.");
    photoInput.value = "";
    return;
  }

  if (file.size > 7 * 1024 * 1024) {
    showError("Please keep the photo under 7 MB.");
    photoInput.value = "";
    return;
  }

  const dataUrl = await readFileAsDataUrl(file);
  photo = { name: file.name, type: file.type, dataUrl };
  photoPreview.hidden = false;
  photoPreview.innerHTML = `<img src="${dataUrl}" alt=""> ${escapeHtml(file.name)}`;
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!validateDetails()) {
    setStep(2);
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Saving...";

  try {
    const payload = {
      type: selectedType,
      name: field("name").value,
      email: field("email").value,
      linkedin: field("linkedin").value,
      organization: field("organization").value,
      location: field("location").value,
      position: field("position").value,
      startDate: field("startDate").value,
      lookingForward: field("lookingForward").value,
      shoutout: field("shoutout").value,
      allowSocial: field("allowSocial").checked,
      photo
    };

    const response = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (!response.ok) {
      showError(result.errors?.join(" ") || result.error || "Submission failed.");
      return;
    }

    document.querySelector(".form-panel").hidden = true;
    success.hidden = false;
    savedPath.textContent = `Saved locally as ${result.savedAs}.`;
    captionOutput.textContent = result.caption;
    success.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    showError("Could not reach the local server. Make sure the app is still running.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit spotlight";
  }
});

newSubmission.addEventListener("click", () => {
  form.reset();
  photo = null;
  photoPreview.hidden = true;
  photoPreview.innerHTML = "";
  document.querySelector(".form-panel").hidden = false;
  success.hidden = true;
  selectedType = "internship";
  typeCards[0].click();
  setStep(1);
});

function setStep(step) {
  currentStep = Math.min(3, Math.max(1, step));
  steps.forEach(item => item.classList.toggle("active", Number(item.dataset.step) === currentStep));
  progressBar.style.width = `${(currentStep / 3) * 100}%`;
}

function validateDetails() {
  const fields = [
    field("name"),
    field("email"),
    field("organization"),
    field("location"),
    field("position"),
    field("lookingForward")
  ];
  for (const field of fields) {
    if (!field.checkValidity()) {
      field.reportValidity();
      return false;
    }
  }

  if (field("linkedin").value && !field("linkedin").value.includes("linkedin.com/")) {
    field("linkedin").setCustomValidity("Use a full LinkedIn URL.");
    field("linkedin").reportValidity();
    field("linkedin").setCustomValidity("");
    return false;
  }

  return true;
}

function updatePreview() {
  const name = field("name").value.trim() || "Your Name";
  const position = field("position").value.trim() || "Position";
  const organization = field("organization").value.trim() || "Organization";
  const location = field("location").value.trim() || "Location";

  document.querySelector("#preview-type").textContent = copyByType[selectedType].preview;
  document.querySelector("#preview-name").textContent = name;
  document.querySelector("#preview-role").textContent = `${position} at ${organization}`;
  document.querySelector("#preview-location").textContent = location;
}

function showError(message) {
  document.querySelector(".error")?.remove();
  const error = document.createElement("p");
  error.className = "error";
  error.textContent = message;
  form.append(error);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

setStep(1);
updatePreview();
