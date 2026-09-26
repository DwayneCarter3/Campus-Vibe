import { motion } from 'framer-motion';
import { BookText, GraduationCap, TrendingUp, Sparkles } from 'lucide-react';
import { Eyebrow, FilmScene, Reveal, ease } from '../FilmArt';

const cells = [{ label: 'Courses', Icon: BookText }, { label: 'Goals', Icon: GraduationCap }, { label: 'Progress', Icon: TrendingUp }];

export function Scene5() {
  return (
    <FilmScene className="study-scene">
      <div className="study-spot" />
      <div className="study-heading">
        <Eyebrow delay={.1}>04&nbsp; / &nbsp;THE NEXT CHAPTER</Eyebrow>
        <Reveal delay={.28} className="feature-title white">PLAN THE<br />NEXT MOVE.</Reveal>
        <Reveal delay={1.1} className="support-line">ACADEMIC PLANNING</Reveal>
      </div>
      <div className="study-grid">
        {cells.map(({ label, Icon }, i) => <motion.div key={label} className="study-cell" initial={{ scale: .4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: .35 + i*.35, duration: .65, ease }}><Icon size={42} color="#ff2e93" strokeWidth={1.5} /><span>{label}</span></motion.div>)}
        <motion.div className="study-cell progress-cell" initial={{ scale: .4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.35 }}><div className="progress-ring"><b>↗</b></div></motion.div>
      </div>
      <motion.div className="wazobia-bubble" initial={{ scale: 0, rotate: -25, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 2.2, opacity: 0 }} transition={{ delay: 2, duration: .65, ease }}>
        <div className="wazobia-tag"><Sparkles size={20} /> ASK WAZOBIA</div>
        <motion.div className="wazobia-answer" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.85 }}>How can I help?</motion.div>
      </motion.div>
      <span className="film-index">05 / 06</span>
    </FilmScene>
  );
}