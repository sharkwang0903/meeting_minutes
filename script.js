"use strict";

// 固定成員集中設定；介面、紀錄人選單及 PDF 皆使用此順序。
const MEMBERS = Object.freeze(["Frank", "Jethro", "Shark", "Roger", "Henry", "Albert", "Jennifer", "Annie"]);
const DRAFT_KEY = "2050x012S.morning-meeting.current-draft.v1";
const $ = (selector) => document.querySelector(selector);
const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
let draftDay = localDate();
let revision = 0;
let cached = null;
let busy = false;
let highlightNumber = 0;
const form = $("#meeting-form");
const dialog = $("#preview-dialog");

function addHighlight(value = {}) {
  const number = ++highlightNumber;
  const row = document.createElement("div");
  row.className = "highlight-row";
  row.innerHTML = `<label for="highlight-topic-${number}">主題<input id="highlight-topic-${number}" class="highlight-topic" type="text"></label><label for="highlight-detail-${number}">內容說明<textarea id="highlight-detail-${number}" class="highlight-detail" rows="2"></textarea></label><button class="remove-highlight" type="button" aria-label="刪除第 ${number} 組重點事項">刪除</button>`;
  row.querySelector("input").value = typeof value.topic === "string" ? value.topic : "";
  row.querySelector("textarea").value = typeof value.detail === "string" ? value.detail : "";
  row.querySelector("button").addEventListener("click", () => {
    if (ensureToday()) return;
    const next = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    changed();
    (next?.querySelector("input") || $("#add-highlight")).focus();
  });
  $("#highlights").append(row);
  return row;
}

MEMBERS.forEach((name, index) => {
  $("#recorder").add(new Option(name, name));
  const row = document.createElement("div");
  row.className = "member-row";
  row.innerHTML = `<label for="work-${index}">${name}</label><textarea id="work-${index}" rows="2" aria-label="${name} 的昨日工作內容"></textarea><label class="absent"><input id="absent-${index}" type="checkbox" aria-label="${name} 未出席">未出席</label>`;
  $("#members").append(row);
});

function readForm() {
  return {
    date: $("#meeting-date").value,
    recorder: $("#recorder").value,
    topic: $("#meeting-topic").value,
    members: MEMBERS.map((name, i) => ({ name, work: $(`#work-${i}`).value, absent: $(`#absent-${i}`).checked })),
    highlights: [...document.querySelectorAll(".highlight-row")].map(row => ({ topic: row.querySelector("input").value, detail: row.querySelector("textarea").value }))
  };
}

function populate(data = {}) {
  $("#meeting-date").value = /^\d{4}-\d{2}-\d{2}$/.test(data.date || "") ? data.date : draftDay;
  if (!$("#meeting-date").value) $("#meeting-date").value = draftDay;
  $("#recorder").value = MEMBERS.includes(data.recorder) ? data.recorder : "";
  $("#meeting-topic").value = typeof data.topic === "string" ? data.topic : "昨日工作內容、重點事項";
  MEMBERS.forEach((name, i) => {
    const member = Array.isArray(data.members) ? data.members.find(item => item?.name === name) : null;
    $(`#work-${i}`).value = typeof member?.work === "string" ? member.work : "";
    $(`#absent-${i}`).checked = member?.absent === true;
    $(`#work-${i}`).disabled = member?.absent === true;
  });
  $("#highlights").replaceChildren();
  const highlights = Array.isArray(data.highlights) && data.highlights.length ? data.highlights : [{}];
  highlights.forEach(item => addHighlight(item || {}));
}

function invalidate() {
  revision++;
  if (dialog.open) dialog.close();
  $("#pdf-frame").removeAttribute("src");
  $("#pdf-image").removeAttribute("src");
  if (cached) URL.revokeObjectURL(cached.url);
  cached = null;
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: 1, draftDay, data: readForm() }));
    $("#draft-status").textContent = "當日草稿已自動儲存在此瀏覽器";
  } catch {
    $("#draft-status").textContent = "此瀏覽器無法儲存草稿；關閉頁面後內容將不保留。";
  }
}

