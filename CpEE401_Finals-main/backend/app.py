import smtplib
from email.message import EmailMessage
import threading
# pyrefly: ignore [missing-import]
from flask import Flask, request, jsonify
from flask_cors import CORS
from psycopg2.extras import RealDictCursor
from database import init_db, get_db

app = Flask(__name__)
app.secret_key = "redsentry_bsu_2024"
CORS(app, supports_credentials=True)

init_db()

# ─── BSU GRADING SYSTEM ──────────────────────────────────────────────────────
def get_bsu_remarks(grade):
    """Returns the textual remark based on the BSU grading system."""
    if grade is None:
        return None
    g = round(grade)
    if g >= 98: return "Excellent"
    if g >= 94: return "Superior"
    if g >= 90: return "Very Good"
    if g >= 88: return "Good"
    if g >= 85: return "Meritorious"
    if g >= 83: return "Very Satisfactory"
    if g >= 80: return "Satisfactory"
    if g >= 78: return "Fairly Satisfactory"
    if g >= 75: return "Passing"
    if g >= 70: return "Remedial"
    return "Failure"

# ─── EMAIL SYSTEM ────────────────────────────────────────────────────────────
SENDER_EMAIL = "your_email@gmail.com"  # Replace with your Gmail
APP_PASSWORD = "your 16 character app password" # Replace with your App Password

def send_async_email(to_email, subject, body):
    def send():
        try:
            msg = EmailMessage()
            msg.set_content(body)
            msg["Subject"] = subject
            msg["From"] = f"RedSentry Alerts <{SENDER_EMAIL}>"
            msg["To"] = to_email

            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                server.login(SENDER_EMAIL, APP_PASSWORD)
                server.send_message(msg)
            print(f"📧 Alert sent successfully to {to_email}!")
        except Exception as e:
            print(f"❌ Failed to send email to {to_email}: {e}")
            
    # Run the email sending in the background
    threading.Thread(target=send).start()

# ─── AUTH ────────────────────────────────────────────────────────────────────

@app.route("/api/login", methods=["POST"])
def login():
    data     = request.get_json()
    role     = data.get("role")      # "student" or "instructor"
    user_id  = data.get("user_id")   # SR-Code  OR  instructor_id
    password = data.get("password")
    
    conn = get_db()
    try:
        db = conn.cursor(cursor_factory=RealDictCursor)
        if role == "student":
            db.execute(
                "SELECT * FROM students WHERE student_number=%s AND password=%s",
                (user_id, password)
            )
            row = db.fetchone()
            if row:
                return jsonify({
                    "success": True, "role": "student",
                    "id": row["id"], "name": row["full_name"],
                    "student_number": row["student_number"],
                    "course": row["course"],
                    "year_level": row["year_level"],
                    "section": row["section"]
                })

        elif role == "instructor":
            db.execute(
                "SELECT * FROM instructors WHERE instructor_id=%s AND password=%s",
                (user_id, password)
            )
            row = db.fetchone()
            if row:
                return jsonify({
                    "success": True, "role": "instructor",
                    "id": row["id"], "name": row["full_name"],
                    "instructor_id": row["instructor_id"],
                    "department": row["department"]
                })

        return jsonify({"success": False, "message": "Invalid credentials. Please try again."}), 401
    finally:
        conn.close()

@app.route("/api/subjects", methods=["GET"])
def get_all_subjects():
    conn = get_db()
    try:
        db = conn.cursor(cursor_factory=RealDictCursor)
        db.execute("SELECT subject_code, subject_name, units FROM subjects ORDER BY subject_code")
        rows = db.fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

# ─── STUDENT ─────────────────────────────────────────────────────────────────

@app.route("/api/student/<int:sid>/subjects")
def student_subjects(sid):
    conn = get_db()
    try:
        db = conn.cursor(cursor_factory=RealDictCursor)
        db.execute("""
            SELECT s.id AS subject_id, s.subject_code, s.subject_name, s.units,
                   g.prelim, g.midterm, g.semi_final, g.final_exam,
                   g.final_grade, g.remarks,
                   sec.section_name, i.full_name AS instructor_name
            FROM   enrollments e
            JOIN   subjects    s   ON s.id   = e.subject_id
            JOIN   sections    sec ON sec.id = e.section_id
            JOIN   instructors i   ON i.id   = sec.instructor_id
            LEFT JOIN grades   g   ON g.student_id = e.student_id
                                   AND g.subject_id = e.subject_id
            WHERE  e.student_id = %s
            ORDER  BY s.subject_code
        """, (sid,))
        rows = db.fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

