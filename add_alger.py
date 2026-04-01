import psycopg2
import psycopg2.extras

DB_PATH = "dbname=memoire_db user=postgres password=maria123 host=localhost"    

alger_units = [
    ('Unité Rouiba (Alger)', 36.7383, 3.2809),
    ('Unité Bab Ezzouar (Alger)', 36.7206, 3.1849),
    ('Unité Zeralda (Alger)', 36.7135, 2.8427),
    ('Unité Bab El Oued (Alger)', 36.7578, 3.0488),
    ('Unité Dar El Beida (Alger)', 36.7133, 3.2125),
    ('Unité Hussein Dey (Alger)', 36.7414, 3.0850)
]

conn = psycopg2.connect(DB_PATH)
cursor = conn.cursor()

cursor.execute("SELECT name FROM units")
existing = cursor.fetchall()
existing_names = set(row[0] for row in existing)

new_units = []
for name, lat, lng in alger_units:
    if name not in existing_names:
        new_units.append((name, lat, lng, 'active'))

if new_units:
    psycopg2.extras.execute_values(
        cursor,
        'INSERT INTO units (name, lat, lng, status) VALUES %s',
        new_units
    )
    
    for name, lat, lng, status in new_units:
        cursor.execute("SELECT id FROM units WHERE name = %s", (name,))
        unit_id = cursor.fetchone()[0]
        equipment = [
            (unit_id, 'C.C.I 6000L', f"CCI-ALG-{unit_id:03d}", 'available'),    
            (unit_id, 'C.C.F. Moyen', f"CCF-ALG-{unit_id:03d}", 'available'),   
            (unit_id, 'Ambulance Sanitaire', f"AMB-ALG-{unit_id:03d}", 'available')
        ]
        psycopg2.extras.execute_values(
            cursor,
            'INSERT INTO equipment (unit_id, type, code, status) VALUES %s',    
            equipment
        )

    conn.commit()
    print(f"Added {len(new_units)} new Algiers units.")
else:
    print("Algiers units already exist.")

conn.close()