// 草稿歸屬實際本地日期，與可手動修改的會議日期分開處理。
function ensureToday() {
  const today = localDate();
  if (today === draftDay) return false;
  draftDay = today;
  invalidate();
  populate();
  saveDraft();
  notify("日期已跨日，已開始今天的新空白草稿，請重新填寫。", true);
  return true;
}

function changed() {
  if (ensureToday()) return;
  MEMBERS.forEach((name, i) => { $(`#work-${i}`).disabled = $(`#absent-${i}`).checked; });
  invalidate();
  saveDraft();
  notify("");
}

function notify(message, error = false) {
  $("#message").textContent = message;
  $("#message").classList.toggle("error", error);
}

try {
  const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
  populate(saved?.version === 1 && saved.draftDay === draftDay ? saved.data : undefined);
} catch { populate(); }
saveDraft();
form.addEventListener("submit", event => event.preventDefault());
form.addEventListener("input", changed);
form.addEventListener("change", changed);
$("#add-highlight").addEventListener("click", () => {
  if (ensureToday()) return;
  const row = addHighlight();
  changed();
  row.querySelector("input").focus();
});
window.addEventListener("focus", ensureToday);
document.addEventListener("visibilitychange", () => { if (!document.hidden) ensureToday(); });
setInterval(ensureToday, 30000);

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function table(headers, rows, firstWidth) {
  const node = element("table");
  const cols = element("colgroup");
  const first = element("col");
  first.style.width = firstWidth;
  cols.append(first, element("col"));
  const head = element("thead");
  const header = element("tr");
  headers.forEach(text => header.append(element("th", text)));
  head.append(header);
  const body = element("tbody");
  rows.forEach(values => {
    const row = element("tr");
    values.forEach(text => row.append(element("td", text)));
    body.append(row);
  });
  node.append(cols, head, body);
  return node;
}

function buildPage(data) {
  const [year, month, day] = data.date.split("-");
  const page = element("article", undefined, "pdf-page");
  const content = element("div", undefined, "pdf-content");
  content.append(element("h1", `${year}/${month}/${day} 會議紀錄`));
  const summary = element("div", undefined, "pdf-summary");
  summary.append(element("div", "昨日工作進度彙整"), element("div", `紀錄人：${data.recorder}`));
  content.append(summary, table(["項目", "內容"], [["會議日期", `${year} 年 ${month} 月 ${day} 日`], ["紀錄主題", data.topic]], "23%"));
  content.append(element("h2", "昨日工作內容"), table(["成員", "工作內容"], data.members.map(member => [member.name, member.absent ? "未出席" : member.work]), "20%"));
  content.append(element("h2", "重點事項"));
  const highlights = data.highlights.filter(item => item.topic.trim() || item.detail.trim());
  content.append(highlights.length ? table(["主題", "內容說明"], highlights.map(item => [item.topic, item.detail]), "28%") : element("p", "無"));
  page.append(content, element("div", "2050x012S｜內部工作彙報", "pdf-footer"));
  return page;
}

// 主要 CDN 無法載入時，按下匯出會自動嘗試備援來源。
function loadFallbackScript(url, isReady) {
  if (isReady()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const finish = (error) => {
      clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      script.remove();
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(() => finish(new Error("載入逾時")), 15000);
    script.onload = () => finish(isReady() ? null : new Error("函式庫未正確載入"));
    script.onerror = () => finish(new Error("無法連線至函式庫來源"));
    script.src = url;
    document.head.append(script);
  });
}