@app.route("/api/student/<int:sid>/attendance")
def student_attendance(sid):
    conn = get_db()
    try:
        db = conn.cursor(cursor_factory=RealDictCursor)
        db.execute("""
            SELECT s.subject_code, s.subject_name,
                   a.total_classes, a.classes_attended, a.absences, a.remarks
            FROM   attendance a
            JOIN   subjects   s ON s.id = a.subject_id
            WHERE  a.student_id = %s
            ORDER  BY s.subject_code
        """, (sid,))
        rows = db.fetchall()
        result = []
        for r in rows:
            pct = round(r["classes_attended"] / r["total_classes"] * 100, 1) if r["total_classes"] else 0
            d   = dict(r)
            d["percentage"] = pct
            result.append(d)
        return jsonify(result)
    finally:
        conn.close()

@app.route("/api/student/<int:sid>/grade-computation/<int:subj_id>")
def grade_computation(sid, subj_id):
    conn = get_db()
    try:
        db = conn.cursor(cursor_factory=RealDictCursor)
        db.execute(
            "SELECT * FROM grades WHERE student_id=%s AND subject_id=%s", (sid, subj_id)
        )
        g = db.fetchone()
        if not g:
            return jsonify({"message": "No grade data yet"}), 404
        return jsonify({
            "prelim":              g["prelim"],
            "prelim_weighted":     round((g["prelim"]      or 0) * 0.20, 2),
            "midterm":             g["midterm"],
            "midterm_weighted":    round((g["midterm"]     or 0) * 0.20, 2),
            "semi_final":          g["semi_final"],
            "semi_final_weighted": round((g["semi_final"]  or 0) * 0.20, 2),
            "final_exam":          g["final_exam"],
            "final_exam_weighted": round((g["final_exam"]  or 0) * 0.40, 2),
            "final_grade":         g["final_grade"],
            "remarks":             g["remarks"]
        })
    finally:
        conn.close()

# ─── STUDENT TODOS ───────────────────────────────────────────────────────────

@app.route("/api/student/<int:sid>/todos", methods=["GET", "POST"])
def student_todos(sid):
    conn = get_db()
    try:
        db = conn.cursor(cursor_factory=RealDictCursor)
        if request.method == "POST":
            data = request.get_json()
            task_name = data.get("task_name")
            subject_code = data.get("subject_code")
            due_date = data.get("due_date")
            if task_name:
                db.execute(
                    "INSERT INTO todos (student_id, task_name, subject_code, due_date) VALUES (%s, %s, %s, %s) RETURNING id", 
                    (sid, task_name, subject_code, due_date)
                )
                todo_id = db.fetchone()["id"]
                conn.commit()
                return jsonify({"success": True, "id": todo_id})
            return jsonify({"success": False}), 400
            
        db.execute("""
            SELECT * FROM todos 
            WHERE student_id=%s 
            ORDER BY 
                is_completed ASC, 
                CASE WHEN due_date IS NULL OR due_date = '' THEN 1 ELSE 0 END ASC, 
                due_date ASC, 
                created_at DESC
        """, (sid,))
        rows = db.fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

@app.route("/api/todos/<int:tid>/toggle", methods=["PUT"])
def toggle_todo(tid):
    conn = get_db()
    try:
        db = conn.cursor(cursor_factory=RealDictCursor)
        db.execute("SELECT is_completed FROM todos WHERE id=%s", (tid,))
        todo = db.fetchone()
        if todo:
            new_state = False if todo["is_completed"] else True
            db.execute("UPDATE todos SET is_completed=%s WHERE id=%s", (new_state, tid))
            conn.commit()
            return jsonify({"success": True, "is_completed": new_state})
        return jsonify({"success": False}), 404
    finally:
        conn.close()

@app.route("/api/todos/<int:tid>", methods=["DELETE"])
def delete_todo(tid):
    conn = get_db()
    try:
        db = conn.cursor(cursor_factory=RealDictCursor)
        db.execute("DELETE FROM todos WHERE id=%s", (tid,))
        conn.commit()
        return jsonify({"success": True})
    finally:
        conn.close()

