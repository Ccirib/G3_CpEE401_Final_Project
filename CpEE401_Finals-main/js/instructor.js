/* ═══════════════════════════════════════════════
   RedSentry — instructor.js
   ═══════════════════════════════════════════════ */

const API = "http://127.0.0.1:5000/api";

// ── Auth guard ────────────────────────────────────────────────────────────────
const raw  = sessionStorage.getItem("user");
const user = raw ? JSON.parse(raw) : null;
if (!user || user.role !== "instructor") {
  window.location.href = "index.html";
}

let sectionsData  = [];   // all sections for this instructor
let currentSection = null; // { section_id, subject_id, section_name, subject_code, subject_name }
let studentsData  = [];   // students in active section
let heatmapData   = [];   // average grades per section
let feedbackTarget = null; // { student_id, student_name, row_idx }
let allStudentsCache = []; // for global search
let deadlines = JSON.parse(localStorage.getItem('redsentry_deadlines') || '[]');

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("nav-username").textContent = user.name;
  document.getElementById("sidebar-info").innerHTML   =
    `<strong>${user.name}</strong><br>${user.instructor_id}<br>${user.department}`;
  await loadSections();
  await loadAtRisk();
  await loadAnnouncements();
  await loadClassStats();
  await cacheAllStudents();
  renderDeadlines();
});

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(name, el) {
  document.querySelectorAll(".sidebar-link").forEach(l => l.classList.remove("active"));
  el.classList.add("active");
  document.querySelectorAll("main > section").forEach(s => s.classList.add("hidden"));
  const tab = document.getElementById(`tab-${name}`);
  tab.classList.remove("hidden");
  tab.classList.add("animate-in");
  
  if (name === 'atrisk') loadAtRisk();
  if (name === 'sections') loadClassStats();
}

function showEntryMode(mode) {
  const isGrades = mode === "grades";
  document.getElementById("entry-grades").classList.toggle("hidden",     !isGrades);
  document.getElementById("entry-attendance").classList.toggle("hidden",  isGrades);
  document.getElementById("toggle-grades").classList.toggle("active",     isGrades);
  document.getElementById("toggle-attendance").classList.toggle("active", !isGrades);
}

// ── Load sections ─────────────────────────────────────────────────────────────
async function loadSections() {
  try {
    const res   = await fetch(`${API}/instructor/${user.id}/sections`);
    sectionsData = await res.json();
    renderSections();
  } catch {
    toast("Could not load sections.", "error");
  }
}

