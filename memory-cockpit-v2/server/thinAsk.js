// thinAsk.js — Path 2A S2: deterministic pack Q&A for any thin desk.
// No LLM, no web. Decision-support only. Missing pack → honest unavailable.
// Desk-specific topic filters live in config/thin-desks.json profile.ask.
import { loadPack } from './pack.js';
import { tryGetThinDeskBundle } from './thinDeskProfiles.js';

const REFUSAL =
  "I don't give buy/sell/hold advice, price targets, or position sizing. "
  + 'I can report state from the pack: house prior, graded claims, risks, sources, gaps.';

const ADVICE_RE = /\b(buy|sell|short|long more|trim|add to|position size|how many shares|price target|\bpt\b|should i (buy|sell)|overweight|underweight|entry)\b/i;

function match(q, ...needles) {
  const ql = q.toLowerCase();
  return needles.some((n) => ql.includes(n.toLowerCase()));
}

/**
 * @typedef {object} ThinAskProfile
 * @property {string} ticker
 * @property {string} displayName  short name for fallbacks (Nebius / Microsoft)
 * @property {string[]} houseConflictNeedles  if q has house/prior AND these, skip house route
 * @property {string[]} claimRouteNeedles     extra words that open claims route
 * @property {string[]} claimTopicNeedles     words that enable topic filter within claims
 * @property {RegExp} claimTopicRe
 * @property {RegExp} sourcePrimaryRe        filter catalog to "primary" about this name
 * @property {string[]} companyQuestionNeedles
 */

/**
 * @param {ThinAskProfile} profile
 * @returns {(question: string) => object}
 */
