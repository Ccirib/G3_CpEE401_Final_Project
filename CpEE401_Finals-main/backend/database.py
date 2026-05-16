import psycopg2
from psycopg2.extras import RealDictCursor
import os
import random

# ── Database Connection Configuration ──
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_NAME = os.environ.get("DB_NAME", "redsentry_db")
DB_USER = os.environ.get("DB_USER", "postgres")
DB_PASS = os.environ.get("DB_PASS", "admin123") # Update to your local Postgres password

def get_db():
    conn = psycopg2.connect(
        host=DB_HOST,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASS
    )
    return conn

def init_db():
    conn = get_db()
    # Use RealDictCursor so fetched rows act like dictionaries (matches sqlite3.Row)
    cursor = conn.cursor(cursor_factory=RealDictCursor) 
    
    # Drop existing tables safely using CASCADE for PostgreSQL
    tables = [
        "todos", "grade_audit_trail", "announcements", "attendance", 
        "grades", "enrollments", "sections", "subjects", 
        "instructors", "students"
    ]
    for table in tables:
        cursor.execute(f"DROP TABLE IF EXISTS {table} CASCADE;")

    # ── Create Tables (PostgreSQL Dialect) ──
    cursor.execute("""
        CREATE TABLE students (
            id             SERIAL PRIMARY KEY,
            student_number TEXT    UNIQUE NOT NULL,
            full_name      TEXT    NOT NULL,
            email          TEXT    NOT NULL,
            password       TEXT    NOT NULL,
            course         TEXT    NOT NULL,
            year_level     TEXT    NOT NULL,
            section        TEXT    NOT NULL
        );
        CREATE TABLE instructors (
            id            SERIAL PRIMARY KEY,
            instructor_id TEXT    UNIQUE NOT NULL,
            full_name     TEXT    NOT NULL,
            password      TEXT    NOT NULL,
            department    TEXT    NOT NULL
        );
        CREATE TABLE subjects (
            id           SERIAL PRIMARY KEY,
            subject_code TEXT    UNIQUE NOT NULL,
            subject_name TEXT    NOT NULL,
            units        INTEGER NOT NULL
        );
        CREATE TABLE sections (
            id            SERIAL PRIMARY KEY,
            section_name  TEXT    NOT NULL,
            subject_id    INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
            instructor_id INTEGER NOT NULL REFERENCES instructors(id) ON DELETE CASCADE
        );
        CREATE TABLE enrollments (
            id         SERIAL PRIMARY KEY,
            student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
            section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE
        );
        CREATE TABLE grades (
            id              SERIAL PRIMARY KEY,
            student_id      INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            subject_id      INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
            prelim          REAL,
            midterm         REAL,
            semi_final      REAL,
            final_exam      REAL,
            final_grade     REAL,
            remarks         TEXT,
            private_comment TEXT
        );
        CREATE TABLE attendance (
            id               SERIAL PRIMARY KEY,
            student_id       INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            subject_id       INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
            total_classes    INTEGER DEFAULT 0,
            classes_attended INTEGER DEFAULT 0,
            absences         INTEGER DEFAULT 0,
            remarks          TEXT    DEFAULT 'GOOD'
        );
        CREATE TABLE announcements (
            id            SERIAL PRIMARY KEY,
            instructor_id INTEGER NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
            content       TEXT    NOT NULL,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE grade_audit_trail (
            id            SERIAL PRIMARY KEY,
            grade_id      INTEGER NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
            column_name   TEXT    NOT NULL,
            old_value     REAL,
            new_value     REAL,
            changed_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            instructor_id INTEGER REFERENCES instructors(id) ON DELETE SET NULL
        );
        CREATE TABLE todos (
            id           SERIAL PRIMARY KEY,
            student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            task_name    TEXT NOT NULL,
            subject_code TEXT,
            due_date     TEXT,
            is_completed BOOLEAN DEFAULT FALSE,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # ── Instructors ──
    cursor.execute("INSERT INTO instructors(instructor_id,full_name,password,department) VALUES(%s,%s,%s,%s);",
                   ("INST-001","Engr. Kurt Atienza","atienza123","Computer Engineering"))
    cursor.execute("INSERT INTO instructors(instructor_id,full_name,password,department) VALUES(%s,%s,%s,%s);",
                   ("INST-002","Engr. Teopilo Luistro","luistro123","Computer Engineering"))

    # ── Subjects ──
    subjects = [
        ("CpE 411", "Data Structures and Algorithms", 2),
        ("CpE 414", "Feedback and Control Systems", 3),
        ("CpE 413", "Fundamentals of Mixed Signals and Sensors", 3),
        ("CpE 415", "Introduction to HDL", 1),
        ("CpE 412", "Introduction to Networks, Data and Digital Communications (Cisco 1)", 3),
        ("CpE 410", "Logic Circuits and Design", 4),
        ("ENGG 416", "Research Methods", 3),
        ("Fili 102", "Filipino sa Iba't-ibang Disiplina", 3),
    ]
    for s in subjects:
        cursor.execute("INSERT INTO subjects(subject_code,subject_name,units) VALUES(%s,%s,%s);", s)

    # ── Sections ──
    sections = []
    sec_names = ["CpE 3101", "CpE 3102", "CpE 3103", "CpE 3104"]
    for sec_name in sec_names:
        sections.extend([
            (sec_name, 1, 1), # CpE 411 -> Engr. Atienza
            (sec_name, 2, 2), # CpE 414 -> Engr. Luistro
            (sec_name, 3, 1), # CpE 413 -> Engr. Atienza
            (sec_name, 4, 1), # CpE 415 -> Engr. Atienza
            (sec_name, 5, 2), # CpE 412 -> Engr. Luistro
            (sec_name, 6, 2), # CpE 410 -> Engr. Luistro
            (sec_name, 7, 1), # ENGG 416 -> Engr. Atienza
            (sec_name, 8, 2), # Fili 102 -> Engr. Luistro
        ])
    for s in sections:
        cursor.execute("INSERT INTO sections(section_name,subject_id,instructor_id) VALUES(%s,%s,%s);", s)

    # ── Students ──
    students = [
        ("24-03035", "Jethro Emmanuel Linga", "24-03035@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3101"),
        ("24-08707", "John Melvin Bueno", "24-08707@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3101"),
        ("24-04069", "Von Kirby Montalbo", "24-04069@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3101"),
        ("24-08955", "Evangel Yoshiya Aranas", "24-08955@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3101"),
        ("24-07362", "Adrian Manguiat", "24-07362@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3101"),
        ("24-02971", "Lindsay Amerie Barrion", "24-02971@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3101"),
        ("24-07502", "Ken Austine Fajutag", "24-07502@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3101"),
        ("24-07363", "Gherwin Dave Salinas", "24-07363@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3101"),
        ("24-02524", "Joan Malificiar", "24-02524@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3101"),
        ("24-01096", "Janver Manlapaz", "24-01096@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3101"),
        ("24-04461", "Cyrell Maningding", "24-04461@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3101"),
        ("24-02471", "Ricci Beatrice Gube", "24-02471@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3104"),
        ("24-08372", "Adrian Ilagan", "24-08372@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3104"),
        ("24-04574", "Jayve Villanueva", "24-04574@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3104"),
        ("24-00790", "Adrian De Chavez", "24-00790@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3104"),
        ("24-09450", "Cee Jay Niño Catapang", "24-09450@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3104"),
        ("24-00606", "Marc Oliver Magadia", "24-00606@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3104"),
        ("24-02176", "Ryan Ayap", "24-02176@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3104"),
        ("24-05436", "Ralfh Louie Cueto", "24-05436@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3104"),
        ("24-02907", "John Gabriel Ilagan", "24-02907@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3104"),
        ("24-00575", "Crishaun Myel Marquez", "24-00575@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3104"),
        ("24-06176", "Ma. Trixia Padasen", "24-06176@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3104"),
        ("24-04709", "Shindarry Querc Lopez", "24-04709@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3102"),
        ("24-08589", "Mariel Hernandez", "24-08589@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3102"),
        ("24-05116", "Althea Micah Rabanero", "24-05116@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3102"),
        ("24-03349", "Jyzrel Rhane Dela Cerna", "24-03349@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3102"),
        ("24-09892", "John Gerald Mercado", "24-09892@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3102"),
        ("24-06218", "Rumel Marco Banjo Serrano", "24-06218@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3102"),
        ("24-02913", "Reighnard Cromwell Glorioso", "24-02913@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3102"),
        ("24-00933", "Isidro De Torres Jr.", "24-00933@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3102"),
        ("24-01561", "Joshua Garcia", "24-01561@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3102"),
        ("24-04838", "Hkawng Zam Jap", "24-04838@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3102"),
        ("24-06435", "Christian Hernandez", "24-06435@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3103"),
        ("24-02403", "Precious May Ramirez", "24-02403@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3103"),
        ("24-09235", "Genika Jhones Boo", "24-09235@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3103"),
        ("24-08655", "Jonald Vergara", "24-08655@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3103"),
        ("24-03424", "Jhanrey Isala", "24-03424@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3103"),
        ("24-01854", "Vinz Mannu Ramos", "24-01854@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3103"),
        ("24-02237", "Bhong Kenric Wagan", "24-02237@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3103"),
        ("24-01353", "Ken Jethro Racelis", "24-01353@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3103"),
        ("24-00747", "Tristan Jerge Magpantay", "24-00747@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3103"),
        ("24-09259", "Kate Allyson Sigue", "24-09259@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3103"),
        ("24-05123", "Norlaineca Mae Lim", "24-05123@g.batstate-u.edu.ph", "12345", "BS CpE", "3rd Year", "CpE 3103")
    ]
    for s in students:
        cursor.execute("INSERT INTO students(student_number,full_name,email,password,course,year_level,section) VALUES(%s,%s,%s,%s,%s,%s,%s);", s)

    # ── Enrollments ──
    cursor.execute("SELECT id, section_name, subject_id FROM sections;")
    sec_rows = cursor.fetchall()
    
    for sid in range(1, len(students) + 1):
        student_section = students[sid-1][6]
        # Match using the RealDictCursor dictionary keys
        my_sections = [r for r in sec_rows if r["section_name"] == student_section]
        for sec in my_sections:
            cursor.execute("INSERT INTO enrollments(student_id,subject_id,section_id) VALUES(%s,%s,%s);",
                           (sid, sec["subject_id"], sec["id"]))

    # ── Realistic Grades (Awaiting Final Exam)
    conn.commit()
    cursor.close()
    conn.close()
    print("✅ RedSentry database initialized under PostgreSQL.")

# --- MAKE SURE THIS BLOCK IS AT THE VERY BOTTOM ---
if __name__ == "__main__":
    print("🚀 Starting database script...")
    try:
        init_db()
    except Exception as e:
        print(f"❌ ERROR: {e}")
