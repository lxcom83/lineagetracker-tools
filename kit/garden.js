/* LT-Garden placeholder: just the shared top bar for now. */
import { loadConfig, $ } from './core.js';
import { topBar } from './bar.js';
loadConfig().then(() => $('#bar').replaceWith(topBar({ tool: 'garden' })));
