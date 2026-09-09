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
    this.el = h('div.page');
    this.el.append(
      h('div', { style: { textAlign: 'center', padding: 'var(--s8) 0 var(--s5)' } },
        h('div', {
          style: {
            width: '78px', height: '78px', margin: '0 auto var(--s5)',
            borderRadius: 'var(--r-xl)', display: 'grid', placeItems: 'center',
            background: 'var(--accent-wash)', border: '1px solid var(--hairline)',
            boxShadow: 'var(--shadow-3), var(--inner-top)', color: 'var(--accent-bright)',
          },
        }, svg(ICON.pin, { size: 38 })),
        h('h1', { style: { font: 'var(--t-hero)', letterSpacing: 'var(--ls-title)' }, text: "Ted's Route" }),
        h('p', { class: 'muted', style: { font: 'var(--t-body)', marginTop: 'var(--s3)', maxWidth: '32ch', margin: 'var(--s3) auto 0' },
          text: 'Load your route once. After that it lives on this phone and works with no signal.' })
      ),

      h('section.card', null,
        h('div.card-head', null, h('span.card-title', { text: 'Recommended' })),
        h('h3', { style: { font: 'var(--t-title2)' }, text: 'Restore your route file' }),
        h('p', { class: 'muted', style: { font: 'var(--t-label)', margin: 'var(--s2) 0 var(--s4)' },
          text: 'Pick the backup file from Files or iCloud. It is checked and summarised before anything is written.' }),
        h('button.btn.primary', { type: 'button', style: { width: '100%' }, onclick: () => this.pick() },
          svg(ICON.upload, { size: 20 }), 'Choose backup file')
      ),

      h('section.card', null,
        h('h3', { style: { font: 'var(--t-title2)' }, text: 'Try it with demo data' }),
        h('p', { class: 'muted', style: { font: 'var(--t-label)', margin: 'var(--s2) 0 var(--s4)' },
          text: '32 invented properties around Barrie with six weeks of made-up history, so every feature works immediately. You can erase it later in one tap.' }),
        h('button.btn.ghost', { type: 'button', style: { width: '100%' }, onclick: () => this.demo() },
          svg(ICON.bolt, { size: 19 }), 'Load demo route')
      ),

      h('p', { class: 'muted', style: { font: 'var(--t-label)', textAlign: 'center', padding: 'var(--s5)' },
        text: 'Your addresses are never uploaded anywhere. They are stored only in this browser on this device.' })
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
