import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronDown, ChevronUp, Pause, Play, Repeat, Volume2, VolumeX } from 'lucide-react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';

const SCENE_DETAILS: Record<string, { title: string; filePath: string }> = {
  opening: { title: 'Your campus, connected', filePath: 'src/components/video/video_scenes/Scene1.tsx' },
  gist: { title: 'Campus Gist', filePath: 'src/components/video/video_scenes/Scene2.tsx' },
  shuttle: { title: 'Shuttle updates', filePath: 'src/components/video/video_scenes/Scene3.tsx' },
  market: { title: 'Student marketplace', filePath: 'src/components/video/video_scenes/Scene4.tsx' },
  study: { title: 'Planning and WAZOBIA', filePath: 'src/components/video/video_scenes/Scene5.tsx' },
  finale: { title: 'CampusX', filePath: 'src/components/video/video_scenes/Scene6.tsx' },
};

function formatTime(ms: number) {
  const n = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

const PROGRESS_TICK_MS = 60;

function PlaybackStatus({ sceneKeys, activeIndex, activeDuration, activeStartTime, totalDuration, tick, paused, onJumpTo }: {
  sceneKeys: string[]; activeIndex: number; activeDuration: number; activeStartTime: number;
  totalDuration: number; tick: number; paused: boolean; onJumpTo: (index: number) => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const elapsedBaseRef = useRef(0);
  useEffect(() => { setElapsed(0); elapsedBaseRef.current = 0; }, [tick]);
  useEffect(() => {
    if (paused) return;
    const start = performance.now();
    const id = window.setInterval(() => setElapsed(elapsedBaseRef.current + performance.now() - start), PROGRESS_TICK_MS);
    return () => { window.clearInterval(id); elapsedBaseRef.current += performance.now() - start; };
  }, [tick, paused]);
  const progress = activeDuration > 0 ? Math.min(1, elapsed / activeDuration) : 0;
  const totalElapsed = Math.min(totalDuration, activeStartTime + Math.min(elapsed, activeDuration));
  return <>
    <div className="flex-1 flex items-center gap-1.5">
      {sceneKeys.map((key, i) => <button key={key} onClick={() => onJumpTo(i)}
        className="flex-1 h-3 bg-white/20 rounded-full overflow-hidden cursor-pointer hover:h-4 hover:bg-white/25 transition-all relative min-h-[12px]"
        aria-label={`Jump to scene ${i+1}: ${SCENE_DETAILS[key]?.title ?? key}`} aria-current={i === activeIndex ? 'true' : undefined}>
        <span className="absolute inset-y-0 left-0 bg-white/90 rounded-full transition-[width] duration-100" style={{ width: `${i === activeIndex ? progress*100 : 0}%` }} />
      </button>)}
    </div>
    <div className="text-xl text-white/60 font-mono tabular-nums shrink-0">{activeIndex + 1}/{sceneKeys.length}</div>
    <div className="min-w-[11ch] text-right text-xl text-white/80 font-mono tabular-nums shrink-0" role="timer" aria-label={`Playback time ${formatTime(totalElapsed)} of ${formatTime(totalDuration)}`}>
      {formatTime(totalElapsed)} / {formatTime(totalDuration)}
    </div>
  </>;
}

export default function VideoWithControls() {
  const isIframed = typeof window !== 'undefined' && window.self !== window.top;
  const {
    sceneKeys, activeIndex, locked, paused, mountKey, tick, durations,
    activeDuration, activeStartTime, totalDuration, onSceneChange, jumpTo, toggleLock, togglePause,
  } = useSceneControls(SCENE_DURATIONS);
  const [muted, setMuted] = useState(false);
  const sensorRef = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [tapPinned, setTapPinned] = useState(false);

  const handleJumpTo = useCallback((index: number) => {
    jumpTo(index);
    const key = sceneKeys[index];
    const details = SCENE_DETAILS[key];
    if (details?.filePath) {
      window.parent.postMessage({ type: 'REPLIT_VIDEO_SCENE_SELECTED', payload: {
        sceneIndex: index, sceneCount: sceneKeys.length, sceneTitle: details.title,
        filePath: details.filePath, lineNumber: 1,
      }}, '*');
    }
  }, [jumpTo, sceneKeys]);
  useEffect(() => {
    if (!paused) return;
    const frozen = document.getAnimations().filter(animation => animation.playState === 'running');
    frozen.forEach(animation => animation.pause());
    return () => frozen.forEach(animation => animation.play());
  }, [paused]);
  useEffect(() => {
    if (!(collapsed && tapPinned)) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      if (sensorRef.current && !sensorRef.current.contains(e.target as Node)) setTapPinned(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [collapsed, tapPinned]);
  const onPointerEnter = useCallback((e: ReactPointerEvent<HTMLDivElement>) => { if (e.pointerType === 'mouse') setHovering(true); }, []);
  const onPointerLeave = useCallback((e: ReactPointerEvent<HTMLDivElement>) => { if (e.pointerType === 'mouse') setHovering(false); }, []);
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => { if (e.pointerType !== 'mouse' && collapsed) setTapPinned(true); }, [collapsed]);
  const toggleCollapsed = useCallback(() => setCollapsed(c => { if (!c) { setHovering(false); setTapPinned(false); } return !c; }), []);
  const barVisible = !collapsed || hovering || tapPinned;

  if (!isIframed) return <VideoTemplate />;
  return <div className="relative w-full h-screen">
    <VideoTemplate key={mountKey} durations={durations} loop paused={paused} muted={muted} onSceneChange={onSceneChange} />
    <div ref={sensorRef} className="absolute bottom-0 left-0 right-0 z-50 flex flex-col justify-end" style={{ height: '25%' }}
      onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} onPointerDown={onPointerDown}>
      <div className="flex-1 w-full" aria-hidden="true" />
      <div aria-hidden={!barVisible} className={`flex items-center gap-3 bg-black/70 backdrop-blur-sm px-5 py-4 transition-all duration-200 ease-out ${barVisible ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-full opacity-0 pointer-events-none'}`}>
        <button onClick={togglePause} title={paused ? 'Play' : 'Pause'} aria-label={paused ? 'Play' : 'Pause'} className="w-14 h-14 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-lg shrink-0">{paused ? <Play className="w-8 h-8" /> : <Pause className="w-8 h-8" />}</button>
        <button onClick={toggleLock} title={locked ? 'Loop current scene: on' : 'Loop current scene: off'} aria-label={locked ? 'Loop current scene: on' : 'Loop current scene: off'} aria-pressed={locked} className={`w-14 h-14 flex items-center justify-center rounded-lg shrink-0 ${locked ? 'text-white bg-white/15' : 'text-white/70 hover:text-white hover:bg-white/10'}`}><Repeat className="w-8 h-8" /></button>
        <button onClick={() => setMuted(v => !v)} title={muted ? 'Unmute' : 'Mute'} aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={muted} className="w-14 h-14 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-lg shrink-0">{muted ? <VolumeX className="w-8 h-8" /> : <Volume2 className="w-8 h-8" />}</button>
        <div className="w-px self-stretch bg-white/15" aria-hidden="true" />
        <PlaybackStatus sceneKeys={sceneKeys} activeIndex={activeIndex} activeDuration={activeDuration} activeStartTime={activeStartTime} totalDuration={totalDuration} tick={tick} paused={paused} onJumpTo={handleJumpTo} />
        <button onClick={toggleCollapsed} title={collapsed ? 'Show controls' : 'Hide controls'} aria-label={collapsed ? 'Show controls' : 'Hide controls'} aria-expanded={!collapsed} className="w-14 h-14 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-lg shrink-0">{collapsed ? <ChevronUp className="w-10 h-10" /> : <ChevronDown className="w-10 h-10" />}</button>
      </div>
    </div>
  </div>;
}