# ─── INSTRUCTOR ──────────────────────────────────────────────────────────────

@app.route("/api/instructor/<int:iid>/sections")
def instructor_sections(iid):
    conn = get_db()
    try:
        db = conn.cursor(cursor_factory=RealDictCursor)
        db.execute("""
            SELECT sec.id AS section_id, sec.section_name,
                   s.id AS subject_id, s.subject_code, s.subject_name, s.units,
                   COUNT(e.student_id) AS student_count
            FROM   sections sec
            JOIN   subjects  s ON s.id = sec.subject_id
            LEFT JOIN enrollments e ON e.section_id = sec.id
            WHERE  sec.instructor_id = %s
            GROUP  BY sec.id, s.id
            ORDER  BY s.subject_code
        """, (iid,))
        rows = db.fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

@app.route("/api/instructor/<int:iid>/at-risk")
def at_risk_students(iid):
    conn = get_db()
    try:
        db = conn.cursor(cursor_factory=RealDictCursor)
        db.execute("""
            SELECT st.id AS student_id, st.student_number, st.full_name, st.email,
                   sec.id AS section_id, sec.section_name, s.subject_code, s.subject_name,
                   g.final_grade, a.absences, a.remarks AS att_remarks
            FROM   sections sec
            JOIN   subjects s   ON s.id = sec.subject_id
            JOIN   enrollments e ON e.section_id = sec.id
            JOIN   students st  ON st.id = e.student_id
            LEFT JOIN grades g   ON g.student_id = st.id AND g.subject_id = sec.subject_id
            LEFT JOIN attendance a ON a.student_id = st.id AND a.subject_id = sec.subject_id
            WHERE  sec.instructor_id = %s
            AND    (g.final_grade < 75 OR a.absences >= 5)
            ORDER  BY a.absences DESC, g.final_grade ASC
        """, (iid,))
        rows = db.fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

@app.route("/api/instructor/<int:iid>/class-stats")
def class_stats(iid):
    conn = get_db()
    try:
        db = conn.cursor(cursor_factory=RealDictCursor)
        db.execute("""
            SELECT sec.id AS section_id, sec.section_name, s.subject_code,
                   AVG(g.final_grade) as avg_grade
            FROM   sections sec
            JOIN   subjects s ON s.id = sec.subject_id
            JOIN   enrollments e ON e.section_id = sec.id
            LEFT JOIN grades g ON g.student_id = e.student_id AND g.subject_id = s.id
            WHERE  sec.instructor_id = %s
            GROUP  BY sec.id, s.subject_code
        """, (iid,))
        rows = db.fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

@app.route("/api/instructor/section/<int:sec_id>/grade-dist")
def grade_dist(sec_id):
    conn = get_db()
    try:
        db = conn.cursor(cursor_factory=RealDictCursor)
        db.execute("""
            SELECT 
                SUM(CASE WHEN final_grade >= 90 THEN 1 ELSE 0 END) as count_a,
                SUM(CASE WHEN final_grade >= 80 AND final_grade < 90 THEN 1 ELSE 0 END) as count_b,
                SUM(CASE WHEN final_grade >= 75 AND final_grade < 80 THEN 1 ELSE 0 END) as count_c,
                SUM(CASE WHEN final_grade < 75 THEN 1 ELSE 0 END) as count_f
            FROM   grades g
            JOIN   sections sec ON sec.subject_id = g.subject_id
            JOIN   enrollments e ON e.section_id = sec.id AND e.student_id = g.student_id
            WHERE  sec.id = %s
        """, (sec_id,))
        rows = db.fetchone()
        return jsonify(dict(rows))
    finally:
        conn.close()

@app.route("/api/announcements", methods=["GET", "POST"])
def manage_announcements():
    conn = get_db()
    try:
        db = conn.cursor(cursor_factory=RealDictCursor)
        if request.method == "POST":
            data = request.get_json()
            db.execute("INSERT INTO announcements (instructor_id, content) VALUES (%s, %s)",
                       (data["instructor_id"], data["content"]))
            conn.commit()
            return jsonify({"success": True})
        
        db.execute("""
            SELECT a.*, i.full_name as instructor_name 
            FROM announcements a
            JOIN instructors i ON i.id = a.instructor_id
            ORDER BY created_at DESC LIMIT 5
        """)
        rows = db.fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

