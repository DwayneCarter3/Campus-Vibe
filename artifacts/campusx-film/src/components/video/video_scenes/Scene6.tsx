import { motion } from 'framer-motion';
import { BrandLogo, FilmScene, Reveal, XMark, ease } from '../FilmArt';

const satellites = ['GIST', 'MOVE', 'MARKET', 'GROW'];

export function Scene6() {
  return (
    <FilmScene className="finale">
      <div className="finale-aura" />
      {satellites.map((label,i) => <motion.span key={label} className={`satellite satellite-${i}`} initial={{ opacity: 0, scale: .4 }} animate={{ opacity: [.0, .8, 0], scale: [.4, 1, .1], x: [0,0,i%2 ? -280 : 280], y: [0,0,i < 2 ? 180 : -180] }} transition={{ delay: .1+i*.18, duration: 1.6, ease }}>{label}</motion.span>)}
      <motion.div className="finale-headline" initial={{ opacity: 0, scale: 1.4, filter: 'blur(8px)' }} animate={{ opacity: [0,1,1,0], scale: [1.4,1,1, .7], filter: ['blur(8px)','blur(0px)','blur(0px)','blur(10px)'] }} transition={{ duration: 2.2, times: [0,.22,.65,1], ease }}>
        <span>ONE CAMPUS.</span><span className="gradient-text">EVERY CONNECTION.</span>
      </motion.div>
      <motion.div className="finale-logo" initial={{ opacity: 0, scale: .75 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.85, duration: .8, ease }}><BrandLogo width="60vmin" /></motion.div>
      <motion.p className="finale-tagline" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.5, duration: .65 }}>Campus life, connected.</motion.p>
      <motion.div className="finale-node" initial={{ scale: 0 }} animate={{ scale: [0,1,1.3,.2], opacity: [0,.7,.7,0] }} transition={{ delay: 2.4, duration: 2 }} />
      <span className="film-index">06 / 06</span>
    </FilmScene>
  );
}