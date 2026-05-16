/* ═══════════════════════════════════════════════
   RedSentry — student.js
   ═══════════════════════════════════════════════ */

const API = "http://127.0.0.1:5000/api";

// ── Auth guard ────────────────────────────────────────────────────────────────
const raw  = sessionStorage.getItem("user");
const user = raw ? JSON.parse(raw) : null;
if (!user || user.role !== "student") {
  window.location.href = "index.html";
}

let subjectsData   = [];
let attendanceData = [];
let currentComputationData = null; // Saves original DB grades for the interactive modal
let todosData = [];

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  // Populate navbar & sidebar
  document.getElementById("nav-username").textContent = user.name;
  document.getElementById("welcome-heading").textContent = `Welcome back, ${user.name.split(" ")[0]}!`;
  document.getElementById("welcome-sub").textContent =
    `${user.course} • ${user.year_level} • ${user.section} • SR-Code: ${user.student_number}`;
  document.getElementById("sidebar-info").innerHTML =
    `<strong>${user.name}</strong><br>${user.student_number}<br>${user.section}`;

  // Wait for ALL data to load
  await loadSubjects();
  await loadAttendance();
  await loadAllSubjects(); 
  await loadAnnouncements();
  await loadTodos();
  
  updateOverviewStats();
});

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(name, el) {
  document.querySelectorAll(".sidebar-link").forEach(l => l.classList.remove("active"));
  el.classList.add("active");
  document.querySelectorAll("main > section").forEach(s => s.classList.add("hidden"));
  const tab = document.getElementById(`tab-${name}`);
  tab.classList.remove("hidden");
  tab.classList.add("animate-in");
}

// ── Load subjects (grades) ────────────────────────────────────────────────────
async function loadSubjects() {
  try {
    const res  = await fetch(`${API}/student/${user.id}/subjects`);
    subjectsData = await res.json();
    renderOverviewTable();
    renderGradesTable();
    populateTodoSubjects();
  } catch {
    toast("Could not load grade data.", "error");
  }
}