function renderSections() {
  const grid = document.getElementById("sections-grid");
  if (!sectionsData.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🏫</div><p>No handling sections found.</p></div>`;
    return;
  }

  // Group sections by section_name (e.g. CpE 3101, CpE 3102)
  const grouped = {};
  sectionsData.forEach(s => {
    if (!grouped[s.section_name]) grouped[s.section_name] = [];
    grouped[s.section_name].push(s);
  });

  let html = '';
  // Sort section names alphabetically
  const sectionNames = Object.keys(grouped).sort();

  for (const secName of sectionNames) {
    html += `
      <div style="grid-column: 1 / -1; margin-top: 1rem;">
        <h3 style="color: var(--maroon); border-bottom: 2px solid var(--maroon-pale); padding-bottom: .5rem; margin-bottom: 0;">Section: ${secName}</h3>
      </div>
    `;
    
    html += grouped[secName].map(s => {
      const stats = heatmapData.find(h => h.section_id === s.section_id);
      const avg = stats ? stats.avg_grade : null;
      const borderColor = avg === null ? 'var(--gray-200)' : 
                          avg >= 85 ? 'var(--green)' : 
                          avg >= 75 ? 'var(--yellow)' : 'var(--red)';

      // Progress stepper: how many of the 4 grade fields are filled across students
      const sectionStudents = allStudentsCache.filter(st => st._section_id === s.section_id);
      let filledFields = 0, totalFields = 0;
      sectionStudents.forEach(st => {
        totalFields += 4;
        if (st.prelim !== null && st.prelim !== undefined) filledFields++;
        if (st.midterm !== null && st.midterm !== undefined) filledFields++;
        if (st.semi_final !== null && st.semi_final !== undefined) filledFields++;
        if (st.final_exam !== null && st.final_exam !== undefined) filledFields++;
      });
      const progressPct = totalFields ? Math.round(filledFields / totalFields * 100) : 0;
      const progressColor = progressPct >= 75 ? 'var(--green)' : progressPct >= 40 ? 'var(--yellow)' : 'var(--red)';

      return `
        <div class="section-card animate-in" style="border-left: 6px solid ${borderColor}"
             onclick="openSection(${s.section_id}, ${s.subject_id}, '${esc(s.section_name)}', '${esc(s.subject_code)}', '${esc(s.subject_name)}')">
          <div class="sc-left">
            <div class="sc-code">${s.subject_code}</div>
            <div class="sc-name">${s.subject_name}</div>
            <div class="sc-meta">${s.units} units</div>
            ${avg !== null ? `<div style="font-size: 0.7rem; margin-top: 5px; color: var(--gray-400);">Class Avg: <strong style="color: ${borderColor}">${avg.toFixed(1)}%</strong></div>` : ''}
            <div class="progress-stepper">
              <div class="progress-stepper-fill" style="width: ${progressPct}%; background: ${progressColor};"></div>
            </div>
            <div style="font-size: 0.62rem; color: var(--gray-400); margin-top: 2px;">${progressPct}% grades encoded</div>
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
            <div class="sc-count">
              ${s.student_count}
              <small>students</small>
            </div>
            <button class="btn btn-sm btn-ghost" style="padding: 2px 8px; font-size: 0.65rem;" 
                    onclick="event.stopPropagation(); showStats(${s.section_id}, '${esc(s.subject_code)}')">📊 Stats</button>
          </div>
        </div>
      `;
    }).join("");
  }
  
  grid.innerHTML = html;
}

// ── Open section for grade entry ──────────────────────────────────────────────
async function openSection(sectionId, subjectId, sectionName, subjectCode, subjectName) {
  currentSection = { sectionId, subjectId, sectionName, subjectCode, subjectName };

  document.getElementById("entry-heading").textContent =
    `${subjectCode}: ${subjectName}`;
  document.getElementById("entry-sub").textContent =
    `Section ${sectionName} — Enter grades and attendance below.`;

  // Show entry tab link and switch to it
  const entryLink = document.getElementById("entry-link");
  entryLink.style.display = "";
  switchTab("entry", entryLink);
  showEntryMode("grades");

  await loadStudents(sectionId);
}

function goBackToSections() {
  const link = document.querySelector('[data-tab="sections"]');
  switchTab("sections", link);
}

// ── Load students ─────────────────────────────────────────────────────────────
async function loadStudents(sectionId) {
  try {
    const res    = await fetch(`${API}/instructor/section/${sectionId}/students`);
    studentsData = await res.json();
    renderGradeEntry();
    renderAttendanceEntry();
  } catch {
    toast("Could not load students.", "error");
  }
}

// ── Grade entry table ─────────────────────────────────────────────────────────
function renderGradeEntry() {
  const tbody = document.getElementById("grade-entry-body");
  if (!studentsData.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">👥</div><p>No students enrolled in this section.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = studentsData.map((st, i) => `
    <tr data-idx="${i}" class="animate-in">
      <td><span style="font-family:monospace;font-size:.82rem;color:var(--maroon)">${st.student_number}</span></td>
      <td><strong>${st.full_name}</strong></td>
      <td><input class="grade-input" type="number" min="0" max="100" step="0.01"
                 id="g-prelim-${i}" value="${st.prelim ?? ''}" placeholder="—"
                 oninput="computeRow(${i})" /></td>
      <td><input class="grade-input" type="number" min="0" max="100" step="0.01"
                 id="g-midterm-${i}" value="${st.midterm ?? ''}" placeholder="—"
                 oninput="computeRow(${i})" /></td>
      <td><input class="grade-input" type="number" min="0" max="100" step="0.01"
                 id="g-semi-${i}" value="${st.semi_final ?? ''}" placeholder="—"
                 oninput="computeRow(${i})" /></td>
      <td><input class="grade-input" type="number" min="0" max="100" step="0.01"
                 id="g-final-${i}" value="${st.final_exam ?? ''}" placeholder="—"
                 oninput="computeRow(${i})" /></td>
      <td id="g-computed-${i}">
        <strong>${st.final_grade ?? '—'}</strong> 
        ${st.final_grade ? `<span style="font-size:0.8em; color:var(--maroon);">(${getGradingInfo(st.final_grade).eq})</span>` : ''}
      </td>
      <td id="g-remarks-${i}">${remarksBadge(st.final_grade ? getGradingInfo(st.final_grade).rem : null)}</td>
      <td>
        <button class="btn btn-sm btn-outline" style="padding: 2px 8px; font-size: 0.7rem;"
                onclick="openFeedback(${st.student_id}, '${esc(st.full_name)}', ${i})">
          ${st.private_comment ? '💬 View' : '➕ Add'}
        </button>
      </td>
    </tr>
  `).join("");
}

function getGradingInfo(grade) {
  if (grade === null || grade === undefined || isNaN(grade)) return { eq: "—", rem: null };
  const g = Math.round(grade);
  if (g >= 98) return { eq: "1.00", rem: "Excellent" };
  if (g >= 94) return { eq: "1.25", rem: "Superior" };
  if (g >= 90) return { eq: "1.50", rem: "Very Good" };
  if (g >= 88) return { eq: "1.75", rem: "Good" };
  if (g >= 85) return { eq: "2.00", rem: "Meritorious" };
  if (g >= 83) return { eq: "2.25", rem: "Very Satisfactory" };
  if (g >= 80) return { eq: "2.50", rem: "Satisfactory" };
  if (g >= 78) return { eq: "2.75", rem: "Fairly Satisfactory" };
  if (g >= 75) return { eq: "3.00", rem: "Passing" };
  if (g >= 70) return { eq: "INC", rem: "Remedial" };
  return { eq: "5.00", rem: "Failure" };
}

function computeRow(i) {
  const get = id => {
    const v = parseFloat(document.getElementById(id)?.value);
    return isNaN(v) ? null : v;
  };
  const p = get(`g-prelim-${i}`), m = get(`g-midterm-${i}`),
        s = get(`g-semi-${i}`),   f = get(`g-final-${i}`);
  const compEl    = document.getElementById(`g-computed-${i}`);
  const remarksEl = document.getElementById(`g-remarks-${i}`);
  if ([p, m, s, f].every(v => v !== null)) {
    const fg = +(p*0.20 + m*0.20 + s*0.20 + f*0.40).toFixed(2);
    const info = getGradingInfo(fg);
    compEl.innerHTML    = `<strong>${fg}</strong> <span style="font-size:0.8em; color:var(--maroon);">(${info.eq})</span>`;
    remarksEl.innerHTML = remarksBadge(info.rem);
  } else {
    compEl.innerHTML    = `<strong>—</strong>`;
    remarksEl.innerHTML = remarksBadge(null);
  }
}

async function saveAllGrades() {
  if (!currentSection) return;
  const gradesPayload = [];
  
  for (let i = 0; i < studentsData.length; i++) {
    const st     = studentsData[i];
    const getVal = id => {
      const v = parseFloat(document.getElementById(id)?.value);
      return isNaN(v) ? null : v;
    };
    gradesPayload.push({
      student_id: st.student_id,
      subject_id: currentSection.subjectId,
      instructor_id: user.id,
      prelim:     getVal(`g-prelim-${i}`),
      midterm:    getVal(`g-midterm-${i}`),
      semi_final: getVal(`g-semi-${i}`),
      final_exam: getVal(`g-final-${i}`)
    });
  }

  try {
    const res = await fetch(`${API}/instructor/grades/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grades: gradesPayload })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      toast(`✓ Saved all grades & notifications sent.`, "success");
    } else {
      toast("Error saving grades.", "error");
    }
  } catch (err) {
    toast("Error saving grades.", "error");
  }
  loadClassStats(); // Refresh heatmap
}

