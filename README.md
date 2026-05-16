# CpEE401_Finals
Finals project in CpEE401: Introduction to Cloud Computing by Group 3

# 🔴 RedSentry — Spartan Progress Academic Tracker
**Batangas State University | CpEE 401 Finals Project**

RedSentry is a comprehensive, responsive academic tracking system designed to streamline grading and attendance for instructors, while empowering students to track their progress, simulate their final grades, and manage their tasks.

---

## 📁 Project Structure

```text
CpEE401_Finals/
│
├── backend/
│   ├── app.py            ← Flask server (all API routes & email logic)
│   ├── database.py       ← SQLite setup + seed data
│   └── requirements.txt  ← Python packages
│
└── frontend/
    ├── index.html                  ← Login page (Student + Instructor portals)
    ├── student_dashboard.html      ← Student: grades, attendance, to-do list
    ├── instructor_dashboard.html   ← Instructor: manage students' grades & attendance
    │
    ├── css/
    │   └── style.css               ← Global styles, dark mode, print rules
    │
    └── js/
        ├── login.js                ← Login & authentication logic
        ├── student.js              ← Student UI dynamics & API fetching
        └── instructor.js           ← Instructor bulk actions & management logic
```

---

## 🚀 Step-by-Step Setup

### STEP 1 — Install Python
Download Python 3.10+ from https://python.org  
During install: ✅ check "Add Python to PATH"

---

### STEP 2 — Install Flask packages

Open **Command Prompt** or **Terminal**, go to the `backend` folder:

```bash
cd path/to/CpEE401_Finals/backend
pip install -r requirements.txt
```

---

### STEP 3 — Run the backend server

Still inside the `backend` folder:

```bash
python database.py  # Initializes the database with seed data
python app.py       # Starts the Flask server
```

You should see:
```text
✅ RedSentry database initialized.
 * Running on http://127.0.0.1:5000
```

✅ Leave this terminal open while using the app.

---

### STEP 4 — Open the frontend

Open the `frontend` folder, then **double-click `index.html`** to open it in your browser.

> ⚠️ The frontend must be opened as a file (or via Live Server in VS Code).  
> The backend must be running on port 5000 for the UI to fetch data.

---

## 🔐 Login Credentials (Sample Data)

### Student Portal
| SR-Code    | Password | Name           |
|------------|----------|----------------|
| 24-02471   | pass001  | Juan dela Cruz |
| 24-02472   | pass002  | Ana Reyes      |
| 24-02473   | pass003  | Carlos Santos  |

> Student number = SR-Code (e.g. `24-02471`)  
> Each student has their own private password — only they can see their own data.

### Instructor Portal
| Instructor ID | Password      | Name                |
|---------------|---------------|---------------------|
| INST-001      | atienza123    | Engr. Kurt Atienza  |
| INST-002      | santos456     | Engr. Maria Santos  |

---

## ✅ Features

### 🎓 Student Dashboard
- **Dark Mode Support**: Seamless toggle between light and dark themes.
- **Analytics Overview**: Charts and stats summarizing average grades, passed subjects, and attendance rates.
- **"What-If" Grade Sandbox**: An interactive modal allowing students to plug in theoretical scores for future exams to see how it affects their final grade.
- **Print Grade Slip**: A dedicated, clean, printer-friendly layout for exporting official grade slips, featuring the BSU logo and student information.
- **Smart To-Do List**: A built-in task manager where students can assign subjects to tasks, set due dates, and check them off. Tasks are automatically sorted from most urgent to least urgent, with color-coded date tags.
- **Private Comments**: Ability to view private feedback left directly by instructors on specific grade computations.

### 👨‍🏫 Instructor Dashboard
- **Dark Mode Support**: Consistent dark-theme implementation across data tables and modals.
- **Bulk Grade Saving**: A highly optimized bulk-save feature that commits all grades for a section in a single, atomic database transaction.
- **Numerical Scale Mapping**: Automated real-time calculation of equivalent textual/letter grades based on BSU's scale (1.00 – 5.00).
- **Fast Attendance Tracking**: A bulk "+1 Class" feature that instantly increments the total class count and attended class count for all students in the view.
- **Automated Email Notifications**: Asynchronous, background email alerts sent to students when they hit critical absence thresholds (Warning or Dropped status), or when grades are officially submitted.
- **Announcements**: Broadcast urgent alerts directly to the dashboards of all students in a section.
- **Audit Trails**: Backend tracking of grade modifications to maintain academic integrity.

---

## 📐 Grading & Academic Policies

### Grade Formula
| Component   | Weight |
|-------------|--------|
| Prelim      | 20%    |
| Midterm     | 20%    |
| Semi-Final  | 20%    |
| Final Exam  | 40%    |
| **Total**   | 100%   |

### Attendance Status
| Absences | Status  | Action Triggered |
|----------|---------|------------------|
| 0 – 3    | GOOD    | None |
| 4 – 5    | WARNING | Warning Email Sent to Student |
| 6+       | DROPPED | Critical Alert Email Sent to Student |

---

## 🛠️ Tech Stack

| Layer    | Technology              |
|----------|-------------------------|
| Backend  | Python + Flask + SQLite |
| Frontend | HTML + CSS + Vanilla JS |
| Graphics | Chart.js (Data viz)     |
| Database | SQLite (`grades.db`)    |

---

## 💡 Tips
- To add more students or subjects: edit `database.py` → run `python database.py` to reset the database with the new seed data → restart `python app.py`.
- `grades.db` is auto-created in the `backend/` folder when `database.py` is run.
- Email functionality requires valid SMTP credentials configured inside `backend/app.py` for actual delivery. By default, it runs asynchronously to prevent UI freezing.
