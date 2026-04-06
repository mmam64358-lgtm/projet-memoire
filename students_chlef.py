import xml.etree.ElementTree as ET

# Example: Get all students from city 'chlef' and print their name and email
root = ET.parse("students.xml").getroot()

print("Students from chlef:")
for student in root.findall("student"):
    if student.find("city").text == "chlef":
        name = student.find("name").text
        email = student.find("email").text
        print(f"Name: {name}, Email: {email}")
