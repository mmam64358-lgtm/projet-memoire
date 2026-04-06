import json
import xml.etree.ElementTree as ET

# Read JSON file
def read_json(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data

# Read XML file
def read_xml(filename):
    tree = ET.parse(filename)
    root = tree.getroot()
    data = {child.tag: child.text for child in root}
    return data

if __name__ == "__main__":
    print("=== Proof: Reading and displaying data from JSON and XML files ===")
    json_data = read_json('resource_costs.json')
    print("JSON Data:", json_data)

    # Count number of vehicle types in JSON
    if 'resource_costs' in json_data:
        json_vehicle_count = len(json_data['resource_costs'])
        print(f"Number of vehicle types in JSON: {json_vehicle_count}")
    else:
        print("No vehicle data found in JSON.")

    xml_data = read_xml('resource_costs.xml')
    print("XML Data:", xml_data)

    # Count number of vehicle types in XML
    xml_vehicle_count = len(xml_data)
    print(f"Number of vehicle types in XML: {xml_vehicle_count}")
