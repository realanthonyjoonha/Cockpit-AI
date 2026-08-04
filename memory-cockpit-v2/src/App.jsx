// App.jsx — thin-only company research OS for KERNEL / fresh start (no Memory desk).
// Live desk registry via GET /api/thin-desks (no rebuild when desks added).
// Unknown desk hashes → DeskUnknown (never silent redirect to START).
// Decision-support only. User gates house/risk ACCEPT.
import React, { useEffect, useMemo, useCallback } from 'react';
import Start from './pages/Start.jsx';
import DeskUnknown from './pages/DeskUnknown.jsx';
import DeskRouter from './pages/thin/DeskRouter.jsx';
import {
  useThinDesks,
  thinDeskBySlug,
  thinDeskById,
  thinRail,
  deskIdFromHash,
  hashHead,
} from './thinDesks.js';

const DESK_KEY = 'cockpitDeskKernel';

function useHash() {
  const [hash, setHash] = React.useState(window.location.hash || '#/start');
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || '#/start');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return hash;
}

function activeThinRoom(hash, slug) {
  if (hash.startsWith(`#/${slug}/risk/`)) return `#/${slug}/risks`;
  if (hash.startsWith(`#/${slug}/risks`)) return `#/${slug}/risks`;
  if (hash.startsWith(`#/${slug}/house`)) return `#/${slug}/house`;
  if (hash.startsWith(`#/${slug}/sources`)) return `#/${slug}/sources`;
  if (hash.startsWith(`#/${slug}/street`)) return `#/${slug}/street`;
  if (hash.startsWith(`#/${slug}/ask`)) return `#/${slug}/ask`;
  if (hash.startsWith(`#/${slug}/update`)) return `#/${slug}/update`;
  // Alias in hash still highlights correct rail
  return `#/${slug}/overview`;
}

function isStartHash(hash) {
  return !hash || hash === '#' || hash === '#/'
    || hash.startsWith('#/start') || hash.startsWith('#/begin');
}

export default function App() {
  const hash = useHash();
  const { desks, refresh } = useThinDesks();

  const head = hashHead(hash);

  const thinActive = useMemo(() => {
    if (isStartHash(hash)) return null;
    return thinDeskBySlug(desks, head);
  }, [hash, desks, head]);

  // Unknown desk path (e.g. #/tsmc when slug is tsm and no alias) — do NOT bounce to START
  const unknownDesk = !isStartHash(hash) && !thinActive && !!head;

  useEffect(() => {
    const d = deskIdFromHash(hash, desks);
    try {
      localStorage.setItem(DESK_KEY, thinActive ? d : (unknownDesk ? `unknown:${head}` : 'start'));
    } catch { /* */ }
  }, [hash, desks, thinActive, unknownDesk, head]);

  // When alias is used in URL, rewrite to canonical slug (keeps bookmarks clean)
  useEffect(() => {
    if (!thinActive || !head) return;
    if (head === thinActive.slug) return;
    // head matched via alias → normalize hash to canonical slug
    const rest = hash.replace(/^#\/[^/]+/, `#/${thinActive.slug}`);
    if (rest !== hash) window.location.replace(rest);
  }, [thinActive, head, hash]);

  const switchDesk = useCallback((next) => {
    if (next === 'start') {
      window.location.hash = '#/start';
      return;
    }
    const td = thinDeskById(desks, next);
    if (td) window.location.hash = `#/${td.slug}/overview`;
    else window.location.hash = '#/start';
  }, [desks]);

  const route = hash.replace(/^#\//, '');
  // When alias was in hash, DeskRouter needs canonical route string
  const routeCanonical = thinActive
    ? route.replace(new RegExp(`^${head}`), thinActive.slug)
    : route;

  const onStart = isStartHash(hash) && !thinActive && !unknownDesk;

  let page;
  if (thinActive) {
    page = <DeskRouter desk={thinActive} route={routeCanonical} />;
  } else if (unknownDesk) {
    page = (
      <DeskUnknown
        tried={head}
        desks={desks}
        onGoStart={() => { window.location.hash = '#/start'; }}
        onGoDesk={(slug) => { window.location.hash = `#/${slug}/overview`; }}
      />
    );
  } else {
    page = <Start desks={desks} onRefreshDesks={refresh} />;
  }

  const START_RAIL = [['◎', 'Start — shell / underwrite', '#/start']];
  const rail = thinActive ? thinRail(thinActive) : START_RAIL;
  const active = thinActive ? activeThinRoom(hash, thinActive.slug) : '#/start';

  const brand = thinActive
    ? (
      <>
        <span className="mark">{thinActive.mark || thinActive.label[0]}</span>
        {' '}{thinActive.label}{' '}
        <span className="rev">· {thinActive.ticker} · PACK</span>
      </>
    )
    : unknownDesk
      ? (
        <>
          <span className="mark">?</span> COCKPIT{' '}
          <span className="rev">· DESK NOT FOUND</span>
        </>
      )
      : (
        <>
          <span className="mark">◎</span> COCKPIT{' '}
          <span className="rev">· START · NO COMPANY YET</span>
        </>
      );

  return (
    <>
      <div className="top">
        <div className="logo">{brand}</div>
        <div className="desk-switch" role="group" aria-label="Desk">
          <button
            type="button"
            className={`desk-btn${onStart ? ' on' : ''}`}
            onClick={() => switchDesk('start')}
            title="Cold start — product ready, underwrite next company"
          >
            START
          </button>
          {desks.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`desk-btn${thinActive?.id === d.id ? ' on' : ''}`}
              onClick={() => switchDesk(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>
        {onStart && (
          <div className="synced">SHELL READY · PICK COMPANY TO UNDERWRITE</div>
        )}
        {thinActive && (
          <div className="synced">PACK · COMPILE BOOK after research</div>
        )}
        {unknownDesk && (
          <div className="synced">UNKNOWN DESK · SEE SUGGESTIONS</div>
        )}
      </div>
      <div className="shell">
        <div className="rail">
          {rail.map(([glyph, title, href]) => (
            <div
              key={href}
              className={`ric${active === href ? ' on' : ''}`}
              title={title}
              onClick={() => { window.location.hash = href; }}
            >
              {glyph}
            </div>
          ))}
        </div>
        <main>
          <div key={thinActive?.slug || (unknownDesk ? `unk-${head}` : 'start')}>{page}</div>
        </main>
      </div>
    </>
  );
}
