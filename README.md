# 🚒 Fire Station Management System

A modern web application for managing fire stations, incidents, staff, and vehicles.

---

## 📝 Requirements

Before you start, make sure you have the following installed on your system:

1. **Git**  
   - To clone the project repository.  
   - [Download Git](https://git-scm.com/downloads)
   - **Check installation:**  
     ```sh
     git --version
     ```
     You should see something like: `git version 2.40.1`

2. **Python 3.8+** (or Node.js if your backend is Node)  
   - [Download Python](https://www.python.org/downloads/)
   - **Check installation:**  
     ```sh
     python --version
     ```
     Example output: `Python 3.10.12`

3. **pip** (Python package manager)  
   - Comes with Python, but check with:  
     ```sh
     pip --version
     ```

4. **PostgreSQL**  
   - [Download PostgreSQL](https://www.postgresql.org/download/)
   - **Check installation:**  
     ```sh
     psql --version
     ```
     Example output: `psql (PostgreSQL) 15.3`

5. **A modern web browser**  
   - Chrome, Edge, Firefox, etc.

---

## ⚙️ Optional Tools

- **pgAdmin** (for managing PostgreSQL databases visually)
- **VS Code** or any code editor

---

## 🚀 Installation & Setup

1. **Clone the repository:**
   ```sh
   git clone https://github.com/mmam64358-lgtm/projet-memoire.git
   cd projet-memoire
   ```

2. **Install Python dependencies:**
   ```sh
   pip install -r requirements.txt
   ```

3. **Set up the PostgreSQL database:**
   - Create a database:
     ```sh
     psql -U postgres
     CREATE DATABASE projet_memoire;
     ```
   - Update your `.env` or config file with your database credentials.

4. **Run the application:**
   ```sh
   python app.py
   ```
   or for Node.js:
   ```sh
   npm start
   ```

5. **Open your browser and go to:**
   ```
   http://localhost:5000
   ```

---

## 🛠️ Troubleshooting

- If any command fails, make sure the program is installed and added to your PATH.
- Restart your terminal after installing new software.
- Check your database connection settings if the app can't connect to PostgreSQL.

---

## 📦 Project Structure

```
projet-memoire/
├── app.py                # Main backend application (Flask/Django/FastAPI/Node.js)
├── requirements.txt      # Python dependencies (or package.json for Node.js)
├── static/               # Static files (CSS, JS, images)
│   ├── css/
│   ├── js/
│   └── images/
├── templates/            # HTML templates (Jinja2, etc.)
│   ├── base.html
│   ├── index.html
│   └── login.html
├── backend/              # (If you have a separate backend folder)
│   ├── controllers/      # Logic for handling requests
│   ├── models/           # Database models (ORM classes)
│   ├── routes/           # API endpoints/routes
│   ├── SQL/              # SQL scripts (schema, seed data)
│   └── server.js         # Main server file (if Node.js)
├── frontend/             # (If you have a separate frontend folder)
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Main pages (Home, Login, Dashboard, etc.)
│   │   └── App.js        # Main React app file
│   └── package.json      # Frontend dependencies
├── tests/                # Unit tests and integration tests
├── docs/                 # Additional documentation (API docs, diagrams)
├── .env                  # Environment variables (database credentials, secrets)
└── README.md             # Project documentation
```

---

### 📂 Folder/Files Explanation

- **app.py / server.js:** Main entry point for the backend server.
- **requirements.txt / package.json:** List of all dependencies needed to run the project.
- **static/:** All static assets (CSS, JavaScript, images, fonts).
- **templates/:** HTML templates for rendering pages (if using Flask/Django).
- **backend/controllers/:** Functions that handle business logic for each route.
- **backend/models/:** Database models (tables/classes).
- **backend/routes/:** All API endpoints (URLs).
- **backend/SQL/:** SQL files for creating and populating the database.
- **frontend/src/components/:** Reusable UI blocks (buttons, forms, etc.).
- **frontend/src/pages/:** Main pages of the app (Login, Dashboard, etc.).
- **frontend/src/App.js:** Main React app file.
- **tests/:** Automated tests for your code.
- **docs/:** Documentation, diagrams, API references.
- **.env:** Sensitive configuration (never commit this to GitHub).
- **README.md:** Documentation for the project.

---

## 📝 License

This project is licensed under the MIT License.

---
**Remarques :**
- Si le projet nécessite des fichiers de configuration (ex: `.env`), veuillez les créer et les remplir selon les instructions du projet.
- Pour d'autres systèmes (Linux/Mac), l'activation de l'environnement virtuel se fait avec :
	```bash
	source .venv/bin/activate
	```
- Consultez le fichier `README.md` pour plus d'informations si besoin.
