# UFC Fantasy League – AI-Assisted Web Application

**Course:** AISE 3309 – Database Management Systems  
**Assignment:** 04 – AI-Assisted Web Application

---

## 1. Project Overview

This project is a full-stack web interface for a UFC Fantasy League. It connects a MySQL database to a browser-based interface so users can register, create leagues, submit picks for UFC events, and view leaderboard results.

### Tech Stack
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (SPA structure)  
- **Backend:** Node.js, Express.js  
- **Database:** MySQL (`mysql2` driver)

---

## 2. Prerequisites

Install the following before running the app:

- **Node.js (LTS)**  
- **MySQL Server & Workbench**

---

## 3. Database Setup

A specific schema is required. Import the provided **DUMP** directory.

### Create the Database

```sql
CREATE DATABASE IF NOT EXISTS ufc_fantasy_db;
```

### Import the Dump

1. Open **MySQL Workbench**  
2. Go to **Server → Data Import**  
3. Select **Import from Dump Project Folder**  
4. Choose the provided DUMP folder  
5. Set **ufc_fantasy_db** as the target schema  
6. Click **Start Import**

**Note:** Don’t use older SQL scripts. The updated dump includes UUID-based IDs and newer table structures.

---

## 4. Application Configuration

### Unzip the Project
Extract the `UFC_Fantasy_App` folder.

### Install Dependencies

Navigate into the folder and run:

```bash
npm install
```

### Configure Environment Variables

Edit `.env` or rename `.env.example`:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD_HERE
DB_NAME=ufc_fantasy_db
PORT=3000
```

---

## 5. Running the Application

Start the backend:

```bash
node server.js
```

Expected output:

```
🚀 Server running on http://localhost:3000
✅ Database connected successfully!
```

Then open:

```
http://localhost:3000
```

---

## 6. Feature Walkthrough

### **1. User Registration & Login (Data Modification)**  
- Creates a new user with hashed passwords  
- Inserts into the **User** table  

### **2. Create & Join Leagues (Data Modification)**  
- Create a league or join with a league code  
- Inserts into **League** and **Membership** tables  

### **3. Make Picks (Data Modification)**  
- Choose a league and event  
- Select fight winners and save picks  
- Inserts into the **Pick** table  

### **4. Leaderboard & View Picks (Complex Query)**  
- Shows ranked users by points  
- View detailed pick history per event  
- Uses JOINs + aggregation (`SUM`)  

### **5. Fighter History Lookup (Complex Query)**  
- Search any fighter  
- Shows chronology of fights, opponents, event names, and results  
- Joins **Fighter**, **Fight**, and **Event** tables  

---

## 7. Troubleshooting

### **“Client does not support authentication protocol”**  
Use MySQL 8.0+ or update your password to the modern auth format.

### **“Unknown column in field list”**  
You likely imported an old schema. Re-import the latest dump.

### **“npm is not recognized”**  
Install Node.js and restart your terminal.

---
