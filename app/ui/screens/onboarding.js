/**
 * First run.
 *
 * The route list is customer data and this app is served from a public static
 * host with no sign-in of any kind, so the addresses are deliberately not in
 * the bundle. The operator restores them once from a file they hold, using the
 * same validated code path as any other restore — one path, one set of checks,
 * one thing to trust.
 */

import { h, svg, ICON } from '../dom.js';
import { inspect } from '../../data/backup.js';
import { toast } from '../toast.js';
import { haptic } from '../motion/haptics.js';

export class OnboardingScreen {
  constructor(ctx) { this.ctx = ctx; }

  mount(container) {
    // No icon badge over two option cards. The first screen states what the
    // app is in the same voice every later screen speaks in — an eyebrow, one
    // sentence at display size, and the one key worth pressing.
    this.el = h('div.page.firstrun');
    this.el.append(
      h('header.firstrun-head', null,
        h('div.masthead-eyebrow', { text: "Ted's Route" }),
        h('h1.firstrun-line', { text: 'Your route lives on this phone.' }),
        h('p.prose', { text: 'Load it once from your backup file. After that it works with no signal, '
          + 'and nothing in it is ever uploaded anywhere.' })),

      h('section.seam', null,
        h('button.act.act-done', { type: 'button', onclick: () => this.pick() },
          svg(ICON.upload, { size: 20 }), 'Choose backup file'),
        h('p.prose', { text: 'The file is checked and summarised before a single record on this device is touched. A damaged or foreign file is refused outright.' })),

      h('section.seam', null,
        h('div.seam-lab', { text: 'No file to hand' }),
        h('p.prose', { text: '32 invented properties around Barrie with six weeks of made-up history, so every part of the app works straight away. Erasable later in one tap.' }),
        h('button.link.go', { type: 'button', text: 'Load the demo route instead', onclick: () => this.demo() })),

      h('p.prose.firstrun-foot', { text: 'Your addresses are stored only in this browser, on this device.' })
    );
    container.appendChild(this.el);
    return this.el;
  }

  unmount() { this.el?.remove(); }
  update() {}

  pick() {
    const input = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      const report = await inspect(file);
      this.ctx.showRestoreReport(report);
    });
    document.body.appendChild(input);
    input.click();
  }

  async demo() {
    haptic('tap');
    await this.ctx.loadDemo();
    toast({ title: 'Demo route loaded', body: '32 invented properties with six weeks of history.' });
  }
}
