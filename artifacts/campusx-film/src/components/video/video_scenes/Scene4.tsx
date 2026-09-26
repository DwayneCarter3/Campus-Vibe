import { motion } from 'framer-motion';
import { BookOpen, Headphones, LampDesk } from 'lucide-react';
import { Eyebrow, FilmScene, Reveal, ease } from '../FilmArt';

const goods = [
  { title: 'Textbooks', kind: 'books', Icon: BookOpen, color: '#f6c8db', rotate: '-8deg', delay: .45 },
  { title: 'Room essentials', kind: 'lamp', Icon: LampDesk, color: '#ffe3bc', rotate: '6deg', delay: .85 },
  { title: 'Electronics', kind: 'audio', Icon: Headphones, color: '#dfd7fa', rotate: '-3deg', delay: 1.25 },
];

export function Scene4() {
  return (
    <FilmScene light className="market-scene">
      <div className="market-outline">EXCHANGE</div>
      <div className="market-heading">
        <Eyebrow delay={.15}>03&nbsp; / &nbsp;THE STUDENT MARKETPLACE</Eyebrow>
        <Reveal delay={.23} className="market-title ink">FIND IT.</Reveal>
        <Reveal delay={.79} className="market-title pink">PASS IT ON.</Reveal>
      </div>
      <div className="product-array">
        {goods.map(({ title, Icon, color, rotate, delay, kind }, i) => (
          <motion.div key={title} className={`product-tile ${kind}`} style={{ backgroundColor: color, rotate }} initial={{ scale: .3, opacity: 0, y: 130 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: i === 0 ? 2.2 : .65, opacity: 0, y: i === 0 ? 50 : 150 }} transition={{ duration: .75, delay, ease }}>
            <Icon className="product-icon" strokeWidth={1.3} />
            <span className="product-label">{title}</span>
            <span className="product-corner">CX / {String(i+1).padStart(2,'0')}</span>
          </motion.div>
        ))}
      </div>
      <Reveal delay={3.15} className="market-caption">Made for campus life.</Reveal>
      <span className="film-index dark-index">04 / 06</span>
    </FilmScene>
  );
}