function renderOverviewTable() {
  const tbody = document.getElementById("overview-table-body");
  if (!subjectsData.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📋</div><p>No subjects enrolled.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = subjectsData.map(s => `
    <tr class="subject-row animate-in">
      <td><span class="subject-code">${s.subject_code}</span></td>
      <td><strong>${s.subject_name}</strong></td>
      <td>${s.prelim     ?? '<span style="color:var(--gray-400)">—</span>'}</td>
      <td>${s.midterm    ?? '<span style="color:var(--gray-400)">—</span>'}</td>
      <td>${s.semi_final ?? '<span style="color:var(--gray-400)">—</span>'}</td>
      <td>${s.final_exam ?? '<span style="color:var(--gray-400)">—</span>'}</td>
      <td><strong>${s.final_grade ?? '—'}</strong></td>
      <td>${remarksBadge(s.remarks)}</td>
    </tr>
  `).join("");
}

function renderGradesTable() {
  const tbody = document.getElementById("grades-table-body");
  if (!subjectsData.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📝</div><p>No subjects enrolled.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = subjectsData.map(s => `
    <tr class="animate-in">
      <td><span class="subject-code">${s.subject_code}</span></td>
      <td><strong>${s.subject_name}</strong></td>
      <td>${s.units}</td>
      <td>${s.section_name}</td>
      <td>${s.instructor_name}</td>
      <td><strong>${s.final_grade ?? '—'}</strong></td>
      <td>${remarksBadge(s.remarks)}</td>
      <td>
        <button class="btn btn-outline btn-sm view-btn"
                onclick="openCompModal(${s.subject_id}, '${s.subject_code}', '${s.subject_name}')">
          📊 Computation
        </button>
      </td>
    </tr>
  `).join("");
}

// ── Load attendance ───────────────────────────────────────────────────────────
async function loadAttendance() {
  try {
    const res = await fetch(`${API}/student/${user.id}/attendance`);
    attendanceData = await res.json();
    renderAttendanceTable();
  } catch {
    toast("Could not load attendance data.", "error");
  }
}

function renderAttendanceTable() {
  const tbody = document.getElementById("attendance-table-body");
  if (!attendanceData.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📅</div><p>No attendance data yet.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = attendanceData.map(a => {
    const pct   = a.percentage;
    const fill  = pct >= 80 ? "" : pct >= 70 ? " warn" : " bad";
    return `
      <tr class="animate-in">
        <td><span class="subject-code">${a.subject_code}</span></td>
        <td><strong>${a.subject_name}</strong></td>
        <td>${a.total_classes}</td>
        <td>${a.classes_attended}</td>
        <td><strong>${a.absences}</strong></td>
        <td>
          <div class="att-pct">
            <div class="progress-bar" style="min-width:80px">
              <div class="progress-fill${fill}" style="width:${pct}%"></div>
            </div>
            <span>${pct}%</span>
          </div>
        </td>
        <td>${attBadge(a.remarks)}</td>
      </tr>
    `;
  }).join("");
}

// ── Load ALL Available Subjects ───────────────────────────────────────────────
async function loadAllSubjects() {
  try {
    const res = await fetch(`${API}/subjects`);
    if (!res.ok) throw new Error("Backend route missing or failing.");
    const allSubjects = await res.json();
    const tbody = document.getElementById("all-subjects-list");
    if (!tbody) return;

    if (allSubjects.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state"><p>No subjects found in database.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = allSubjects.map(s => `
      <tr class="animate-in">
        <td><span class="subject-code">${s.subject_code}</span></td>
        <td><strong>${s.subject_name}</strong></td>
        <td>${s.units}</td>
      </tr>
    `).join("");

  } catch (error) {
    console.error("Error loading all subjects:", error);
  }
}

// ── Overview stats ────────────────────────────────────────────────────────────
function updateOverviewStats() {
  const total   = subjectsData.length;
  const graded  = subjectsData.filter(s => s.final_grade !== null);
  const passed  = graded.filter(s => s.final_grade >= 75).length;
  const avg     = graded.length
    ? (graded.reduce((a, s) => a + s.final_grade, 0) / graded.length).toFixed(2)
    : "—";
  const attAvg  = attendanceData.length
    ? (attendanceData.reduce((a, s) => a + s.percentage, 0) / attendanceData.length).toFixed(1) + "%"
    : "—";

  document.getElementById("stat-subjects").textContent = total;
  document.getElementById("stat-avg").textContent      = avg;
  document.getElementById("stat-passed").textContent   = passed;
  document.getElementById("stat-att").textContent      = attAvg;

  renderPerformanceChart();
}

// ── Performance Chart ────────────────────────────────────────────────────────
function renderPerformanceChart() {
  const ctx = document.getElementById('performanceTrendChart');
  if (!ctx) return;

  // Calculate averages for Prelim, Midterm, and Semi-Final across all subjects
  const getAvg = field => {
    const vals = subjectsData.map(s => s[field]).filter(v => v !== null);
    return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : 0;
  };

  const prelimAvg = getAvg('prelim');
  const midtermAvg = getAvg('midterm');
  const semiFinalAvg = getAvg('semi_final');
  const finalExamAvg = getAvg('final_exam');

  // If no data yet, don't render or show empty state?
  // Let's render it anyway, maybe with a note.

  // Destroy previous chart instance if it exists to avoid memory leaks/overlay
  if (window.perfChart) window.perfChart.destroy();

  const isDarkMode = document.body.classList.contains('dark-theme');
  const textColor = isDarkMode ? '#b0b0b0' : '#666';
  const gridColor = isDarkMode ? '#333' : '#eee';

  window.perfChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Prelim', 'Midterm', 'Semi-Final', 'Final Exam'],
      datasets: [{
        label: 'Average Score',
        data: [prelimAvg, midtermAvg, semiFinalAvg, finalExamAvg],
        borderColor: '#800000', // Maroon
        backgroundColor: 'rgba(128, 0, 0, 0.1)',
        borderWidth: 3,
        pointBackgroundColor: '#800000',
        pointRadius: 6,
        pointHoverRadius: 8,
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: false,
          min: 60,
          max: 100,
          grid: { color: gridColor },
          ticks: { color: textColor }
        },
        x: {
          grid: { display: false },
          ticks: { color: textColor }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDarkMode ? '#1e1e1e' : '#fff',
          titleColor: isDarkMode ? '#ff7e7e' : '#800000',
          bodyColor: isDarkMode ? '#f5f5f5' : '#333',
          borderColor: '#800000',
          borderWidth: 1,
          displayColors: false,
          padding: 12
        }
      }
    }
  });
}

// ── Grade Sandbox & Computation Modal ─────────────────────────────────────────
async function openCompModal(subjectId, code, name) {
  document.getElementById("comp-modal-title").textContent = `${code} — ${name}`;
  document.getElementById("comp-modal").classList.remove("hidden");
  document.getElementById("comp-grid").innerHTML = `<div class="loading" style="grid-column:span 2"><div class="spinner"></div> Loading…</div>`;
  document.getElementById("final-result-block").innerHTML = "";

  try {
    const res  = await fetch(`${API}/student/${user.id}/grade-computation/${subjectId}`);
    if (!res.ok) throw new Error();
    currentComputationData = await res.json();
    
    // Show private comment if exists
    const feedbackSec = document.getElementById("private-feedback-section");
    const commentBox = document.getElementById("private-comment-box");
    if (currentComputationData.private_comment) {
      feedbackSec.style.display = "block";
      commentBox.textContent = currentComputationData.private_comment;
    } else {
      feedbackSec.style.display = "none";
    }
    
    buildInteractiveGrid();
  } catch {
    document.getElementById("comp-grid").innerHTML = `
      <div style="grid-column:span 2" class="empty-state">
        <div class="empty-icon">📋</div>
        <p>Grade not yet available for this subject.</p>
      </div>`;
  }
}

function createInputBlock(label, id, value, weightText) {
  const valStr = value !== null ? value : "";
  const placeholder = value === null && id === "final_exam" ? "AWAITING" : "";
  return `
    <div class="comp-item">
      <div class="ci-label">${label}</div>
      <input type="number" id="input-${id}" class="edit-input" value="${valStr}" placeholder="${placeholder}" oninput="recalculateGrades()">
      <div class="ci-weight">× ${weightText}</div>
      <div class="ci-weighted" id="weighted-${id}">= —</div>
    </div>
  `;
}

function buildInteractiveGrid() {
  const g = currentComputationData;
  document.getElementById("comp-grid").innerHTML = `
    ${createInputBlock("Prelim", "prelim", g.prelim, "20%")}
    ${createInputBlock("Midterm", "midterm", g.midterm, "20%")}
    ${createInputBlock("Semi-Final", "semi_final", g.semi_final, "20%")}
    ${createInputBlock("Final Exam", "final_exam", g.final_exam, "40%")}
  `;
  recalculateGrades();
}

function recalculateGrades() {
  const pStr = document.getElementById("input-prelim").value;
  const mStr = document.getElementById("input-midterm").value;
  const sfStr = document.getElementById("input-semi_final").value;
  const fStr = document.getElementById("input-final_exam").value;

  const p = pStr ? parseFloat(pStr) : null;
  const m = mStr ? parseFloat(mStr) : null;
  const sf = sfStr ? parseFloat(sfStr) : null;
  const f = fStr ? parseFloat(fStr) : null;

  document.getElementById("weighted-prelim").textContent = p !== null ? "= " + (p * 0.20).toFixed(2) : "= —";
  document.getElementById("weighted-midterm").textContent = m !== null ? "= " + (m * 0.20).toFixed(2) : "= —";
  document.getElementById("weighted-semi_final").textContent = sf !== null ? "= " + (sf * 0.20).toFixed(2) : "= —";
  document.getElementById("weighted-final_exam").textContent = f !== null ? "= " + (f * 0.40).toFixed(2) : "= —";

  let total = 0;
  let isComplete = true;

  if (p !== null) total += p * 0.20; else isComplete = false;
  if (m !== null) total += m * 0.20; else isComplete = false;
  if (sf !== null) total += sf * 0.20; else isComplete = false;
  if (f !== null) total += f * 0.40; else isComplete = false;

  const resultBlock = document.getElementById("final-result-block");
  const resetButton = `
    <button onclick="buildInteractiveGrid()" style="display:inline-block; margin-top:0.5rem; background:rgba(255,255,255,0.25); border:none; color:white; padding:4px 10px; border-radius:20px; cursor:pointer; font-size:0.75rem; font-weight:bold; transition:0.2s;">
      ↺ Reset Original
    </button>
  `;

  if (isComplete) {
    const remarks = total >= 75 ? "✔ PASSED" : "✘ FAILED";
    resultBlock.innerHTML = `
      <div>
        <div class="fr-label">Simulated Final Grade</div>
        <div class="fr-grade">${total.toFixed(2)}</div>
      </div>
      <div style="text-align:right">
        <span class="fr-remarks">${remarks}</span><br>
        ${resetButton}
      </div>
    `;
  } else {
    resultBlock.innerHTML = `
      <div>
        <div class="fr-label">Current Standing (Partial)</div>
        <div class="fr-grade">${total.toFixed(2)}</div>
      </div>
      <div style="text-align:right">
        <span class="fr-remarks" style="background: rgba(255, 255, 255, 0.3);">Awaiting Inputs</span><br>
        ${resetButton}
      </div>
    `;
  }
}

function closeCompModal() {
  document.getElementById("comp-modal").classList.add("hidden");
}

async function loadAnnouncements() {
  try {
    const res = await fetch(`${API}/announcements`);
    const data = await res.json();
    if (data.length) {
      const ann = data[0];
      const banner = document.getElementById("student-announcement");
      document.getElementById("student-ann-content").textContent = ann.content;
      document.getElementById("student-ann-meta").textContent = `Posted by ${ann.instructor_name} • ${new Date(ann.created_at).toLocaleDateString()}`;
      banner.style.display = "block";
    }
  } catch {}
}

document.getElementById("comp-modal").addEventListener("click", e => {
  if (e.target === e.currentTarget) closeCompModal();
});

// ── To-Do List ────────────────────────────────────────────────────────────────
function populateTodoSubjects() {
  const sel = document.getElementById("new-todo-subject");
  if (!sel) return;
  sel.innerHTML = `<option value="">No Subject</option>` +
    subjectsData.map(s => `<option value="${s.subject_code}">${s.subject_code}</option>`).join('');
}

async function loadTodos() {
  try {
    const res = await fetch(`${API}/student/${user.id}/todos`);
    todosData = await res.json();
    renderTodos();
  } catch (err) {
    console.error("Could not load to-do list.", err);
  }
}

function renderTodos() {
  const list = document.getElementById("todo-list");
  if (!todosData.length) {
    list.innerHTML = `<li><div class="empty-state"><div class="empty-icon">✅</div><p>You're all caught up! No pending tasks.</p></div></li>`;
    return;
  }
  
  const today = new Date();
  today.setHours(0,0,0,0);
  
  list.innerHTML = todosData.map(t => {
    let dateStr = "";
    if (t.due_date) {
      const parts = t.due_date.split("-");
      const dDate = new Date(parts[0], parts[1] - 1, parts[2]);
      
      const diffTime = dDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let color = "var(--gray-400)";
      if (!t.is_completed) {
        if (diffDays < 0) color = "var(--red)";
        else if (diffDays === 0) color = "var(--yellow)";
        else if (diffDays <= 2) color = "var(--maroon)";
      }
      
      dateStr = `<span style="font-size: 0.75rem; color: ${color}; font-weight: 700; margin-left: 10px; white-space: nowrap;">📅 ${t.due_date}</span>`;
    }
    
    let subjStr = t.subject_code ? `<span class="badge" style="font-size: 0.65rem; padding: 2px 6px; margin-left: 8px;">${t.subject_code}</span>` : "";
    
    return `
    <li class="todo-item ${t.is_completed ? 'completed' : ''}">
      <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
        <input type="checkbox" style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--maroon);" 
               ${t.is_completed ? 'checked' : ''} onchange="toggleTodo(${t.id})">
        <span class="todo-text" style="font-weight: 500; font-size: 0.95rem;">
          ${t.task_name} ${subjStr} ${dateStr}
        </span>
      </div>
      <button class="btn btn-ghost btn-sm" style="color: var(--red); font-size: 1.1rem; padding: 0 8px; border: none; background: transparent;" onclick="deleteTodo(${t.id})" title="Delete Task">🗑️</button>
    </li>
  `}).join("");
}

async function addTodo() {
  const input = document.getElementById("new-todo-input");
  const subjectInput = document.getElementById("new-todo-subject");
  const dateInput = document.getElementById("new-todo-date");
  
  const task_name = input.value.trim();
  if (!task_name) return;
  
  const payload = {
    task_name,
    subject_code: subjectInput.value || null,
    due_date: dateInput.value || null
  };
  
  try {
    const res = await fetch(`${API}/student/${user.id}/todos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      input.value = "";
      dateInput.value = "";
      subjectInput.value = "";
      await loadTodos();
    }
  } catch {
    toast("Error adding task", "error");
  }
}

async function toggleTodo(id) {
  try {
    const res = await fetch(`${API}/todos/${id}/toggle`, { method: "PUT" });
    if (res.ok) await loadTodos();
  } catch {
    toast("Error updating task", "error");
  }
}

async function deleteTodo(id) {
  if (!confirm("Are you sure you want to delete this task?")) return;
  try {
    const res = await fetch(`${API}/todos/${id}`, { method: "DELETE" });
    if (res.ok) await loadTodos();
  } catch {
    toast("Error deleting task", "error");
  }
}

// ── Badges ────────────────────────────────────────────────────────────────────
function remarksBadge(r) {
  if (!r) return `<span class="badge badge-pending">Pending</span>`;
  if (r === "PASSED")  return `<span class="badge badge-passed">Passed</span>`;
  if (r === "FAILED")  return `<span class="badge badge-failed">Failed</span>`;
  return `<span class="badge badge-pending">${r}</span>`;
}
function attBadge(r) {
  if (!r) return `<span class="badge badge-pending">—</span>`;
  const map = { GOOD: "badge-good", WARNING: "badge-warning", DROPPED: "badge-dropped" };
  return `<span class="badge ${map[r] || 'badge-pending'}">${r}</span>`;
}

// ── Print Grade Slip ─────────────────────────────────────────────────────────
function printGradeSlip() {
  document.getElementById("print-student-name").textContent = `${user.name} — ${user.student_number}`;
  toast("Preparing document...", "info");
  setTimeout(() => {
    window.print();
  }, 500);
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = "") {
  const t   = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.getElementById("toast-container").appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── Logout ────────────────────────────────────────────────────────────────────
function logout() {
  sessionStorage.clear();
  window.location.href = "index.html";
}

// ── Theme Toggle (Dark Mode) ──────────────────────────────────────────────────
function toggleTheme() {
  const body = document.body;
  const themeButton = document.getElementById('theme-toggle');
  
  // Toggle the class on the body
  body.classList.toggle('dark-theme');
  
  // Check if it's currently dark or light
  const isDark = body.classList.contains('dark-theme');
  
  // Save the preference to local storage
  localStorage.setItem('redsentry_theme', isDark ? 'dark' : 'light');
  
  // Swap the icon
  themeButton.textContent = isDark ? '☀️' : '🌙';

  // Re-render chart for color adaptation
  renderPerformanceChart();
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
