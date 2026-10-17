import './styles.css';
import { startRouter } from './router.js';
import { leaveAutotune } from './modes/autotune/autotune.js';

const TITLES = { home: 'Autotune', autotune: 'Autotune', dialekt: 'Dialektförvrängare' };

startRouter(document.body, (route, prev) => {
  // Release the mic and stop monitoring when leaving autotune.
  if (prev === 'autotune') leaveAutotune();
  document.title = TITLES[route];
});
