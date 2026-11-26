# Aviator Demo — virtual coins only

A starter full-stack demo with React + Vite, Node.js + Express, MySQL 8, JWT authentication,
an automatically assigned `silkroad0001`–`silkroad1000` username, 500 starter coins,
independent per-user rounds, simulated leaderboard entries, the `World@28151` flight watermark,
and the three sound effects supplied with the project.

## Important
- This project has **no real-money features**: no deposits, withdrawals, payment gateway, or cash value.
- The leaderboard is clearly labelled **SIMULATED** and does not represent real users or real winnings.
- This is a development starter, not a production-hardened gambling platform.
- Each player has an independent round; there is no shared multiplayer round.
- The demo game engine is deliberately simple. Review and test it before public deployment.

## Requirements
- Node.js 20+ recommended
- MySQL 8
- Windows PowerShell (commands below)

## 1. Create the database
1. Open MySQL Workbench and connect to your local MySQL server.
2. Open `database/schema.sql`.
3. Execute the entire script (lightning bolt).
4. It creates `aviator_demo_db`, its tables, and the 1,000 username-pool rows.

## 2. Configure backend
In PowerShell:

```powershell
cd path\to\aviator-demo\backend
Copy-Item .env.example .env
notepad .env
```

Set your own MySQL credentials and a long random JWT secret:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=aviator_demo_db
JWT_SECRET=replace_with_a_long_random_secret
CLIENT_ORIGIN=http://localhost:5173
```

Do not share or commit `.env`. The `.gitignore` excludes it.

## 3. Start backend
Open a terminal in `backend`:

```powershell
npm install
npm run dev
```

Expected: `API running on http://localhost:5000`

## 4. Start frontend
Open a second PowerShell terminal:

```powershell
cd path\to\aviator-demo\frontend
npm install
npm run dev
```

Open the Vite URL shown (normally `http://localhost:5173`).

## 5. Register and play
- Register with email and password.
- The server assigns the next available username from the username pool and credits 500 virtual coins.
- Log in with either email or assigned username plus password.
- Choose a bet and start your own independent round.
- Cash out before your own round crashes.
- The `cashout`, `crash`, and `win` sounds are loaded from `frontend/public/sounds/`.

## Notes
- Username allocation is atomic using a MySQL transaction and row locking.
- The 1,000 usernames are reserved by the pool. If all are assigned, registration stops with a clear message.
- There is no password reset or email verification in this demo.
- If you deploy, use HTTPS, a strong JWT secret, proper rate limiting, backups, and production database credentials.
