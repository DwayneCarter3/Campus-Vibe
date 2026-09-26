import { motion } from 'framer-motion';
import { MapPin, Navigation2 } from 'lucide-react';
import { Eyebrow, FilmScene, Reveal, ease } from '../FilmArt';

export function Scene3() {
  return (
    <FilmScene className="shuttle-scene">
      <div className="map-grid" />
      <div className="shuttle-copy">
        <Eyebrow delay={.1}>02&nbsp; / &nbsp;CAMPUS MOVEMENT</Eyebrow>
        <Reveal delay={.4} className="feature-title white">MOVE<br />WITH</Reveal>
        <Reveal delay={1} className="feature-title gradient-text">YOUR<br />CAMPUS.</Reveal>
        <Reveal delay={2.9} className="support-line">Know what’s moving.</Reveal>
      </div>
      <div className="map-stage">
        <svg viewBox="0 0 720 690" className="route-svg" aria-hidden="true">
          <path d="M105 570 C115 390 235 485 240 335 S438 278 435 145 S565 75 605 135" stroke="white" strokeOpacity=".09" strokeWidth="49" fill="none" strokeLinecap="round" />
          <motion.path d="M105 570 C115 390 235 485 240 335 S438 278 435 145 S565 75 605 135" stroke="url(#route)" strokeWidth="17" fill="none" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 3.3, ease }} />
          <defs><linearGradient id="route" x1="105" y1="570" x2="605" y2="135" gradientUnits="userSpaceOnUse"><stop stopColor="#FF2E93" /><stop offset="1" stopColor="#FF6B00" /></linearGradient></defs>
          {[[105,570],[240,335],[435,145],[605,135]].map(([x,y],i) => <motion.circle key={i} cx={x} cy={y} r="18" fill="#fff" stroke="#FF2E93" strokeWidth="7" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: .5 + i*.65, type: 'spring', stiffness: 400 }} />)}
        </svg>
        <motion.div className="route-marker" initial={{ left: '15%', top: '80%', scale: .6, opacity: 0 }} animate={{ left: ['15%', '33%', '62%', '83%'], top: ['80%', '48%', '20%', '20%'], scale: 1, opacity: 1 }} transition={{ delay: .65, duration: 3, ease: 'easeInOut', times: [0,.35,.72,1] }}><Navigation2 size={30} fill="white" /></motion.div>
        <motion.div className="map-label" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.95 }}><MapPin size={20} /> SHUTTLE UPDATES</motion.div>
      </div>
      <span className="film-index">03 / 06</span>
    </FilmScene>
  );
}