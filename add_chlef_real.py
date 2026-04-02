import psycopg2
import psycopg2.extras
import random
import string

DB_PATH = 'dbname=memoire_db user=postgres password=maria123 host=localhost'

chlef_real_units = {
    'Unité Secondaire Abou El Hassen': {'lat': 36.4333, 'lng': 1.1833, 'eq': {'Ambulance Sanitaire': 2, 'C.C.F. Moyen': 1}},
    'Unité Secondaire Ain Merane': {'lat': 36.1667, 'lng': 0.9667, 'eq': {'Ambulance Sanitaire': 1, 'C.C.F. Moyen': 1}},
    'Unité Secondaire Beni Haoua': {'lat': 36.5333, 'lng': 1.5833, 'eq': {'Ambulance Sanitaire': 2, 'C.C.F. Moyen': 1, 'C.C.I 4000L': 1}},
    'Unité Secondaire Boukadir': {'lat': 36.0667, 'lng': 1.1167, 'eq': {'Ambulance Sanitaire': 1, 'C.T.E': 1, 'F.P.T': 1}},
    'Unité Secondaire El Karimia': {'lat': 35.9996, 'lng': 1.5401, 'eq': {'Ambulance Sanitaire': 1, 'C.C.I 4000L': 1}},
    'Unité Secondaire El Marsa': {'lat': 36.4000, 'lng': 0.8833, 'eq': {'Ambulance Sanitaire': 2, 'C.C.F. Moyen': 1, 'C.C.I 6000L': 1}},
    'Unité Secondaire Oued Fodda': {'lat': 36.1904, 'lng': 1.5372, 'eq': {'Ambulance Sanitaire': 2, 'F.P.T': 1}},
    'Unité Secondaire Ouled Ben Abdelkader': {'lat': 35.9833, 'lng': 1.2500, 'eq': {'Ambulance Sanitaire': 2, 'C.C.F. Léger': 1, 'C.C.F. Moyen': 1, 'C.T.E': 1}},
    'Unité Secondaire Ouled Fares': {'lat': 36.2333, 'lng': 1.2167, 'eq': {'Ambulance Sanitaire': 2, 'F.P.T': 1}},
    'Unité Secondaire Taougrit': {'lat': 36.1950, 'lng': 0.8750, 'eq': {'Ambulance Sanitaire': 2, 'C.C.F. Léger': 1, 'C.C.F. Moyen': 1, 'C.C.I 6000L': 1}},
    'Unité Secondaire Tenes': {'lat': 36.5108, 'lng': 1.3080, 'eq': {'Ambulance Sanitaire': 2, 'C.C.F. Moyen': 1, 'V. Secours Routiers VSR': 1}},
    'Unité Secondaire Zeboudja': {'lat': 36.3167, 'lng': 1.3500, 'eq': {'Ambulance Sanitaire': 1, 'C.C.F. Léger': 1, 'C.C.F. Moyen': 1}},
    'P.S.R El Mossalaha': {'lat': 36.1750, 'lng': 1.3400, 'eq': {'Ambulance Sanitaire': 1, 'V. Secours Routiers VSR': 1}},
    'Poste Avancé Chorfa': {'lat': 36.1800, 'lng': 1.3000, 'eq': {'Ambulance Sanitaire': 1, 'C.C.I 4000L': 1}},
    'Poste Avancé El Djazzaria': {'lat': 36.1550, 'lng': 1.3250, 'eq': {'Ambulance Sanitaire': 2}},
    'Poste Avancé El Hamadia': {'lat': 36.1400, 'lng': 1.3600, 'eq': {'Ambulance Sanitaire': 1, 'C.C.I 6000L': 1}},
    'Unité de Secteur Beni Rached': {'lat': 36.2833, 'lng': 1.5333, 'eq': {'Ambulance Sanitaire': 2, 'C.C.F. Moyen': 1}},
    'Unité de Secteur Bouzeghaia': {'lat': 36.3667, 'lng': 1.2333, 'eq': {'Ambulance Sanitaire': 1, 'C.C.I 6000L': 1, 'V. Secours Routiers VSR': 1}},
    'Unité de Secteur Chettia': {'lat': 36.1167, 'lng': 1.2500, 'eq': {'Ambulance Sanitaire': 1, 'C.C.I 4000L': 1, 'V. Secours Routiers VSR': 1}},
    'Unité de Secteur Oued Sly': {'lat': 36.1000, 'lng': 1.2000, 'eq': {'Ambulance Sanitaire': 1, 'C.C.I 4000L': 1, 'V. Secours Routiers VSR': 1}},
    'Unité de Secteur Oum Drou': {'lat': 36.1833, 'lng': 1.3833, 'eq': {'Ambulance Sanitaire': 1, 'C.C.I 4000L': 1, 'V. Secours Routiers VSR': 1}},
    'Unité de Secteur Sendjas': {'lat': 36.0333, 'lng': 1.3667, 'eq': {'Ambulance Sanitaire': 1, 'C.C.I 4000L': 1, 'V. Secours Routiers VSR': 1}},
    'Unité de Secteur Sidi Akacha': {'lat': 36.4667, 'lng': 1.3000, 'eq': {'Ambulance Sanitaire': 2, 'C.C.I 6000L': 1}},
    'Unité de Secteur Tadjena': {'lat': 36.3833, 'lng': 1.1167, 'eq': {'Ambulance Sanitaire': 1, 'C.C.I 4000L': 1}},
    'Unité Marine (Ténès)': {'lat': 36.5150, 'lng': 1.3100, 'eq': {'Ambulance Sanitaire': 1, 'C.C.I 6000L': 1}},
    'Unité Principale Chlef': {'lat': 36.1650, 'lng': 1.3340, 'eq': {'Ambulance Médicalisée': 1, 'Ambulance Sanitaire': 4, 'C.C.I 6000L': 2, 'F.P.T': 2, 'Echelle mécanique': 1, 'V. Secours Routiers VSR': 1, 'C.C.F. Moyen': 2}}
}

