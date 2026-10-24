import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  Eye,
  Move3D,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  X,
} from 'lucide-react';
import RoomScene from './game/RoomScene';
import {
  createPuzzleState,
  getHint,
  getObjective,
  interactWithPuzzle,
  type InteractionTarget,
  type PuzzleResult,
  type PuzzleState,
} from './game/puzzle';
import { RoomAudio } from './game/audio';

export type GameFrontendCallbacks = {
  onStart?: () => void;
  onPause?: (paused: boolean) => void;
  onRestart?: () => void;
  onSensitivityChange?: (value: number) => void;
  onVolumeChange?: (value: number) => void;
  onSceneAction?: (target: InteractionTarget, result: PuzzleResult) => void;
};

type Props = { callbacks?: GameFrontendCallbacks };

const targetNames: Record<InteractionTarget, string> = {
  remote: 'Pick up the remote',
  'activate-remote': 'Press the remote',
  'hidden-switch': 'Flip the hidden switch',
  'exit-door': 'Try the exit',
  sofa: 'Inspect the sofa',
  television: 'Inspect the television',
  painting: 'Inspect the portrait',
  lamp: 'Inspect the lamp',
  bookshelf: 'Inspect the bookshelf',
};

const fieldNotes: { target: InteractionTarget; title: string; note: string }[] = [
  { target: 'sofa', title: 'The suspicious sofa', note: 'It straightens its own cushions and claims it was your idea.' },
  { target: 'television', title: 'Broadcast sandwich', note: 'A serious documentary. The sandwich appears to be winning.' },
  { target: 'painting', title: 'The portrait', note: 'It blinks first. After the room flips, it develops a new perspective.' },
  { target: 'lamp', title: 'The helpful lamp', note: 'It points toward the remote with absolutely no subtlety.' },
  { target: 'bookshelf', title: 'Shelf literature', note: 'A book called How To Be A Shelf is filed under S.' },
];

function targetForButton(target: InteractionTarget) {
  return targetNames[target] ?? 'Look closer';
}