export function createThinAsk(profile) {
  const TICKER = String(profile.ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  const displayName = profile.displayName || TICKER;
  const houseConflict = profile.houseConflictNeedles || [];
  const claimRoute = profile.claimRouteNeedles || [];
  const claimTopic = profile.claimTopicNeedles || [];
  const claimTopicRe = profile.claimTopicRe || /./;
  const sourcePrimaryRe = profile.sourcePrimaryRe || /./;
  const companyQs = profile.companyQuestionNeedles || ['company', 'summary'];

  function header(pack) {
    return `**${TICKER}** · pack as of ${pack.compiled_at || '?'}\n\n`;
  }

  function finish(pack, q, answer, route) {
    return {
      available: true,
      ticker: TICKER,
      compiled_at: pack.compiled_at || null,
      question: q,
      answer,
      route,
      mode: 'pack-deterministic',
    };
  }

  return function ask(question) {
    const q = String(question || '').trim().slice(0, 500);
    const { available, pack, reason } = loadPack(TICKER);

    if (!q) {
      return {
        available: true,
        ticker: TICKER,
        compiled_at: available ? (pack.compiled_at || null) : null,
        question: '',
        answer: "Ask something about the book (e.g. \"what's on watch?\", \"house view\", \"list sources\").",
        route: 'empty',
      };
    }

    if (!available || !pack) {
      return {
        available: false,
        ticker: TICKER,
        compiled_at: null,
        question: q,
        answer: reason || `Pack unavailable — run ./ont compile ${TICKER}. We do not invent answers.`,
        route: 'unavailable',
        reason,
      };
    }

    if (ADVICE_RE.test(q)) {
      return {
        available: true,
        ticker: TICKER,
        compiled_at: pack.compiled_at || null,
        question: q,
        answer: header(pack) + REFUSAL,
        route: 'refusal',
      };
    }

    // --- house view ---
    if (
      match(q, 'house view', 'house prior', 'my prior', 'what do i believe', 'my view', 'how i think', 'stance')
      || (match(q, 'house', 'prior') && !match(q, ...houseConflict))
    ) {
      const hp = pack.house_prior || {};
      const lines = [header(pack).trimEnd(), ''];
      if (!hp.play && !hp.view_excerpt) {
        lines.push('Gap: no house_prior in pack.');
      } else {
        lines.push(`**House prior** — ${hp.play || '—'} (${hp.status || '—'} · ${hp.date || 'n.d.'})`);
        if (hp.view_excerpt) {
          const ex = String(hp.view_excerpt);
          lines.push(ex.length > 3500 ? `${ex.slice(0, 3500)}\n\n_…excerpt truncated — open House page for full vault text._` : ex);
        }
      }
      return finish(pack, q, lines.join('\n'), 'house');
    }

    // --- gaps ---
    if (match(q, 'gap', "don't have", 'do not have', 'unknown', 'missing data')) {
      const gaps = pack.gaps || [];
      const lines = [header(pack).trimEnd(), '', '**Gaps**'];
      if (!gaps.length) lines.push('- (none listed)');
      else gaps.forEach((g) => lines.push(`- ${typeof g === 'string' ? g : JSON.stringify(g)}`));
      return finish(pack, q, lines.join('\n'), 'gaps');
    }

    // --- risks / on watch ---
    if (match(q, 'risk', 'watch', 'tripwire', 'falsif', 'kill', 'unwind', 'what would change', 'on watch')) {
      const risks = pack.risks || [];
      const rs = pack.risk_summary || {};
      const lines = [
        header(pack).trimEnd(),
        '',
        `**Risks** — WATCH: ${(rs.watch || []).join(', ') || '—'}; FIRED: ${(rs.fired || []).join(', ') || '—'}`,
      ];
      const onlyWatch = match(q, 'on watch', "what's on watch", 'what is on watch') && !match(q, 'all risk', 'risk register', 'list risk');
      const list = onlyWatch
        ? risks.filter((r) => r.status === 'WATCH' || (rs.watch || []).includes(r.name))
        : risks;
      const show = list.length ? list : risks;
      for (const r of show) {
        const flag = r.houseview_trigger ? ' ★HV' : '';
        lines.push(`- **${r.name}** [${r.status}]${flag} — ${r.summary || ''}`);
        for (const tw of (r.tripwires || []).slice(0, 3)) {
          lines.push(
            `    · ${tw.signal || ''}: ${tw.tripwire || ''} [${tw.state || ''}] asof ${tw.as_of || '—'}`,
          );
        }
      }
      if (!show.length) lines.push('- (no risks in pack)');
      return finish(pack, q, lines.join('\n'), onlyWatch ? 'on_watch' : 'risks');
    }

    // --- claims / key facts ---
    if (
      match(q, 'claim', 'claims', 'key fact', 'evidence', 'revenue', ...claimRoute)
    ) {
      const claims = [...(pack.claims || [])];
      let ranked = claims;
      if (claimTopic.length && match(q, ...claimTopic)) {
        ranked = claims
          .filter((c) => claimTopicRe.test(c.text || ''))
          .sort((a, b) => (b.grade === 'A' ? 1 : 0) - (a.grade === 'A' ? 1 : 0));
        if (!ranked.length) ranked = claims;
      } else {
        ranked = [...claims].sort((a, b) => {
          const ga = a.grade === 'A' ? 0 : a.grade === 'B' ? 1 : 2;
          const gb = b.grade === 'A' ? 0 : b.grade === 'B' ? 1 : 2;
          return ga - gb;
        });
      }
      const lines = [header(pack).trimEnd(), '', '**Claims** (from pack · graded)'];
      for (const c of ranked.slice(0, 10)) {
        lines.push(`- [${c.grade || '—'}] (${c.as_of || '—'}) ${c.text || ''}${c.source_id ? ` · ${c.source_id}` : ''}`);
      }
      if (!ranked.length) lines.push('- (no claims in pack)');
      return finish(pack, q, lines.join('\n'), 'claims');
    }

    // --- sources catalog ---
    if (match(q, 'source', 'sources', 'research file', 'list research', 'catalog', 'what research')) {
      const sources = pack.sources || [];
      const lines = [header(pack).trimEnd(), '', `**Sources** (${sources.length} in pack · titles only)`];
      const primary = sources.filter((s) => {
        const blob = `${s.id || ''} ${s.title || ''} ${s.path || ''} ${(s.about || []).join(' ')}`.toLowerCase();
        return sourcePrimaryRe.test(blob);
      });
      const show = (primary.length ? primary : sources).slice(0, 20);
      for (const s of show) {
        lines.push(`- \`${s.id}\` — ${s.title || s.id}${s.n_lines != null ? ` (${s.n_lines} lines)` : ''}`);
      }
      if (sources.length > show.length) lines.push(`- _…${sources.length - show.length} more — open Sources page_`);
      if (!sources.length) lines.push('- (none)');
      lines.push(`\n_Glass Ask lists catalog only. Full open/search: \`./ont source ${TICKER} get <id>\`._`);
      return finish(pack, q, lines.join('\n'), 'sources');
    }

    // --- company one-liner ---
    if (match(q, ...companyQs)) {
      const obj = pack.object || {};
      const lines = [
        header(pack).trimEnd(),
        '',
        `**${obj.name || displayName} (${obj.ticker || TICKER})**`,
        obj.summary || '(no summary in pack)',
      ];
      return finish(pack, q, lines.join('\n'), 'company');
    }

    // --- series ---
    if (match(q, 'series', 'price', 'quote', 'chart data')) {
      const series = pack.series_snapshot || [];
      const lines = [header(pack).trimEnd(), '', '**Series snapshot**'];
      if (!series.length) {
        lines.push('- (none in pack — Phase 1–2 pack-only; live quote is on Overview, not series history)');
      } else {
        for (const s of series) {
          lines.push(s.error ? `- ${s.id}: (${s.error})` : `- ${s.id}: ${s.latest} as of ${s.as_of}`);
        }
      }
      return finish(pack, q, lines.join('\n'), 'series');
    }

    // --- fallback ---
    const obj = pack.object || {};
    const rs = pack.risk_summary || {};
    const lines = [
      header(pack).trimEnd(),
      '',
      '**Pack summary** (no specific route matched)',
      `- ${obj.name || displayName} (${obj.ticker || TICKER})`,
      `- House: ${(pack.house_prior || {}).status || '—'} · ${(pack.house_prior || {}).date || '—'}`,
      `- Risks: ${rs.count ?? (pack.risks || []).length} · WATCH: ${(rs.watch || []).length} · FIRED: ${(rs.fired || []).length}`,
      `- Claims: ${(pack.claims || []).length} · Sources: ${(pack.sources || []).length}`,
      '',
      'Try: **house view** · **what\'s on watch** · **risks** · **claims** · **list sources** · **gaps**',
    ];
    return finish(pack, q, lines.join('\n'), 'fallback');
  };
}

// Profiles live in config/thin-desks.json — re-export for legacy imports (null in empty kernel).
export const NBIS_ASK_PROFILE = tryGetThinDeskBundle('nbis')?.ask || null;
export const MSFT_ASK_PROFILE = tryGetThinDeskBundle('msft')?.ask || null;
