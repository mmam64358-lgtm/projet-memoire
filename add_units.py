import psycopg2
import psycopg2.extras
import os

DB_PATH = "dbname=memoire_db user=postgres password=maria123 host=localhost"

wilayas = [
    ("Alger Central", 36.7538, 3.0588),
    ("Oran Central", 35.6987, -0.6308),
    ("Constantine Central", 36.3650, 6.6147),
    ("Annaba Central", 36.9000, 7.7667),
    ("Blida Central", 36.4700, 2.8277),
    ("Batna Central", 35.5555, 6.1741),
    ("Djelfa Central", 34.6667, 3.2500),
    ("Setif Central", 36.1898, 5.4108),
    ("Sidi Bel Abbes Central", 35.1899, -0.6300),
    ("Biskra Central", 34.8500, 5.7333),
    ("Tebessa Central", 35.4000, 8.1167),
    ("Tiaret Central", 35.3667, 1.3167),
    ("Ouargla Central", 31.9500, 5.3167),
    ("Bejaia Central", 36.7500, 5.0667),
    ("Tizi Ouzou Central", 36.7118, 4.0459),
    ("Tlemcen Central", 34.8783, -1.3150),
    ("Skikda Central", 36.8667, 5.8667),
    ("Medea Central", 36.2642, 2.7539),
    ("Bordj Bou Arreridj Central", 36.0667, 4.7667),
    ("Aïn Defla Central", 36.2667, 1.9667),
    ("Bouira Central", 36.3748, 1.9567),
    ("Mostaganem Central", 35.9333, 0.0833),
    ("Adrar Central", 31.8667, 4.3333),
    ("Ghardaia Central", 32.4833, 3.6667),
    ("Tamanrasset Central", 31.7833, 5.5167),
    ("Bechar Central", 27.6167, -2.2500),
    ("Tindouf Central", 22.7333, -5.5333),
    ("Illizi Central",  27.6667, -8.0167),
    ("El Oued Central", 31.9500, 6.8333),
]

conn = psycopg2.connect(DB_PATH)
cursor = conn.cursor()

# Get existing names to avoid duplicates
cursor.execute("SELECT name FROM units")
existing = cursor.fetchall()
existing_names = set(row[0] for row in existing)

new_units = []
for name, lat, lng in wilayas:
    if name not in existing_names:
        new_units.append((name, lat, lng, "active"))

if new_units:
    psycopg2.extras.execute_values(
        cursor,
        "INSERT INTO units (name, lat, lng, status) VALUES %s",
        new_units
    )
    
    # Let's also add some basic equipment to them so they show up as fully functional
    # We will get their IDs
    for name, lat, lng, status in new_units:
        cursor.execute("SELECT id FROM units WHERE name = %s", (name,))
        unit_id = cursor.fetchone()[0]
        equipment = [
            (unit_id, "CCI", f"CCI-{unit_id:03d}", "available"),
            (unit_id, "CCF", f"CCF-{unit_id:03d}", "available"),
            (unit_id, "Ambulance", f"AMB-{unit_id:03d}", "available")
        ]
        psycopg2.extras.execute_values(
            cursor,
            "INSERT INTO equipment (unit_id, type, code, status) VALUES %s",
            equipment
        )
    
    conn.commit()
    print(f"Added {len(new_units)} new wilaya units to the database.")
else:
    print("All wilaya units are already in the database.")

conn.close()