conn = psycopg2.connect(DB_PATH)
cursor = conn.cursor()

old_names = ["Chlef Central", "Tenes Unit", "Oued Fodda Unit", "El Karimia Unit"]
for old in old_names:
    cursor.execute("SELECT id FROM units WHERE name=%s", (old,))
    row = cursor.fetchone()
    if row:
        u_id = row[0]
        cursor.execute("DELETE FROM dispatches WHERE unit_id=%s", (u_id,))
        try:
            cursor.execute("DELETE FROM dispatches WHERE equipment_id IN (SELECT id FROM equipment WHERE unit_id=%s)", (u_id,)) 
        except Exception:
            conn.rollback()
        cursor.execute("DELETE FROM equipment WHERE unit_id=%s", (u_id,))        
        cursor.execute("DELETE FROM units WHERE id=%s", (u_id,))

vehicles_added = 0
for name, data in chlef_real_units.items():
    cursor.execute("SELECT id FROM units WHERE name=%s", (name,))
    row = cursor.fetchone()
    if not row:
        cursor.execute("INSERT INTO units (name, lat, lng, status) VALUES (%s, %s, %s, 'active') RETURNING id", (name, data['lat'], data['lng']))
        unit_id = cursor.fetchone()[0]
    else:
        unit_id = row[0]
        cursor.execute("DELETE FROM dispatches WHERE unit_id=%s", (unit_id,))
        try:
            cursor.execute("DELETE FROM dispatches WHERE equipment_id IN (SELECT id FROM equipment WHERE unit_id=%s)", (unit_id,))         
        except Exception:
            conn.rollback()
        cursor.execute("DELETE FROM equipment WHERE unit_id=%s", (unit_id,))     

    eq_list = []
    for eq_type, count in data['eq'].items():
        for i in range(count):
            rnd = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
            eq_code = f"{eq_type[:3].upper()}-{unit_id:03d}-{i+1}-{rnd}"        
            eq_list.append((unit_id, eq_type, eq_code, "available"))
            vehicles_added += 1

    psycopg2.extras.execute_values(
        cursor,
        "INSERT INTO equipment (unit_id, type, code, status) VALUES %s",
        eq_list
    )

conn.commit()
conn.close()

print(f"Successfully processed {len(chlef_real_units)} Chlef centers and added exactly {vehicles_added} vehicles based on official paper distribution!")