@app.route("/api/announcements/<int:ann_id>", methods=["DELETE"])
def delete_announcement(ann_id):
    conn = get_db()
    try:
        db = conn.cursor(cursor_factory=RealDictCursor)
        db.execute("DELETE FROM announcements WHERE id = %s", (ann_id,))
        conn.commit()
        return jsonify({"success": True})
    finally:
        conn.close()

@app.route("/api/instructor/section/<int:sec_id>/students")
def section_students(sec_id):
    conn = get_db()
    try:
        db = conn.cursor(cursor_factory=RealDictCursor)
        db.execute("SELECT subject_id FROM sections WHERE id=%s", (sec_id,))
        sec = db.fetchone()
        if not sec:
            return jsonify([])
        db.execute("""
            SELECT st.id AS student_id, st.student_number, st.full_name,
                   g.prelim, g.midterm, g.semi_final, g.final_exam,
                   g.final_grade, g.remarks, g.private_comment,
                   a.total_classes, a.classes_attended, a.absences,
                   a.remarks AS att_remarks
            FROM   enrollments e
            JOIN   students st ON st.id = e.student_id
            LEFT JOIN grades     g ON g.student_id = st.id AND g.subject_id = e.subject_id
            LEFT JOIN attendance a ON a.student_id = st.id AND a.subject_id = e.subject_id
            WHERE  e.section_id = %s
            ORDER  BY st.full_name
        """, (sec_id,))
        rows = db.fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()

@app.route("/api/instructor/grade", methods=["POST"])
def save_grade():
    d = request.get_json()
    sid, subj = d["student_id"], d["subject_id"]
    p, m, sf, fe = d.get("prelim"), d.get("midterm"), d.get("semi_final"), d.get("final_exam")
    comment = d.get("private_comment")
    fg = remarks = None
    if all(v is not None for v in [p, m, sf, fe]):
        fg = round(p*0.20 + m*0.20 + sf*0.20 + fe*0.40, 2)
        remarks = get_bsu_remarks(fg)
    instructor_id = d.get("instructor_id")
    
    conn = get_db()
    try:
        db = conn.cursor(cursor_factory=RealDictCursor)
        db.execute("SELECT * FROM grades WHERE student_id=%s AND subject_id=%s", (sid, subj))
        existing = db.fetchone()
        
        if existing:
            grade_id = existing["id"]
            fields = {
                "prelim": p, "midterm": m, "semi_final": sf,
                "final_exam": fe, "final_grade": fg, "remarks": remarks,
                "private_comment": comment
            }
            
            for col, new_val in fields.items():
                old_val = existing[col]
                if old_val != new_val:
                    db.execute(
                        "INSERT INTO grade_audit_trail (grade_id, column_name, old_value, new_value, instructor_id) VALUES (%s, %s, %s, %s, %s)",
                        (grade_id, col, str(old_val), str(new_val), instructor_id)
                    )

            db.execute(
                "UPDATE grades SET prelim=%s,midterm=%s,semi_final=%s,final_exam=%s,final_grade=%s,remarks=%s,private_comment=%s WHERE id=%s",
                (p, m, sf, fe, fg, remarks, comment, grade_id)
            )
        else:
            db.execute(
                "INSERT INTO grades(student_id,subject_id,prelim,midterm,semi_final,final_exam,final_grade,remarks,private_comment) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                (sid, subj, p, m, sf, fe, fg, remarks, comment)
            )
            grade_id = db.fetchone()["id"]
            db.execute(
                "INSERT INTO grade_audit_trail (grade_id, column_name, old_value, new_value, instructor_id) VALUES (%s, %s, %s, %s, %s)",
                (grade_id, "INITIAL_ENTRY", None, fg, instructor_id)
            )
        conn.commit()

        db.execute("SELECT full_name, email FROM students WHERE id=%s", (sid,))
        student = db.fetchone()
        db.execute("SELECT subject_code FROM subjects WHERE id=%s", (subj,))
        subject_info = db.fetchone()
        
        if student and subject_info and fg is not None:
            subject = f"RedSentry: New Grade Posted for {subject_info['subject_code']}"
            body = f"Hello {student['full_name']},\n\nA new grade has been posted for {subject_info['subject_code']}.\n\nYour Final Grade is currently calculated at: {fg} ({remarks}).\n\nPlease log in to RedSentry to view your full computation breakdown.\n\n- The Spartan Progress Tracker"
            send_async_email(student["email"], subject, body)
            
        return jsonify({"success": True, "final_grade": fg, "remarks": remarks})
    finally:
        conn.close()

