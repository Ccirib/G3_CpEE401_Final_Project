/* ═══════════════════════════════════════════════
   RedSentry — login.js
   Handles student + instructor login
   ═══════════════════════════════════════════════ */

const API = "http://127.0.0.1:5000/api";

// Allow Enter key on both portals
document.getElementById("student-pass")
  .addEventListener("keydown", e => e.key === "Enter" && handleStudentLogin());
document.getElementById("instructor-pass")
  .addEventListener("keydown", e => e.key === "Enter" && handleInstructorLogin());

// ── Helpers ──────────────────────────────────────────────────────────────────
function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.textContent = loading ? "Verifying…" : btn.dataset.label;
}
function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add("show");
}
function clearError(id) {
  const el = document.getElementById(id);
  el.textContent = "";
  el.classList.remove("show");
}

// Store label on load
window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("student-login-btn").dataset.label   = "View Academic Progress";
  document.getElementById("instructor-login-btn").dataset.label = "Access Database";
});

// ── Student Login ─────────────────────────────────────────────────────────────
async function handleStudentLogin() {
  clearError("student-error");
  const srCode   = document.getElementById("student-id").value.trim();
  const password = document.getElementById("student-pass").value;
  const btn      = document.getElementById("student-login-btn");

  if (!srCode || !password) {
    showError("student-error", "Please enter your SR-Code and password.");
    return;
  }

  setLoading(btn, true);
  try {
    const res  = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "student", user_id: srCode, password })
    });
    const data = await res.json();

    if (data.success) {
      sessionStorage.setItem("user", JSON.stringify(data));
      window.location.href = "student_dashboard.html";
    } else {
      showError("student-error", data.message || "Invalid SR-Code or password.");
    }
  } catch (err) {
    showError("student-error", "Cannot connect to server. Make sure the backend is running.");
  } finally {
    setLoading(btn, false);
  }
}

// ── Instructor Login ──────────────────────────────────────────────────────────
async function handleInstructorLogin() {
  clearError("instructor-error");
  const instId   = document.getElementById("instructor-id").value.trim();
  const password = document.getElementById("instructor-pass").value;
  const btn      = document.getElementById("instructor-login-btn");

  if (!instId || !password) {
    showError("instructor-error", "Please enter your Instructor ID and authentication key.");
    return;
  }

  setLoading(btn, true);
  try {
    const res  = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "instructor", user_id: instId, password })
    });
    const data = await res.json();

    if (data.success) {
      sessionStorage.setItem("user", JSON.stringify(data));
      window.location.href = "instructor_dashboard.html";
    } else {
      showError("instructor-error", data.message || "Invalid Instructor ID or key.");
    }
  } catch (err) {
    showError("instructor-error", "Cannot connect to server. Make sure the backend is running.");
  } finally {
    setLoading(btn, false);
  }
}