// ── Bulk Grade Curve ──────────────────────────────────────────────────────────
function openCurveModal() {
  document.getElementById("curve-points").value = "";
  document.getElementById("curve-modal").classList.remove("hidden");
}

function closeCurveModal() {
  document.getElementById("curve-modal").classList.add("hidden");
}

function applyCurve() {
  const term = document.getElementById("curve-term").value;
  const pointsStr = document.getElementById("curve-points").value;
  if (!pointsStr) {
    toast("Please enter the points to add.", "error");
    return;
  }
  
  const points = parseFloat(pointsStr);
  if (isNaN(points)) {
    toast("Invalid number of points.", "error");
    return;
  }

  for (let i = 0; i < studentsData.length; i++) {
    const inputId = `g-${term}-${i}`;
    const inputEl = document.getElementById(inputId);
    if (inputEl && inputEl.value !== "") {
      let currentVal = parseFloat(inputEl.value);
      if (!isNaN(currentVal)) {
        let newVal = currentVal + points;
        // Cap max at 100, min at 0
        if (newVal > 100) newVal = 100;
        if (newVal < 0) newVal = 0;
        inputEl.value = newVal.toFixed(2);
        // Recalculate Final Grade instantly
        computeRow(i);
      }
    }
  }

  closeCurveModal();
  toast(`Applied ${points > 0 ? '+' : ''}${points} curve to ${term.toUpperCase()} grades!`, "success");
}