@app.route("/api/instructor/grades/bulk", methods=["POST"])
def save_grades_bulk():
    data = request.get_json()
    grades = data.get("grades", [])
    if not grades:
        return jsonify({"success": False, "message": "No grades provided"}), 400
        
    conn = get_db()
    try:
        db = conn.cursor(cursor_factory=RealDictCursor)
        for d in grades:
            sid, subj = d["student_id"], d["subject_id"]
            p, m, sf, fe = d.get("prelim"), d.get("midterm"), d.get("semi_final"), d.get("final_exam")
            comment = d.get("private_comment")
            fg = remarks = None
            if all(v is not None for v in [p, m, sf, fe]):
                fg = round(p*0.20 + m*0.20 + sf*0.20 + fe*0.40, 2)
                remarks = get_bsu_remarks(fg)
                
            instructor_id = d.get("instructor_id")
            db.execute("SELECT * FROM grades WHERE student_id=%s AND subject_id=%s", (sid, subj))
            existing = db.fetchone()
            
            if existing:
                grade_id = existing["id"]
                fields = {
                    "prelim": p, "midterm": m, "semi_final": sf,
                    "final_exam": fe, "final_grade": fg, "remarks": remarks,
                    "private_comment": comment
                }
                
                for col, new_val in fields.items():
                    old_val = existing[col]
                    if old_val != new_val:
                        db.execute(
                            "INSERT INTO grade_audit_trail (grade_id, column_name, old_value, new_value, instructor_id) VALUES (%s, %s, %s, %s, %s)",
                            (grade_id, col, str(old_val), str(new_val), instructor_id)
                        )

                db.execute(
                    "UPDATE grades SET prelim=%s,midterm=%s,semi_final=%s,final_exam=%s,final_grade=%s,remarks=%s,private_comment=%s WHERE id=%s",
                    (p, m, sf, fe, fg, remarks, comment, grade_id)
                )
            else:
                db.execute(
                    "INSERT INTO grades(student_id,subject_id,prelim,midterm,semi_final,final_exam,final_grade,remarks,private_comment) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                    (sid, subj, p, m, sf, fe, fg, remarks, comment)
                )
                grade_id = db.fetchone()["id"]
                db.execute(
                    "INSERT INTO grade_audit_trail (grade_id, column_name, old_value, new_value, instructor_id) VALUES (%s, %s, %s, %s, %s)",
                    (grade_id, "INITIAL_ENTRY", None, fg, instructor_id)
                )
                
            db.execute("SELECT full_name, email FROM students WHERE id=%s", (sid,))
            student = db.fetchone()
            db.execute("SELECT subject_code FROM subjects WHERE id=%s", (subj,))
            subject_info = db.fetchone()
            
            if student and subject_info and fg is not None:
                subject = f"RedSentry: New Grade Posted for {subject_info['subject_code']}"
                body = f"Hello {student['full_name']},\n\nA new grade has been posted for {subject_info['subject_code']}.\n\nYour Final Grade is currently calculated at: {fg} ({remarks}).\n\nPlease log in to RedSentry to view your full computation breakdown.\n\n- The Spartan Progress Tracker"
                send_async_email(student["email"], subject, body)

        conn.commit()
        return jsonify({"success": True, "message": "Bulk grades saved"})
    finally:
        conn.close()