function App({ callbacks = {} }: Props) {
  const [puzzle, setPuzzle] = useState<PuzzleState>(() => createPuzzleState());
  const [screen, setScreen] = useState<'title' | 'playing' | 'paused' | 'settings' | 'complete'>('title');
  const [previousScreen, setPreviousScreen] = useState<'title' | 'playing' | 'paused' | 'complete'>('title');
  const [sensitivity, setSensitivity] = useState(1);
  const [volume, setVolume] = useState(.62);
  const [hovered, setHovered] = useState<InteractionTarget | null>(null);
  const [message, setMessage] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const completionTimer = useRef<number | undefined>(undefined);
  const puzzleRef = useRef(puzzle);
  const audioRef = useRef<RoomAudio | null>(null);
  if (!audioRef.current) audioRef.current = new RoomAudio();
  const isActive = screen === 'playing';

  const showMessage = useCallback((nextMessage: string) => {
    setMessage(nextMessage);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setMessage(''), 2900);
  }, []);

  const runAction = useCallback((target: InteractionTarget) => {
    const result = interactWithPuzzle(puzzleRef.current, target);
    puzzleRef.current = result.state;
    setPuzzle(result.state);
    audioRef.current?.play(result.sound);
    callbacks.onSceneAction?.(target, result);
    showMessage(result.message);
    if (result.state.complete) {
      window.clearTimeout(completionTimer.current);
      completionTimer.current = window.setTimeout(() => setScreen('complete'), 1050);
    }
  }, [callbacks, showMessage]);

  const startGame = useCallback(() => {
    void audioRef.current?.start();
    callbacks.onStart?.();
    setScreen('playing');
    showMessage('The room is all yours. Please do not trust the remote.');
  }, [callbacks, showMessage]);

  const pauseGame = useCallback(() => {
    if (screen === 'playing') {
      setScreen('paused');
      callbacks.onPause?.(true);
    } else if (screen === 'paused') {
      setScreen('playing');
      callbacks.onPause?.(false);
    }
  }, [callbacks, screen]);

  const restartGame = useCallback(() => {
    void audioRef.current?.start();
    window.clearTimeout(toastTimer.current);
    window.clearTimeout(completionTimer.current);
    const freshState = createPuzzleState();
    puzzleRef.current = freshState;
    setPuzzle(freshState);
    setHovered(null);
    setMessage('');
    setShowHint(false);
    setShowJournal(false);
    setScreen('playing');
    callbacks.onRestart?.();
    callbacks.onPause?.(false);
    showMessage('Fresh start. The room denies having met you.');
  }, [callbacks, showMessage]);

  const changeSensitivity = (value: number) => {
    setSensitivity(value);
    callbacks.onSensitivityChange?.(value);
  };
  const changeVolume = (value: number) => {
    setVolume(value);
    audioRef.current?.setVolume(value);
    callbacks.onVolumeChange?.(value);
  };

  const playFootstep = useCallback(() => {
    audioRef.current?.play('footstep');
  }, []);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && screen === 'playing') {
        event.preventDefault();
        pauseGame();
      }
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [pauseGame, screen]);

  useEffect(() => () => {
    window.clearTimeout(toastTimer.current);
    window.clearTimeout(completionTimer.current);
    audioRef.current?.dispose();
  }, []);

  const objective = getObjective(puzzle);
  const progress = [puzzle.hasRemote, puzzle.roomFlipped, puzzle.switchActivated, puzzle.complete];
  const overlay = screen === 'title' || screen === 'paused' || screen === 'settings' || screen === 'complete';

  return (
    <div className="game-shell">
      <header className="topbar">
        <div className="brand" aria-label="The Room Is Weird">
          <span className="brand-mark"><Move3D size={18} strokeWidth={2.4} /></span>
          <span>The Room Is Weird</span>
        </div>
        <div className="topbar-right">
          <span className="top-note">A small adventure in a deeply suspicious room</span>
          <button className="icon-button" type="button" aria-label="Settings" data-testid="button-settings" onClick={() => { if (screen === 'playing') callbacks.onPause?.(true); setPreviousScreen(screen === 'playing' ? 'paused' : screen === 'settings' ? previousScreen : screen); setScreen('settings'); }}><Settings2 size={17} /></button>
          {screen === 'playing' && <button className="icon-button" type="button" aria-label="Pause game" data-testid="button-pause" onClick={pauseGame}><Pause size={16} /></button>}
        </div>
      </header>

      <main className="game-main">
        <div className="game-heading">
          <div>
            <p className="eyebrow">Chapter 01 / The living room</p>
            <h1>A perfectly normal room.</h1>
          </div>
          <div className="chapter-pill"><b>DAY 01</b>&nbsp; · &nbsp;No one is home</div>
        </div>

        <section className="stage" aria-label="Game scene">
          <RoomScene puzzle={puzzle} active={isActive} onAction={runAction} sensitivity={sensitivity} onLookAt={setHovered} onFootstep={playFootstep} />
          <div className="hud-top">
            <div className="objective" data-testid="status-objective">
              <small>Current objective</small>
              <strong>{objective}</strong>
            </div>
            <span className="room-stamp">Property of nobody / 04</span>
          </div>
          <span className="crosshair" aria-hidden="true" />
          {isActive && hovered && <div className="prompt"><span className="keycap">E</span><strong>{targetForButton(hovered)}</strong></div>}
          {message && isActive && <div className="toast-note" role="status" data-testid="text-game-message">{message}</div>}
          <div className="bottom-hud">
            <div className="hint-line">
              <kbd>W A S D</kbd><span>move</span><kbd>MOUSE</kbd><span>look</span><kbd>E</kbd><span>inspect</span>
            </div>
            <div className="progress" aria-label="Puzzle progress">
              {progress.map((done, index) => <span key={index} className={`progress-dot${done ? ' done' : ''}`} />)}
              <span className="progress-label">{puzzle.complete ? 'room un-roomed' : 'the plan'}</span>
            </div>
          </div>
          {puzzle.hasRemote && isActive && (
            <button className="inventory-remote" type="button" data-testid="button-use-remote" onClick={() => runAction('activate-remote')}>
              <span className="remote-dot" /> Remote <span className="inventory-key">CLICK</span>
            </button>
          )}
          {isActive && !puzzle.complete && (
            <button className="hint-button" type="button" aria-label="Show hint" data-testid="button-hint" onClick={() => setShowHint((visible) => !visible)}>
              <Eye size={14} /> {showHint ? 'Hide hint' : 'Need a hint?'}
            </button>
          )}
          {isActive && showHint && <div className="hint-card" role="status">{getHint(puzzle)}</div>}
          {isActive && (
            <button className="journal-button" type="button" aria-expanded={showJournal} aria-controls="field-notes" onClick={() => setShowJournal((visible) => !visible)}>
              <BookOpen size={14} /> Field notes <span>{puzzle.inspected.length}/5</span>
            </button>
          )}
          {isActive && showJournal && (
            <aside className="journal-card" id="field-notes" aria-label="Room field notes">
              <div className="journal-heading"><div><small>OBSERVATION LOG</small><strong>Things that are definitely normal</strong></div><button type="button" aria-label="Close field notes" onClick={() => setShowJournal(false)}>×</button></div>
              <p className="journal-summary">{puzzle.inspected.length === 5 ? 'All five oddities documented. You are either thorough or avoiding the exit.' : `${5 - puzzle.inspected.length} ${5 - puzzle.inspected.length === 1 ? 'oddity remains' : 'oddities remain'} to investigate.`}</p>
              <ul>{fieldNotes.map((entry) => {
                const found = puzzle.inspected.includes(entry.target);
                return <li key={entry.target} className={found ? 'note-found' : ''}><span className="note-mark">{found ? '✓' : '·'}</span><div><strong>{found ? entry.title : '??? — Unconfirmed oddity'}</strong><p>{found ? entry.note : 'Look around and inspect something suspicious.'}</p></div></li>;
              })}</ul>
            </aside>
          )}

          {overlay && (
            <div className="overlay">
              {screen === 'settings' ? (
                <div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="settings-title">
                  <div className="dialog-kicker">Make yourself at home</div>
                  <h2 id="settings-title">Settings</h2>
                  <p>Fine-tune the room. It will pretend not to notice.</p>
                  <label className="settings-row"><span>Look speed</span><input type="range" min=".4" max="2" step=".1" value={sensitivity} onChange={(event) => changeSensitivity(Number(event.target.value))} data-testid="input-sensitivity" /><span className="settings-value">{sensitivity.toFixed(1)}×</span></label>
                  <label className="settings-row"><span>Sound level</span><input type="range" min="0" max="1" step=".01" value={volume} onChange={(event) => changeVolume(Number(event.target.value))} data-testid="input-volume" /><span className="settings-value">{Math.round(volume * 100)}%</span></label>
                  <div className="dialog-buttons"><button type="button" className="primary-button" data-testid="button-settings-done" onClick={() => setScreen(previousScreen)}><Check size={15} /> All set</button></div>
                </div>
              ) : screen === 'title' ? (
                <div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="title-heading">
                  <div className="dialog-kicker">A very small mystery</div>
                  <h2 id="title-heading">The room<br />is weird.</h2>
                  <p>Find the remote. Turn the room on its head. Get out before the furniture starts asking questions.</p>
                  <div className="dialog-buttons">
                    <button className="primary-button" type="button" data-testid="button-start" onClick={startGame}>Step inside <ArrowRight size={16} /></button>
                    <button className="secondary-button" type="button" data-testid="button-title-settings" onClick={() => { setPreviousScreen('title'); setScreen('settings'); }}><Settings2 size={15} /> Settings</button>
                  </div>
                  <div className="title-controls"><span><kbd>WASD</kbd> move</span><span><kbd>MOUSE</kbd> look</span><span><kbd>E</kbd> inspect</span></div>
                </div>
              ) : screen === 'paused' ? (
                <div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="pause-heading">
                  <div className="dialog-kicker">Take your time</div>
                  <h2 id="pause-heading">Paused.</h2>
                  <p>The room is holding its breath. It has been doing that for a while.</p>
                  <div className="dialog-buttons">
                    <button className="primary-button" type="button" data-testid="button-resume" onClick={pauseGame}><Play size={15} /> Back to it</button>
                    <button className="secondary-button" type="button" data-testid="button-pause-restart" onClick={restartGame}><RotateCcw size={15} /> Start over</button>
                  </div>
                </div>
              ) : screen === 'complete' ? (
                <div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="complete-heading">
                  <div className="dialog-kicker">A successful escape, technically</div>
                  <h2 id="complete-heading">You got out.</h2>
                  <p>The plants applaud. The room looks exactly like the room next door. They seem nice, though.</p>
                  <div className="dialog-buttons">
                    <button className="primary-button" type="button" data-testid="button-replay" onClick={restartGame}><RotateCcw size={15} /> Play again</button>
                    <button className="secondary-button" type="button" data-testid="button-complete-close" onClick={() => setScreen('playing')}><X size={15} /> Look around</button>
                  </div>
                  <div className="completion-stamp"><Check size={14} /> ROOM SUCCESSFULLY UN-ROOMED</div>
                </div>
              ) : null}
            </div>
          )}
        </section>
        <div className="footer-bar">
          <span><strong>Take it slow.</strong> The room is not going anywhere.</span>
          <span>Somewhere between ordinary and not</span>
        </div>
      </main>
    </div>
  );
}

export default App;