let globalAtRiskData = [];

// ── At-Risk Dashboard ─────────────────────────────────────────────────────────
async function loadAtRisk() {
  try {
    const res = await fetch(`${API}/instructor/${user.id}/at-risk`);
    globalAtRiskData = await res.json();
    
    // Populate the section filter dropdown based on unique section names
    const sectionNames = [...new Set(globalAtRiskData.map(st => st.section_name))].sort();
    const filterEl = document.getElementById("atrisk-section-filter");
    
    // Keep the "All Sections" option and append the rest
    filterEl.innerHTML = `<option value="all">All Sections</option>` + 
      sectionNames.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join("");

    renderAtRisk();
  } catch {
    toast("Could not load at-risk data.", "error");
  }
}

function renderAtRisk() {
  const container = document.getElementById("atrisk-container");
  const filterVal = document.getElementById("atrisk-section-filter").value;
  
  let filteredData = globalAtRiskData;
  if (filterVal !== "all") {
    filteredData = globalAtRiskData.filter(st => st.section_name === filterVal);
  }
  
  if (!filteredData.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🎉</div><p>No students currently at risk for the selected section.</p></div>`;
    return;
  }
  
  // Group by Subject Code
  const grouped = {};
  filteredData.forEach(st => {
    if (!grouped[st.subject_code]) grouped[st.subject_code] = [];
    grouped[st.subject_code].push(st);
  });
  
  let html = '';
  // Sort subjects alphabetically
  const subjects = Object.keys(grouped).sort();
  
  for (const subj of subjects) {
    html += `
      <div class="card card-maroon-top" style="margin-bottom: 1.5rem;">
        <div class="card-header" style="padding: 1rem 1.5rem;">
          <h3 style="margin: 0; font-size: 1.1rem;">Subject: ${subj}</h3>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SR-Code</th>
                <th>Student</th>
                <th>Section</th>
                <th>Grade</th>
                <th>Absences</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
    `;
    
    html += grouped[subj].map(st => `
      <tr>
        <td><code>${st.student_number}</code></td>
        <td><strong>${st.full_name}</strong></td>
        <td>${st.section_name}</td>
        <td><span class="badge ${st.final_grade < 75 && st.final_grade !== null ? 'badge-failed' : 'badge-pending'}">${st.final_grade ?? '—'}</span></td>
        <td><span class="badge ${st.absences >= 6 ? 'badge-dropped' : 'badge-warning'}">${st.absences} absences</span></td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="openInterveneModal(${st.section_id}, '${esc(st.email)}', '${esc(st.full_name)}', '${esc(subj)}')">Intervene</button>
        </td>
      </tr>
    `).join("");
    
    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
}

async function openSectionById(id) {
  const s = sectionsData.find(sec => String(sec.section_id) === String(id));
  if (s) {
    openSection(s.section_id, s.subject_id, s.section_name, s.subject_code, s.subject_name);
  } else {
    toast("Section data not found.", "error");
  }
}

// ── Intervene Modal ───────────────────────────────────────────────────────────
function openInterveneModal(sectionId, email, studentName, subjectCode) {
  document.getElementById("intervene-student-name").textContent = studentName;
  
  const emailSpan = document.getElementById("intervene-student-email");
  const emailBtn = document.getElementById("intervene-email-btn");
  if (email && email !== "null" && email !== "undefined") {
    emailSpan.textContent = `(${email})`;
    emailBtn.href = `mailto:${email}?subject=Regarding your performance in ${subjectCode}&body=Hello ${studentName},%0D%0A%0D%0AWe need to discuss your recent performance in ${subjectCode}. Please contact me as soon as possible.%0D%0A%0D%0AInstructor ${user.name}`;
    emailBtn.style.display = ""; // Ensure it's visible
  } else {
    emailSpan.textContent = "(No email on record)";
    emailBtn.style.display = "none"; // Hide if no email
  }
  
  const gradeBtn = document.getElementById("intervene-grade-btn");
  gradeBtn.onclick = () => {
    closeInterveneModal();
    openSectionById(sectionId);
  };
  
  document.getElementById("intervene-modal").classList.remove("hidden");
}

function closeInterveneModal() {
  document.getElementById("intervene-modal").classList.add("hidden");
}


// ── Heatmap & Stats ───────────────────────────────────────────────────────────
async function loadClassStats() {
  try {
    const res = await fetch(`${API}/instructor/${user.id}/class-stats`);
    heatmapData = await res.json();
    renderSections();
  } catch {}
}

async function showStats(secId, code) {
  try {
    document.getElementById("stats-title").textContent = `${code} — Grade Distribution`;
    document.getElementById("stats-modal").classList.remove("hidden");
    const chart = document.getElementById("stats-chart");
    chart.innerHTML = '<div class="spinner"></div>';
    
    const res = await fetch(`${API}/instructor/section/${secId}/grade-dist`);
    const data = await res.json();
    
    const max = Math.max(data.count_a, data.count_b, data.count_c, data.count_f, 1);
    const getH = c => (c / max * 100) + "%";
    
    chart.innerHTML = `
      <div style="flex:1; background:var(--green); height:${getH(data.count_a)}; border-radius:4px 4px 0 0; position:relative; min-height:10px;" title="${data.count_a} students">
        <span style="position:absolute; top:-20px; width:100%; text-align:center; font-size:0.7rem; font-weight:800;">${data.count_a}</span>
      </div>
      <div style="flex:1; background:var(--maroon-light); height:${getH(data.count_b)}; border-radius:4px 4px 0 0; position:relative; min-height:10px;" title="${data.count_b} students">
        <span style="position:absolute; top:-20px; width:100%; text-align:center; font-size:0.7rem; font-weight:800;">${data.count_b}</span>
      </div>
      <div style="flex:1; background:var(--yellow); height:${getH(data.count_c)}; border-radius:4px 4px 0 0; position:relative; min-height:10px;" title="${data.count_c} students">
        <span style="position:absolute; top:-20px; width:100%; text-align:center; font-size:0.7rem; font-weight:800;">${data.count_c}</span>
      </div>
      <div style="flex:1; background:var(--red); height:${getH(data.count_f)}; border-radius:4px 4px 0 0; position:relative; min-height:10px;" title="${data.count_f} students">
        <span style="position:absolute; top:-20px; width:100%; text-align:center; font-size:0.7rem; font-weight:800;">${data.count_f}</span>
      </div>
    `;
  } catch {
    toast("Could not load statistics.", "error");
  }
}
function closeStatsModal() { document.getElementById("stats-modal").classList.add("hidden"); }

// ── Announcements ─────────────────────────────────────────────────────────────
let currentAnnouncementId = null;

async function loadAnnouncements() {
  try {
    const res = await fetch(`${API}/announcements`);
    const data = await res.json();
    const deleteBtn = document.getElementById("ann-delete-btn");
    
    if (data.length) {
      currentAnnouncementId = data[0].id;
      document.getElementById("ann-text").textContent = data[0].content;
      document.getElementById("ann-meta").textContent = `Posted by ${data[0].instructor_name} • ${new Date(data[0].created_at).toLocaleDateString()}`;
      
      // Show delete button if current instructor is the author
      if (data[0].instructor_id === user.id && deleteBtn) {
        deleteBtn.style.display = "block";
      } else if (deleteBtn) {
        deleteBtn.style.display = "none";
      }
    } else {
      currentAnnouncementId = null;
      document.getElementById("ann-text").textContent = "No urgent updates at this time.";
      document.getElementById("ann-meta").textContent = "";
      if (deleteBtn) deleteBtn.style.display = "none";
    }
  } catch {}
}

function openAnnouncementModal() { document.getElementById("announcement-modal").classList.remove("hidden"); }
function closeAnnouncementModal() { document.getElementById("announcement-modal").classList.add("hidden"); }
async function postAnnouncement() {
  const content = document.getElementById("ann-input").value;
  if (!content) return;
  try {
    const res = await fetch(`${API}/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructor_id: user.id, content })
    });
    if (res.ok) {
      toast("Announcement broadcasted!", "success");
      closeAnnouncementModal();
      loadAnnouncements();
      document.getElementById("ann-input").value = "";
    }
  } catch { toast("Failed to post.", "error"); }
}