@app.route("/api/instructor/attendance", methods=["POST"])
def save_attendance():
    d = request.get_json()
    sid, subj = d["student_id"], d["subject_id"]
    total, attended = d.get("total_classes", 0), d.get("classes_attended", 0)
    absences = total - attended
    remarks = "GOOD" if absences <= 3 else "WARNING" if absences <= 6 else "DROPPED"
    
    conn = get_db()
    try:
        db = conn.cursor(cursor_factory=RealDictCursor)
        db.execute("SELECT id FROM attendance WHERE student_id=%s AND subject_id=%s", (sid, subj))
        if db.fetchone():
            db.execute(
                "UPDATE attendance SET total_classes=%s,classes_attended=%s,absences=%s,remarks=%s WHERE student_id=%s AND subject_id=%s",
                (total, attended, absences, remarks, sid, subj)
            )
        else:
            db.execute(
                "INSERT INTO attendance(student_id,subject_id,total_classes,classes_attended,absences,remarks) VALUES(%s,%s,%s,%s,%s,%s)",
                (sid, subj, total, attended, absences, remarks)
            )
        conn.commit()
        
        db.execute("SELECT full_name, email FROM students WHERE id=%s", (sid,))
        student = db.fetchone()
        db.execute("SELECT subject_code FROM subjects WHERE id=%s", (subj,))
        subject_info = db.fetchone()

        if student and subject_info:
            if absences == 5:
                subject = f"⚠️ RedSentry ATTENDANCE WARNING: {subject_info['subject_code']}"
                body = f"Hello {student['full_name']},\n\nYou currently have {absences} absences in {subject_info['subject_code']}. The maximum allowable absences is 6. Please ensure you attend the remaining sessions to avoid being dropped."
                send_async_email(student["email"], subject, body)
            elif absences >= 6:
                subject = f"🚨 RedSentry CRITICAL ALERT: {subject_info['subject_code']}"
                body = f"Hello {student['full_name']},\n\nYou have reached {absences} absences in {subject_info['subject_code']}. Your status is now marked as DROPPED. Please contact your instructor immediately."
                send_async_email(student["email"], subject, body)
                
        return jsonify({"success": True, "absences": absences, "remarks": remarks})
    finally:
        conn.close()

@app.route("/api/instructor/attendance/bulk", methods=["POST"])
def save_attendance_bulk():
    data = request.get_json()
    attendances = data.get("attendances", [])
    if not attendances:
        return jsonify({"success": False, "message": "No attendance data provided"}), 400
        
    conn = get_db()
    try:
        db = conn.cursor(cursor_factory=RealDictCursor)
        for d in attendances:
            sid, subj = d["student_id"], d["subject_id"]
            total, attended = d.get("total_classes", 0), d.get("classes_attended", 0)
            absences = total - attended
            remarks = "GOOD" if absences <= 3 else "WARNING" if absences <= 6 else "DROPPED"
            
            db.execute("SELECT id FROM attendance WHERE student_id=%s AND subject_id=%s", (sid, subj))
            if db.fetchone():
                db.execute(
                    "UPDATE attendance SET total_classes=%s,classes_attended=%s,absences=%s,remarks=%s WHERE student_id=%s AND subject_id=%s",
                    (total, attended, absences, remarks, sid, subj)
                )
            else:
                db.execute(
                    "INSERT INTO attendance(student_id,subject_id,total_classes,classes_attended,absences,remarks) VALUES(%s,%s,%s,%s,%s,%s)",
                    (sid, subj, total, attended, absences, remarks)
                )
                
            db.execute("SELECT full_name, email FROM students WHERE id=%s", (sid,))
            student = db.fetchone()
            db.execute("SELECT subject_code FROM subjects WHERE id=%s", (subj,))
            subject_info = db.fetchone()

            if student and subject_info:
                if absences == 5:
                    subject = f"⚠️ RedSentry ATTENDANCE WARNING: {subject_info['subject_code']}"
                    body = f"Hello {student['full_name']},\n\nYou currently have {absences} absences in {subject_info['subject_code']}. The maximum allowable absences is 6. Please ensure you attend the remaining sessions to avoid being dropped."
                    send_async_email(student["email"], subject, body)
                elif absences >= 6:
                    subject = f"🚨 RedSentry CRITICAL ALERT: {subject_info['subject_code']}"
                    body = f"Hello {student['full_name']},\n\nYou have reached {absences} absences in {subject_info['subject_code']}. Your status is now marked as DROPPED. Please contact your instructor immediately."
                    send_async_email(student["email"], subject, body)
                    
        conn.commit()
        return jsonify({"success": True, "message": "Bulk attendance saved"})
    finally:
        conn.close()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
