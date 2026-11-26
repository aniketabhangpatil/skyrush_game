
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Volume2,
  VolumeX,
  LogOut,
  Coins,
  UserRound
} from 'lucide-react';

import Aircraft3D from './components/Aircraft3D';

const API = '/api';

function playEffect(name) {
  const audio = new Audio(`/sounds/${name}.mp3`);
  audio.volume = 0.75;
  audio.play().catch((error) => {
    console.error(`${name}.mp3 could not play:`, error);
  });
}

async function call(path, body, token) {
  const response = await fetch(API + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

function Auth({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');

    try {
      const data =
        mode === 'signup'
          ? await call('/auth/signup', { email, password })
          : await call('/auth/login', { identifier, password });

      onAuth(data);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-mark">✈</span> SKYRUSH
        </div>

        <p className="eyebrow">VIRTUAL FLIGHT EXPERIENCE</p>

        <h1>
          {mode === 'signup'
            ? 'Create your pilot account'
            : 'Welcome back, pilot'}
        </h1>

        <p className="muted">
          Virtual coins only · No deposits · No withdrawals
        </p>

        <form onSubmit={submit}>
          {mode === 'signup' ? (
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          ) : (
            <input
              placeholder="Email or username"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
            />
          )}

          <input
            type="password"
            placeholder="Password (minimum 8 characters)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />

          <button className="primary wide">
            {mode === 'signup'
              ? 'Create account · Get 500 coins'
              : 'Login'}
          </button>
        </form>

        {error && <p className="error">{error}</p>}

        <button
          className="link-btn"
          onClick={() => {
            setMode(mode === 'signup' ? 'login' : 'signup');
            setError('');
          }}
        >
          {mode === 'signup'
            ? 'Already registered? Login'
            : 'New here? Create an account'}
        </button>
      </div>
    </div>
  );
}

function App() {
  const [auth, setAuth] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('sky-auth'));
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState(auth?.user || null);
  const [coins, setCoins] = useState(auth?.user?.coins ?? 500);
  const [bet, setBet] = useState(50);
  const [phase, setPhase] = useState('waiting');
  const [mult, setMult] = useState(1);
  const [round, setRound] = useState(null);
  const [muted, setMuted] = useState(false);
  const [players, setPlayers] = useState([]);
  const [hasCashedOut, setHasCashedOut] = useState(false);
  const [cashoutLoading, setCashoutLoading] = useState(false);

  const [notice, setNotice] = useState(
    'Place your bet to start your flight'
  );

  const startTime = useRef(0);
  const raf = useRef(0);
  const flightAudio = useRef(null);
  const cashoutInProgress = useRef(false);
  const flightSoundActive = useRef(false);

  // Continuous flight audio.
  useEffect(() => {
    const audio = new Audio('/sounds/win.mp3');

    audio.loop = true;
    audio.volume = 0.75;
    audio.preload = 'auto';

    flightAudio.current = audio;

    return () => {
      audio.pause();
      audio.currentTime = 0;
      flightAudio.current = null;
    };
  }, []);

  function startFlightSound() {
    flightSoundActive.current = true;

    const audio = flightAudio.current;

    if (!audio || muted) return;

    audio.loop = true;
    audio.volume = 0.75;

    if (audio.paused) {
      audio.play().catch((error) => {
        console.error('Flight audio could not start:', error);
      });
    }
  }

  function stopFlightSound() {
    flightSoundActive.current = false;

    const audio = flightAudio.current;

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  useEffect(() => {
    const audio = flightAudio.current;

    if (!audio) return;

    if (muted) {
      audio.pause();
    } else if (flightSoundActive.current) {
      audio.play().catch((error) => {
        console.error('Flight audio could not resume:', error);
      });
    }
  }, [muted]);

  // Restore logged-in user.
  useEffect(() => {
    if (auth?.token) {
      call('/me', null, auth.token)
        .then((data) => {
          setUser(data.user);
          setCoins(data.user.coins);
        })
        .catch(() => logout());
    }
  }, []);

  // Leaderboard.
  useEffect(() => {
    if (muted) return;

    const loadLeaderboard = () => {
      call('/leaderboard')
        .then((data) => setPlayers(data.players))
        .catch(() => { });
    };

    loadLeaderboard();

    const id = setInterval(loadLeaderboard, 7000);

    return () => clearInterval(id);
  }, [muted]);

  function logout() {
    stopFlightSound();

    cashoutInProgress.current = false;

    localStorage.removeItem('sky-auth');

    setAuth(null);
    setUser(null);
    setRound(null);
    setPhase('waiting');
    setHasCashedOut(false);
  }

  function saveAuth(data) {
    localStorage.setItem('sky-auth', JSON.stringify(data));

    setAuth(data);
    setUser(data.user);
    setCoins(data.user.coins);
  }

  // Flight multiplier and server-controlled crash.
  useEffect(() => {
    if (phase !== 'flying' || !round) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;

      const elapsed = (Date.now() - startTime.current) / 1000;

      const value = Number(
        Math.exp(Math.max(0, elapsed) * 0.22).toFixed(2)
      );

      setMult(value);

      // Do not run the local crash request while cashout is pending.
      if (cashoutInProgress.current) {
        raf.current = requestAnimationFrame(tick);
        return;
      }

      // Use the crash multiplier generated by the backend.
      if (value >= Number(round.crashMultiplier)) {
        cancelled = true;

        try {
          const data = await call(
            '/game/crash',
            { roundId: round.roundId },
            auth.token
          );

          setCoins(data.coins ?? coins);
          setPhase('crashed');
          setNotice(`FLIGHT CRASHED · ${data.crashMultiplier}x`);

          stopFlightSound();

          if (!muted) {
            playEffect('crash');
          }

          setRound(null);
          setHasCashedOut(false);
        } catch (error) {
          // If the server says it has not crashed yet,
          // continue checking rather than ending the flight.
          if (error.message === 'Flight has not crashed yet.') {
            cancelled = false;
            raf.current = requestAnimationFrame(tick);
            return;
          }

          setNotice(error.message);
          cancelled = false;
          raf.current = requestAnimationFrame(tick);
        }

        return;
      }

      raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf.current);
    };
  }, [phase, round]);

  // Start a new flight.
  async function start() {
    if (phase === 'flying') return;

    if (bet < 1 || bet > coins) {
      setNotice('Enter a valid bet within your balance');
      return;
    }

    cashoutInProgress.current = false;
    setHasCashedOut(false);
    setCashoutLoading(false);

    startFlightSound();

    try {
      const data = await call(
        '/game/start',
        { bet },
        auth.token
      );

      setCoins(data.coins);

      setRound(data);
      setMult(1);

      startTime.current = Date.now();

      setPhase('flying');
      setNotice('FLY, FLY, FLY!');
    } catch (error) {
      stopFlightSound();
      setNotice(error.message);
    }
  }

  // Cashout without ending the flight.
  async function cashout() {
    if (
      phase !== 'flying' ||
      !round ||
      hasCashedOut ||
      cashoutInProgress.current
    ) {
      return;
    }

    cashoutInProgress.current = true;
    setCashoutLoading(true);

    try {
      const data = await call(
        '/game/cashout',
        {
          roundId: round.roundId,
          multiplier: mult
        },
        auth.token
      );

      setCoins(data.coins);

      if (data.result === 'cashed_out') {
        setHasCashedOut(true);

        setNotice(
          `CASHED OUT · +${data.payout} COINS · FLIGHT CONTINUES`
        );

        if (!muted) {
          playEffect('cashout');
        }

        // IMPORTANT:
        // Do not change phase.
        // Do not clear round.
        // Do not stop flight sound.
        // Aircraft continues until server crash.
      } else if (data.result === 'crashed') {
        setPhase('crashed');
        setNotice('Too late — flight crashed');

        stopFlightSound();

        if (!muted) {
          playEffect('crash');
        }

        setRound(null);
        setHasCashedOut(false);
      }
    } catch (error) {
      setNotice(error.message);
    } finally {
      cashoutInProgress.current = false;
      setCashoutLoading(false);
    }
  }

  if (!user) {
    return <Auth onAuth={saveAuth} />;
  }

  const pct = Math.min(
    90,
    Math.max(4, (mult - 1) * 11)
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">✈</span> SKYRUSH
        </div>

        <div className="top-actions">
          <span className="pilot">
            <UserRound size={15} />
            {user.username}
          </span>

          <span className="wallet">
            <Coins size={16} />
            {coins.toLocaleString()}
            <small>COINS</small>
          </span>

          <button
            className="icon-btn"
            onClick={() => setMuted((value) => !value)}
            title="Toggle sound"
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </button>

          <button
            className="icon-btn"
            onClick={logout}
            title="Logout"
          >
            <LogOut />
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="game-column">
          <div className="history">
            <span>RECENT FLIGHTS</span>

            {[
              '1.24x',
              '2.51x',
              '1.08x',
              '4.32x',
              '1.76x',
              '8.21x'
            ].map((value, index) => (
              <b key={index}>{value}</b>
            ))}
          </div>

          <div className={`flight-stage ${phase}`}>
            <div className="stars"></div>
            <div className="skyline"></div>

            {phase === 'flying' && (
              <div className="watermark">
                World@28151
              </div>
            )}

            <div className="stage-top">
              <span>YOUR PRIVATE ROUND</span>

              <span className="live-dot">
                ● {phase === 'flying' ? 'IN FLIGHT' : 'READY'}
              </span>
            </div>

            <div className="multiplier">
              {phase === 'flying'
                ? `${mult.toFixed(2)}x`
                : phase === 'crashed'
                  ? 'FLEW AWAY'
                  : '1.00x'}
            </div>

            <div
              className="flight-path"
              style={{
                clipPath: `polygon(0 100%, 0 ${100 - pct}%, ${pct}% 100%)`
              }}
            ></div>

            <motion.div
              className="plane"
              animate={
                phase === 'flying'
                  ? {
                    x: 500,
                    y: -180,
                    rotate: -8
                  }
                  : {
                    x: 0,
                    y: 0,
                    rotate: 0
                  }
              }
              transition={
                phase === 'flying'
                  ? {
                    x: {
                      duration: 25,
                      ease: 'linear'
                    },
                    y: {
                      duration: 25,
                      ease: 'linear'
                    },
                    rotate: {
                      duration: 0.3
                    }
                  }
                  : {
                    duration: 0.3
                  }
              }
            >
              <Aircraft3D />
            </motion.div>

            <div className="stage-notice">
              {notice}
            </div>

            <div className="watermark-caption">
              INDEPENDENT DEMO ROUND
            </div>
          </div>

          <div className="bet-panel">
            <div className="bet-controls">
              <div>
                <label>BET AMOUNT</label>

                <div className="bet-input">
                  <button
                    disabled={phase === 'flying'}
                    onClick={() =>
                      setBet((value) => Math.max(1, value - 10))
                    }
                  >
                    −
                  </button>

                  <input
                    type="number"
                    min="1"
                    disabled={phase === 'flying'}
                    value={bet}
                    onChange={(event) =>
                      setBet(Math.max(1, Number(event.target.value)))
                    }
                  />

                  <button
                    disabled={phase === 'flying'}
                    onClick={() => setBet((value) => value + 10)}
                  >
                    +
                  </button>
                </div>

                <div className="quick-bets">
                  {[10, 50, 100, 250].map((value) => (
                    <button
                      key={value}
                      disabled={phase === 'flying'}
                      onClick={() => setBet(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bet-action">
                {phase === 'flying' ? (
                  hasCashedOut ? (
                    <button className="cash-btn" disabled>
                      CASHED OUT ✓
                    </button>
                  ) : (
                    <button
                      className="cash-btn"
                      onClick={cashout}
                      disabled={cashoutLoading}
                    >
                      {cashoutLoading
                        ? 'CASHING OUT...'
                        : 'CASH OUT'}

                      <strong>
                        {Math.floor(bet * mult).toLocaleString()}
                      </strong>
                    </button>
                  )
                ) : (
                  <button
                    className="primary"
                    onClick={start}
                  >
                    BET / FLY
                  </button>
                )}

                <small>
                  {phase === 'flying'
                    ? hasCashedOut
                      ? 'Your aircraft continues until crash'
                      : 'Cash out before your flight ends'
                    : 'Start your independent round'}
                </small>
              </div>
            </div>
          </div>
        </section>

        <aside className="side-column">
          <div className="side-card">
            <div className="side-heading">
              <h3>TOP WINNINGS</h3>
              <span className="sim-tag">SIMULATED</span>
            </div>

            <p className="muted tiny">
              Imaginary virtual counts · highest to lowest
            </p>

            {players.map((player, index) => (
              <div className="player-row" key={index}>
                <span className="rank">
                  {String(index + 1).padStart(2, '0')}
                </span>

                <span className="player-name">
                  {player.username}
                </span>

                <b>
                  {player.coins.toLocaleString()}
                  <small> COINS</small>
                </b>
              </div>
            ))}
          </div>



          <div className="side-card">
            <h3>HOW TO PLAY</h3>

            <p className="muted">
              Place a virtual bet, start your own flight and cash
              out before your plane crashes. Coins are for
              entertainment only and have no monetary value.
            </p>
          </div>
        </aside>
      </main>

       
      <footer className="footer">
        <div className="footer-track">
          {[1].map((item) => (
            <div className="footer-content" key={item}>
              <b className="footer-name">Aniket Abhang Patil</b>
              <span>Software Engineer</span>

              <p>
                Passionate about building modern web applications,
                interactive digital experiences and innovative
                software solutions.
              </p>

              <small>© 2026 · SKYRUSH · VIRTUAL COINS ONLY</small>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}

export default App;