async function deleteAnnouncement() {
  if (!currentAnnouncementId) return;
  if (!confirm("Are you sure you want to delete this announcement?")) return;
  
  try {
    const res = await fetch(`${API}/announcements/${currentAnnouncementId}`, {
      method: "DELETE"
    });
    if (res.ok) {
      toast("Announcement deleted.", "success");
      loadAnnouncements();
    } else {
      toast("Failed to delete.", "error");
    }
  } catch {
    toast("Failed to delete.", "error");
  }
}

// ── Private Feedback ──────────────────────────────────────────────────────────
function openFeedback(id, name, idx) {
  feedbackTarget = { id, name, idx };
  document.getElementById("feedback-student-name").textContent = `Feedback for ${name}`;
  document.getElementById("feedback-text").value = studentsData[idx].private_comment || "";
  document.getElementById("feedback-modal").classList.remove("hidden");
}
function closeFeedbackModal() { document.getElementById("feedback-modal").classList.add("hidden"); }
function saveFeedback() {
  if (!feedbackTarget) return;
  const comment = document.getElementById("feedback-text").value;
  studentsData[feedbackTarget.idx].private_comment = comment;
  toast("Comment attached to grade record.", "info");
  closeFeedbackModal();
  renderGradeEntry();
}

// ── Attendance entry table ────────────────────────────────────────────────────
function renderAttendanceEntry() {
  const tbody = document.getElementById("att-entry-body");
  if (!studentsData.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📅</div><p>No students enrolled.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = studentsData.map((st, i) => `
    <tr class="animate-in">
      <td><span style="font-family:monospace;font-size:.82rem;color:var(--maroon)">${st.student_number}</span></td>
      <td><strong>${st.full_name}</strong></td>
      <td>
        <input class="grade-input" type="number" min="0" id="a-total-${i}"
               value="${st.total_classes ?? ''}" placeholder="0"
               oninput="computeAtt(${i})" style="width:80px" />
      </td>
      <td>
        <input class="grade-input" type="number" min="0" id="a-attended-${i}"
               value="${st.classes_attended ?? ''}" placeholder="0"
               oninput="computeAtt(${i})" style="width:80px" />
      </td>
      <td id="a-absences-${i}"><strong>${st.absences ?? '—'}</strong></td>
      <td id="a-remarks-${i}">${attBadge(st.att_remarks)}</td>
    </tr>
  `).join("");
}

function computeAtt(i) {
  const tot = parseInt(document.getElementById(`a-total-${i}`)?.value) || 0;
  const att = parseInt(document.getElementById(`a-attended-${i}`)?.value) || 0;
  const abs = Math.max(0, tot - att);
  const rem = abs <= 3 ? "GOOD" : abs <= 6 ? "WARNING" : "DROPPED";
  document.getElementById(`a-absences-${i}`).innerHTML = `<strong>${abs}</strong>`;
  document.getElementById(`a-remarks-${i}`).innerHTML  = attBadge(rem);
}

async function saveAllAttendance() {
  if (!currentSection) return;
  const attPayload = [];
  
  for (let i = 0; i < studentsData.length; i++) {
    const st      = studentsData[i];
    const total   = parseInt(document.getElementById(`a-total-${i}`)?.value)    || 0;
    const attended = parseInt(document.getElementById(`a-attended-${i}`)?.value) || 0;
    
    attPayload.push({
      student_id: st.student_id,
      subject_id: currentSection.subjectId,
      total_classes: total,
      classes_attended: attended
    });
  }

  try {
    const res = await fetch(`${API}/instructor/attendance/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attendances: attPayload })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      toast(`✓ Attendance saved for all students.`, "success");
    } else {
      toast("Error saving attendance.", "error");
    }
  } catch (err) {
    toast("Error saving attendance.", "error");
  }
}

// ── Bulk Attendance: Add +1 Class ────────────────────────────────────────
function selectAllPresent() {
  for (let i = 0; i < studentsData.length; i++) {
    const totalEl = document.getElementById(`a-total-${i}`);
    const attendedEl = document.getElementById(`a-attended-${i}`);
    
    const currentTotal = parseInt(totalEl?.value) || 0;
    const currentAttended = parseInt(attendedEl?.value) || 0;
    
    totalEl.value = currentTotal + 1;
    attendedEl.value = currentAttended + 1;
    
    computeAtt(i);
  }
  toast("Added +1 class to all students. Adjust absent students manually.", "success");
}

// ── Global Student Search ─────────────────────────────────────────────────────
async function cacheAllStudents() {
  try {
    for (const sec of sectionsData) {
      const res = await fetch(`${API}/instructor/section/${sec.section_id}/students`);
      const students = await res.json();
      students.forEach(st => {
        st._section_id = sec.section_id;
        st._subject_code = sec.subject_code;
        st._section_name = sec.section_name;
        st._subject_name = sec.subject_name;
        st._subject_id = sec.subject_id;
      });
      allStudentsCache.push(...students);
    }
  } catch {}
}

function onGlobalSearch(q) {
  const box = document.getElementById('search-results');
  if (!q || q.length < 2) {
    box.classList.remove('show');
    return;
  }
  const lower = q.toLowerCase();
  const matches = allStudentsCache.filter(st =>
    st.full_name.toLowerCase().includes(lower) ||
    st.student_number.toLowerCase().includes(lower)
  ).slice(0, 8);

  if (!matches.length) {
    box.innerHTML = '<div class="search-result-item">No results found.</div>';
    box.classList.add('show');
    return;
  }

  // De-duplicate by student_id + section_id
  const seen = new Set();
  const unique = matches.filter(m => {
    const key = m.student_id + '-' + m._section_id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  box.innerHTML = unique.map(st => `
    <div class="search-result-item" onclick="jumpToStudent(${st._section_id}, ${st._subject_id}, '${esc(st._section_name)}', '${esc(st._subject_code)}', '${esc(st._subject_name)}')">
      <strong>${st.full_name}</strong> <small>${st.student_number}</small><br>
      <small>${st._subject_code} · ${st._section_name}</small>
    </div>
  `).join('');
  box.classList.add('show');
}

function jumpToStudent(secId, subjId, secName, subjCode, subjName) {
  document.getElementById('search-results').classList.remove('show');
  document.getElementById('global-search').value = '';
  openSection(secId, subjId, secName, subjCode, subjName);
}

// Close search when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('.quick-search-wrap')) {
    document.getElementById('search-results').classList.remove('show');
  }
});

// ── Deadlines Calendar ────────────────────────────────────────────────────────
function renderDeadlines() {
  const container = document.getElementById('cal-events');
  // Sort by date
  deadlines.sort((a, b) => new Date(a.date) - new Date(b.date));
  // Filter to upcoming only
  const upcoming = deadlines.filter(d => new Date(d.date) >= new Date(new Date().toDateString()));
  
  if (!upcoming.length) {
    container.innerHTML = '<div style="font-size:.72rem; color:var(--gray-400); padding:.3rem 0;">No deadlines set.</div>';
    return;
  }
  
  container.innerHTML = upcoming.slice(0, 5).map(d => `
    <div class="cal-event">
      <div class="cal-date">${new Date(d.date).toLocaleDateString('en-US', { month:'short', day:'numeric' })}</div>
      ${d.subject} — ${d.desc}
    </div>
  `).join('');
}

function openDeadlineModal() {
  // Populate subject dropdown
  const sel = document.getElementById('deadline-subject');
  sel.innerHTML = sectionsData.map(s => `<option value="${esc(s.subject_code)}">${s.subject_code} — ${s.subject_name}</option>`).join('');
  document.getElementById('deadline-modal').classList.remove('hidden');
}
function closeDeadlineModal() { document.getElementById('deadline-modal').classList.add('hidden'); }

function addDeadline() {
  const subject = document.getElementById('deadline-subject').value;
  const date = document.getElementById('deadline-date').value;
  const desc = document.getElementById('deadline-desc').value;
  if (!subject || !date || !desc) { toast('Please fill all fields.', 'error'); return; }
  deadlines.push({ subject, date, desc });
  localStorage.setItem('redsentry_deadlines', JSON.stringify(deadlines));
  renderDeadlines();
  closeDeadlineModal();
  toast('Deadline added!', 'success');
  // Clear inputs
  document.getElementById('deadline-date').value = '';
  document.getElementById('deadline-desc').value = '';
}

// ── Export to CSV ─────────────────────────────────────────────────────────────
function exportGrades() {
  if (!allStudentsCache.length) {
    toast('No data to export. Load sections first.', 'error');
    return;
  }
  
  let csv = 'SR-Code,Student Name,Subject,Section,Prelim,Midterm,Semi-Final,Final Exam,Final Grade,Remarks\n';
  allStudentsCache.forEach(st => {
    csv += [
      st.student_number,
      `"${st.full_name}"`,
      st._subject_code,
      st._section_name,
      st.prelim ?? '',
      st.midterm ?? '',
      st.semi_final ?? '',
      st.final_exam ?? '',
      st.final_grade ?? '',
      st.remarks ?? 'PENDING'
    ].join(',') + '\n';
  });
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `RedSentry_GradeSheet_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Grade sheet exported! Open with Excel.', 'success');
}

// ── Badges ────────────────────────────────────────────────────────────────────
function remarksBadge(r) {
  if (!r) return `<span class="badge badge-pending">Pending</span>`;
  const txt = r.toUpperCase();
  if (txt === "FAILURE" || txt === "FAILED") return `<span class="badge badge-failed">${r}</span>`;
  if (txt === "REMEDIAL") return `<span class="badge badge-warning">${r}</span>`;
  return `<span class="badge badge-passed">${r}</span>`;
}
function attBadge(r) {
  if (!r) return `<span class="badge badge-pending">—</span>`;
  const map = { GOOD: "badge-good", WARNING: "badge-warning", DROPPED: "badge-dropped" };
  return `<span class="badge ${map[r] || 'badge-pending'}">${r}</span>`;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = "") {
  const t   = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.getElementById("toast-container").appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function esc(s) { return (s || "").replace(/'/g, "\\'"); }

// ── Logout ────────────────────────────────────────────────────────────────────
function logout() {
  sessionStorage.clear();
  window.location.href = "index.html";
}

// ── Theme Toggle (Dark Mode) ──────────────────────────────────────────────────
function toggleTheme() {
  const body = document.body;
  const themeButton = document.getElementById('theme-toggle');
  
  body.classList.toggle('dark-theme');
  const isDark = body.classList.contains('dark-theme');
  
  localStorage.setItem('redsentry_theme', isDark ? 'dark' : 'light');
  themeButton.textContent = isDark ? '☀️' : '🌙';
}

// ── Check saved theme on load ──
window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem('redsentry_theme');
  const themeButton = document.getElementById('theme-toggle');
  
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    if (themeButton) themeButton.textContent = '☀️';
  }
});