async function ensurePdfLibraries() {
  const libraries = [
    { name: "html2canvas", ready: () => typeof window.html2canvas === "function", url: "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js" },
    { name: "jsPDF", ready: () => typeof window.jspdf?.jsPDF === "function", url: "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js" }
  ];
  const results = await Promise.allSettled(libraries.map(library => loadFallbackScript(library.url, library.ready)));
  const missing = libraries.filter((library, index) => results[index].status === "rejected" && !library.ready());
  if (missing.length) {
    throw new Error(`無法載入 PDF 所需的 ${missing.map(library => library.name).join("、")}，已嘗試主要及備援來源。請確認網路可連線至 cdnjs.cloudflare.com 或 cdn.jsdelivr.net，然後再次按下預覽或下載；已填寫內容會保留。`);
  }
}

async function generatePdf() {
  if (cached) return cached;
  const version = revision;
  const data = readForm();
  await document.fonts.ready;
  const page = buildPage(data);
  const host = $("#render-host");
  host.replaceChildren(page);
  try {
    const content = page.querySelector(".pdf-content");
    const fits = () => {
      const pageRect = page.getBoundingClientRect();
      const limit = pageRect.bottom - parseFloat(getComputedStyle(page).paddingBottom);
      return content.getBoundingClientRect().bottom <= limit && content.scrollWidth <= content.clientWidth + 1;
    };
    if (!fits()) page.classList.add("compact");
    if (!fits()) throw new Error("內容已超過 A4 單頁可容納範圍。請精簡工作內容、重點事項或過多空白行，再重新產生 PDF。為保留完整文字，本次不會匯出。");
    const canvas = await window.html2canvas(page, { scale: 2, backgroundColor: "#ffffff", logging: false, scrollX: 0, scrollY: 0, windowWidth: 1200 });
    if (version !== revision || ensureToday()) throw new Error("內容已變更，請再次按下預覽或下載，以產生最新版本。");
    if (!canvas.width || !canvas.height) throw new Error("無法繪製 PDF 頁面，請重新嘗試。");
    const image = canvas.toDataURL("image/png");
    const pdf = new window.jspdf.jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    pdf.addImage(image, "PNG", 0, 0, 210, 297);
    pdf.setProperties({ title: `${data.date}_會議記錄`, author: data.recorder });
    const blob = pdf.output("blob");
    cached = { blob, url: URL.createObjectURL(blob), image, filename: `${data.date}_會議記錄.pdf` };
    return cached;
  } finally { host.replaceChildren(); }
}

async function exportPdf(preview) {
  if (busy || ensureToday()) return;
  if (!form.reportValidity()) return;
  busy = true;
  const buttons = [$("#preview-pdf"), $("#download-pdf")];
  buttons.forEach(button => { button.disabled = true; });
  form.setAttribute("aria-busy", "true");
  notify("正在產生 PDF，請稍候…");
  try {
    await ensurePdfLibraries();
    const result = await generatePdf();
    if (preview) {
      $("#pdf-frame").src = result.url;
      $("#pdf-image").src = result.image;
      $("#pdf-frame").hidden = false;
      $("#image-preview").hidden = true;
      $("#toggle-preview").textContent = "查看整頁影像";
      dialog.showModal();
      notify("PDF 預覽已更新，共 1 頁。");
    } else {
      const link = element("a");
      link.href = result.url;
      link.download = result.filename;
      document.body.append(link);
      link.click();
      link.remove();
      notify(`已送出下載：${result.filename}（共 1 頁）`);
    }
  } catch (error) {
    notify(error.message || "PDF 產生失敗，請重試。", true);
  } finally {
    busy = false;
    buttons.forEach(button => { button.disabled = false; });
    form.removeAttribute("aria-busy");
  }
}

$("#preview-pdf").addEventListener("click", () => exportPdf(true));
$("#download-pdf").addEventListener("click", () => exportPdf(false));
$("#close-preview").addEventListener("click", () => dialog.close());
$("#toggle-preview").addEventListener("click", () => {
  const showImage = $("#image-preview").hidden;
  $("#image-preview").hidden = !showImage;
  $("#pdf-frame").hidden = showImage;
  $("#toggle-preview").textContent = showImage ? "查看 PDF" : "查看整頁影像";
});
