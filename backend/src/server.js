
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { pool } from './db.js';
import { requireAuth } from './auth.js';

dotenv.config();

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173'
  })
);
app.use(express.json());

// Flight multiplier calculation.
// Must match the frontend multiplier formula.
function calculateMultiplier(elapsedSeconds) {
  return Number(Math.exp(Math.max(0, elapsedSeconds) * 0.22).toFixed(2));
}

// Weighted random crash point.
// 50%: 1.20x–3.00x
// 30%: 3.00x–5.00x
// 15%: 5.00x–10.00x
//  5%: 10.00x–15.00x
function generateCrashMultiplier() {
  const chance = Math.random();

  let min;
  let max;

  if (chance < 0.50) {
    min = 1.20;
    max = 3.00;
  } else if (chance < 0.80) {
    min = 3.00;
    max = 5.00;
  } else if (chance < 0.95) {
    min = 5.00;
    max = 10.00;
  } else {
    min = 10.00;
    max = 15.00;
  }

  return Number((min + Math.random() * (max - min)).toFixed(2));
}

// Health check
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      database: 'disconnected'
    });
  }
});

// Signup
app.post('/api/auth/signup', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid email.' });
  }

  if (password.length < 8) {
    return res.status(400).json({
      message: 'Password must be at least 8 characters.'
    });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [existing] = await conn.execute(
      'SELECT user_id FROM users WHERE email = ?',
      [email]
    );

    if (existing.length) {
      await conn.rollback();
      return res.status(409).json({
        message: 'Email is already registered.'
      });
    }

    const [slots] = await conn.query(
      `SELECT username_id, username
       FROM username_pool
       WHERE user_id IS NULL
       ORDER BY username_id
       LIMIT 1
       FOR UPDATE`
    );

    if (!slots.length) {
      await conn.rollback();
      return res.status(409).json({
        message: 'All 1,000 usernames are currently assigned.'
      });
    }

    const slot = slots[0];
    const hash = await bcrypt.hash(password, 12);

    const [created] = await conn.execute(
      `INSERT INTO users (email, username, password_hash, coins)
       VALUES (?, ?, ?, 500)`,
      [email, slot.username, hash]
    );

    await conn.execute(
      'UPDATE username_pool SET user_id = ? WHERE username_id = ?',
      [created.insertId, slot.username_id]
    );

    await conn.commit();

    const user = {
      id: created.insertId,
      email,
      username: slot.username,
      coins: 500
    };

    const token = jwt.sign(user, process.env.JWT_SECRET, {
      expiresIn: '7d'
    });

    res.status(201).json({ token, user });
  } catch (error) {
    await conn.rollback();

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        message: 'Email or username already exists.'
      });
    }

    console.error(error);
    res.status(500).json({
      message: 'Could not create account.'
    });
  } finally {
    conn.release();
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const identifier = String(req.body.identifier || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  try {
    const [rows] = await pool.execute(
      `SELECT user_id, email, username, password_hash, coins
       FROM users
       WHERE email = ? OR username = ?
       LIMIT 1`,
      [identifier, identifier]
    );

    if (
      !rows.length ||
      !(await bcrypt.compare(password, rows[0].password_hash))
    ) {
      return res.status(401).json({
        message: 'Incorrect login details.'
      });
    }

    const row = rows[0];

    const user = {
      id: row.user_id,
      email: row.email,
      username: row.username,
      coins: Number(row.coins)
    };

    const token = jwt.sign(user, process.env.JWT_SECRET, {
      expiresIn: '7d'
    });

    res.json({ token, user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Login failed.' });
  }
});

// Current user
app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT user_id, email, username, coins
       FROM users
       WHERE user_id = ?`,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({
        message: 'Account not found.'
      });
    }

    const row = rows[0];

    res.json({
      user: {
        id: row.user_id,
        email: row.email,
        username: row.username,
        coins: Number(row.coins)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load account.' });
  }
});

// Simulated leaderboard
app.get('/api/leaderboard', (_req, res) => {
  const names = Array.from({ length: 12 }, (_, index) =>
    `silkroad${String(Math.floor(Math.random() * 1000) + 1).padStart(4, '0')}`
  );

  const players = names
    .map((username) => ({
      username,
      coins: Math.floor(350 + Math.random() * 24000)
    }))
    .sort((a, b) => b.coins - a.coins);

  res.json({ simulated: true, players });
});

// Start a round
app.post('/api/game/start', requireAuth, async (req, res) => {
  const bet = Math.floor(Number(req.body.bet));

  if (!Number.isSafeInteger(bet) || bet < 1) {
    return res.status(400).json({ message: 'Enter a valid bet.' });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [users] = await conn.execute(
      'SELECT coins FROM users WHERE user_id = ? FOR UPDATE',
      [req.user.id]
    );

    if (!users.length) {
      await conn.rollback();
      return res.status(404).json({ message: 'Account not found.' });
    }

    if (Number(users[0].coins) < bet) {
      await conn.rollback();
      return res.status(400).json({
        message: 'Not enough virtual coins.'
      });
    }

    const [active] = await conn.execute(
      `SELECT round_id
       FROM game_rounds
       WHERE user_id = ? AND status = 'running'
       FOR UPDATE`,
      [req.user.id]
    );

    if (active.length) {
      await conn.rollback();
      return res.status(409).json({
        message: 'You already have a running round.'
      });
    }

    const crash = generateCrashMultiplier();

    const [created] = await conn.execute(
      `INSERT INTO game_rounds
       (user_id, bet_amount, crash_multiplier, status)
       VALUES (?, ?, ?, 'running')`,
      [req.user.id, bet, crash]
    );

    await conn.execute(
      'UPDATE users SET coins = coins - ? WHERE user_id = ?',
      [bet, req.user.id]
    );

    const [[updatedUser]] = await conn.execute(
      'SELECT coins FROM users WHERE user_id = ?',
      [req.user.id]
    );

    await conn.commit();

    res.status(201).json({
      roundId: created.insertId,
      bet,
      startedAt: Date.now(),
      crashMultiplier: crash,
      coins: Number(updatedUser.coins)
    });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    res.status(500).json({
      message: 'Could not start round.'
    });
  } finally {
    conn.release();
  }
});

// Cashout
// A successful cashout credits coins but leaves the round running.
// The aircraft can therefore continue until the actual crash.
app.post('/api/game/cashout', requireAuth, async (req, res) => {
  const roundId = Number(req.body.roundId);

  if (!Number.isSafeInteger(roundId) || roundId < 1) {
    return res.status(400).json({ message: 'Invalid cashout.' });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute(
      `SELECT *,
       TIMESTAMPDIFF(
         MICROSECOND,
         started_at,
         CURRENT_TIMESTAMP(3)
       ) / 1000000 AS elapsed_seconds
       FROM game_rounds
       WHERE round_id = ?
         AND user_id = ?
         AND status = 'running'
       FOR UPDATE`,
      [roundId, req.user.id]
    );

    if (!rows.length) {
      await conn.rollback();
      return res.status(409).json({
        message: 'Round is no longer active.'
      });
    }

    const round = rows[0];

    if (round.cashout_multiplier !== null) {
      await conn.rollback();
      return res.status(409).json({
        message: 'You have already cashed out this round.'
      });
    }

    const currentMultiplier = calculateMultiplier(
      Number(round.elapsed_seconds)
    );

    if (currentMultiplier >= Number(round.crash_multiplier)) {
      await conn.execute(
        `UPDATE game_rounds
         SET status = 'crashed', ended_at = CURRENT_TIMESTAMP(3)
         WHERE round_id = ?`,
        [roundId]
      );

      const [[user]] = await conn.execute(
        'SELECT coins FROM users WHERE user_id = ?',
        [req.user.id]
      );

      await conn.commit();

      return res.json({
        result: 'crashed',
        crashMultiplier: Number(round.crash_multiplier),
        coins: Number(user.coins)
      });
    }

    const payout = Math.floor(
      Number(round.bet_amount) * currentMultiplier
    );

    await conn.execute(
      `UPDATE game_rounds
       SET cashout_multiplier = ?, payout = ?
       WHERE round_id = ?`,
      [currentMultiplier, payout, roundId]
    );

    await conn.execute(
      'UPDATE users SET coins = coins + ? WHERE user_id = ?',
      [payout, req.user.id]
    );

    const [[user]] = await conn.execute(
      'SELECT coins FROM users WHERE user_id = ?',
      [req.user.id]
    );

    await conn.commit();

    res.json({
      result: 'cashed_out',
      payout,
      multiplier: currentMultiplier,
      coins: Number(user.coins)
    });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    res.status(500).json({ message: 'Cashout failed.' });
  } finally {
    conn.release();
  }
});

// Crash
// The server checks the actual crash time.
// This endpoint can also finish a round after successful cashout.
app.post('/api/game/crash', requireAuth, async (req, res) => {
  const roundId = Number(req.body.roundId);

  if (!Number.isSafeInteger(roundId) || roundId < 1) {
    return res.status(400).json({ message: 'Invalid round.' });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute(
      `SELECT *,
       TIMESTAMPDIFF(
         MICROSECOND,
         started_at,
         CURRENT_TIMESTAMP(3)
       ) / 1000000 AS elapsed_seconds
       FROM game_rounds
       WHERE round_id = ?
         AND user_id = ?
       FOR UPDATE`,
      [roundId, req.user.id]
    );

    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({
        message: 'Round not found.'
      });
    }

    const round = rows[0];

    if (round.status === 'crashed') {
      await conn.rollback();
      return res.json({
        result: 'crashed',
        crashMultiplier: Number(round.crash_multiplier)
      });
    }

    if (round.status !== 'running') {
      await conn.rollback();
      return res.status(409).json({
        message: 'Round is no longer active.'
      });
    }

    const currentMultiplier = calculateMultiplier(
      Number(round.elapsed_seconds)
    );

    if (currentMultiplier < Number(round.crash_multiplier)) {
      await conn.rollback();
      return res.status(409).json({
        message: 'Flight has not crashed yet.',
        currentMultiplier
      });
    }

    await conn.execute(
      `UPDATE game_rounds
       SET status = 'crashed', ended_at = CURRENT_TIMESTAMP(3)
       WHERE round_id = ?`,
      [roundId]
    );

    const [[user]] = await conn.execute(
      'SELECT coins FROM users WHERE user_id = ?',
      [req.user.id]
    );

    await conn.commit();

    res.json({
      result: 'crashed',
      crashMultiplier: Number(round.crash_multiplier),
      coins: Number(user.coins)
    });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    res.status(500).json({
      message: 'Crash update failed.'
    });
  } finally {
    conn.release();
  }
});

export default app;