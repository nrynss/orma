"""Generates the Orma app design artboards (.dc.html) and canvas.json.

Run: python3 build.py. Every artboard shares one token sheet and one set of
sample data, so the numbers agree across screens.
"""
import json
from pathlib import Path

OUT = Path(__file__).parent

FONTS = (
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
    'family=Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..700'
    '&amp;family=Source+Code+Pro:wght@400;500&amp;display=swap">'
)

CSS = """
html, body { margin: 0; background: #fbfaf8; }
body.dark-body { background: #14130f; }
a { color: #7a5283; text-underline-offset: 3px; }
a:hover { color: #7a5283; text-decoration-thickness: 2px; }
.o {
  --paper: #fbfaf8; --ink: #22201c; --muted: #716b61; --rule: #d8d2c6; --hair: #e6e1d7;
  --line: #948f83; --plum: #7a5283; --wash: #f6ecf8; --danger: #8a2b2b; --on-accent: #fbfaf8;
  background: var(--paper); color: var(--ink);
  font: 16px/1.6 'Source Serif 4', ui-serif, Georgia, 'Times New Roman', serif;
  font-optical-sizing: auto; font-variant-numeric: lining-nums tabular-nums;
  -webkit-font-smoothing: antialiased; box-sizing: border-box;
}
.o.dark {
  --paper: #14130f; --ink: #e8e4dc; --muted: #938c80; --rule: #3a352c; --hair: #2a2620;
  --line: #6e685e; --plum: #cfa7d8; --wash: #271e29; --danger: #e08a8a; --on-accent: #14130f;
}
.o *, .o *::before, .o *::after { box-sizing: border-box; }
.o a { color: var(--plum); }
.o p { margin: 0; text-wrap: pretty; }
.o h1 { font-size: 2rem; line-height: 1.15; margin: 0; letter-spacing: -0.01em; font-weight: 600; }
.o h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 0; font-weight: 600; }
.mono { font-family: 'Source Code Pro', ui-monospace, 'SFMono-Regular', Menlo, monospace; font-size: 0.8rem; letter-spacing: 0; }
.muted { color: var(--muted); }
.gloss { color: var(--muted); font-size: 0.95rem; }
.lede { font-size: 1.2rem; line-height: 1.5; }
.label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; }
.stack { display: flex; flex-direction: column; }
.rowx { display: flex; align-items: center; }
.hair { border-top: 1px solid var(--hair); }
.btn { font: inherit; font-size: 0.95rem; font-weight: 500; min-height: 44px; padding: 0 1.1rem; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; border: 1px solid transparent; cursor: pointer; white-space: nowrap; text-decoration: none; }
.btn-primary { background: var(--plum); color: var(--on-accent); }
.btn-secondary { background: transparent; color: var(--ink); border-color: var(--line); }
.btn-danger { background: var(--danger); color: var(--on-accent); }
.btn-text { background: transparent; color: var(--plum); padding: 0 0.5rem; min-width: 44px; }
.field { display: flex; flex-direction: column; gap: 0.35rem; }
.field-label { font-size: 0.95rem; font-weight: 600; }
.input { font: inherit; min-height: 44px; padding: 0 0.75rem; border: 1px solid var(--line); border-radius: 4px; background: var(--paper); color: var(--ink); display: flex; align-items: center; }
.input.focus { outline: 2px solid var(--plum); outline-offset: 2px; }
.hint { font-size: 0.9rem; color: var(--muted); line-height: 1.5; }
.tag { font-family: 'Source Code Pro', ui-monospace, monospace; font-size: 0.7rem; letter-spacing: 0.02em; padding: 0.05rem 0.4rem; border: 1px solid var(--line); border-radius: 3px; color: var(--muted); white-space: nowrap; }
.tag-plum { border-color: var(--plum); color: var(--plum); }
.wash { background: var(--wash); border-radius: 6px; }
.mood { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; color: var(--muted); }
.mood i { width: 8px; height: 8px; border-radius: 50%; background: var(--plum); display: inline-block; }
.mood i.none { background: transparent; border: 1.5px solid var(--line); }
.turn { display: grid; grid-template-columns: 3rem 3.6rem minmax(0, 1fr); gap: 0.25rem 0.5rem; padding: 0.3rem 0.5rem; border-radius: 4px; align-items: baseline; }
.turn .who { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.turn.mark { background: var(--wash); }
.dot-live { width: 10px; height: 10px; border-radius: 50%; background: var(--plum); box-shadow: 0 0 0 4px var(--wash); display: inline-block; flex: none; }
.nav a { color: var(--ink); text-decoration: none; min-height: 44px; display: flex; align-items: center; }
.nav a.on { color: var(--plum); font-weight: 600; }
.switch { width: 40px; height: 24px; border-radius: 12px; border: 1px solid var(--line); position: relative; flex: none; }
.switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--line); }
.switch.on { background: var(--plum); border-color: var(--plum); }
.switch.on::after { left: 19px; background: var(--on-accent); }
"""

NAV = ["Today", "Items", "History", "Patterns", "Timeline", "Settings"]
PHONE_MASKED = "+91 98&#8226;&#8226;&#8226; &#8226;&#8226;321"


def dc(body, dark=False, css=""):
    cls = "o dark" if dark else "o"
    body_cls = ' class="dark-body"' if dark else ""
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body{body_cls}>
<x-dc>
<helmet>
  {FONTS}
  <style>{CSS}{css}</style>
</helmet>
<div class="{cls}">
{body}
</div>
</x-dc>
</body>
</html>
"""


def svg_check():
    return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"></path></svg>'


def svg_chevron():
    return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5l4.5 4.5L6 12.5"></path></svg>'


def svg_down():
    return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 6l4.5 4.5L12.5 6"></path></svg>'


def svg_send():
    return '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 2.5L9 11"></path><path d="M17.5 2.5L12 17.5l-3-6.5-6.5-3z"></path></svg>'


# ---------- shells ----------

def phone(active, content, dark=False):
    links = "".join(
        f'<a class="{"on" if n == active else ""}" style="padding: 0 0.1rem; {"border-bottom: 2px solid var(--plum);" if n == active else "border-bottom: 2px solid transparent;"}">{n}</a>'
        for n in NAV
    )
    body = f"""<div style="width: 390px; min-height: 844px; display: flex; flex-direction: column;">
  <header style="padding: 1.25rem 1.5rem 0; display: flex; flex-direction: column; gap: 0.25rem;">
    <div class="rowx" style="justify-content: space-between;">
      <div style="font-size: 1.35rem; font-weight: 600; letter-spacing: -0.01em;">Orma</div>
      <span class="muted" style="font-size: 0.85rem;">Narayan</span>
    </div>
    <nav class="nav rowx" style="gap: 1.25rem; overflow: hidden; white-space: nowrap; font-size: 0.95rem; border-bottom: 1px solid var(--hair);">{links}</nav>
  </header>
  <main style="padding: 1.75rem 1.5rem 3rem; display: flex; flex-direction: column; gap: 2.25rem;">
{content}
  </main>
</div>"""
    return dc(body, dark)


def desktop(active, content, wide=False):
    links = "".join(
        f'<a class="{"on" if n == active else ""}" style="padding: 0 0.75rem; border-radius: 4px; {"background: var(--wash);" if n == active else ""}">{n}</a>'
        for n in NAV
    )
    width = "46rem" if wide else "38rem"
    body = f"""<div style="width: 1440px; min-height: 900px; display: grid; grid-template-columns: 248px minmax(0, 1fr);">
  <aside style="border-right: 1px solid var(--hair); padding: 2.5rem 1.25rem; display: flex; flex-direction: column; gap: 2rem;">
    <div style="padding: 0 0.75rem;">
      <div style="font-size: 1.6rem; font-weight: 600; letter-spacing: -0.02em;">Orma</div>
      <p class="gloss" style="font-size: 0.85rem;">&#3363;&#3374;&#3405;&#3374; &#183; it remembers</p>
    </div>
    <nav class="nav stack" style="gap: 0.1rem;">{links}</nav>
    <div style="margin-top: auto; padding: 0 0.75rem;" class="stack">
      <span style="font-size: 0.9rem;">Narayan</span>
      <a style="font-size: 0.85rem;">Sign out</a>
    </div>
  </aside>
  <main style="padding: 3.5rem 4rem 5rem;">
    <div style="max-width: {width}; display: flex; flex-direction: column; gap: 2.5rem;">
{content}
    </div>
  </main>
</div>"""
    return dc(body)


def bare(content, w, h):
    return dc(f'<div style="width: {w}px; min-height: {h}px; display: flex; flex-direction: column; align-items: center;">{content}</div>')


# ---------- sample data ----------

OPEN_ITEMS = [
    ("Call Amma", "4 mentions &#183; 9 days", "committed: tonight"),
    ("Renew the passport", "2 mentions &#183; 12 days", None),
    ("Renew the car insurance", "1 mention &#183; added today", "from the call"),
    ("Reply to the landlord", "1 mention &#183; 5 days", "from Telegram"),
    ("Fix the bike brakes", "No mentions yet &#183; 3 days", "from Telegram"),
]

TURNS = [
    ("0:00", "Orma", "Hello. This is Orma.", False),
    ("0:02", "You", "Hello.", False),
    ("0:03", "Orma", "Can you hear me?", False),
    ("0:05", "You", "Yes.", False),
    ("0:06", "Orma", "You've mentioned the dentist three times. It's been 34 days.", False),
    ("0:12", "You", "Kill it. I'm never doing that.", True),
    ("0:15", "Orma", "Done. It's gone.", False),
    ("0:18", "Orma", "The passport is still open, and so is calling Amma.", False),
    ("0:26", "You", "I'll call Amma tonight.", False),
    ("0:30", "Orma", "Anything new to capture?", False),
    ("0:33", "You", "Renew the car insurance.", False),
    ("0:37", "Orma", "Got it. Anything to let go of?", False),
    ("0:40", "You", "No, that's it.", False),
    ("0:42", "Orma", "Tomorrow at eight, then. Bye.", False),
]

MOODS = ["ok", "ok", "low", None, "ok", "ok", None, "low", "ok", "ok", "stressed", None, "low", "ok"]

CONSENT_TEXT = (
    f"Orma will phone {PHONE_MASKED} at the times you choose. Calls are placed "
    "through CALL-E, recorded and transcribed, so Orma can remember what you said. "
    "You can cancel a call, pause every call, or withdraw this consent at any time in Settings."
)


# ---------- screens ----------

def today_content():
    items = "".join(
        f"""<div class="stack" style="padding: 0.7rem 0; border-top: 1px solid var(--hair); gap: 0.1rem;">
  <span>{t}</span><span class="muted" style="font-size: 0.88rem;">{m}</span></div>"""
        for t, m, _ in OPEN_ITEMS[:4]
    )
    return f"""<section class="stack" style="gap: 0.4rem;">
  <span class="label">Monday 14 September</span>
  <h1>Today</h1>
</section>
<section class="wash stack" style="padding: 1.25rem 1.25rem 1rem; gap: 0.6rem;">
  <span class="label" style="color: var(--plum);">Next call</span>
  <div style="font-size: 1.9rem; line-height: 1.1; font-weight: 600;">Tomorrow, 08:00</div>
  <p class="hint">Asia/Kolkata. It comes from a number you won't recognise. Answer it anyway.</p>
  <div class="rowx" style="gap: 0.5rem; flex-wrap: wrap; margin-top: 0.25rem;">
    <a class="btn btn-secondary">Cancel this call</a>
    <a class="btn btn-text">Change time</a>
  </div>
</section>
<section class="stack" style="gap: 0.75rem;">
  <div class="rowx" style="justify-content: space-between; gap: 1rem;">
    <h2>Last call</h2>
    <span class="mood"><i></i>ok</span>
  </div>
  <p style="font-size: 1.05rem;">Today at 08:00, 45 seconds.</p>
  <div class="stack" style="gap: 0.35rem;">
    <div class="rowx" style="gap: 0.6rem;"><span class="label" style="width: 5.5rem;">Retired</span><span style="flex: 1;">Book a dentist appointment</span><a class="mono">0:12</a></div>
    <div class="rowx" style="gap: 0.6rem;"><span class="label" style="width: 5.5rem;">Committed</span><span style="flex: 1;">Call Amma, tonight</span><a class="mono">0:26</a></div>
    <div class="rowx" style="gap: 0.6rem;"><span class="label" style="width: 5.5rem;">Captured</span><span style="flex: 1;">Renew the car insurance</span><a class="mono">0:33</a></div>
  </div>
  <a style="font-size: 0.95rem;">Read the transcript</a>
</section>
<section class="stack" style="gap: 0.25rem;">
  <div class="rowx" style="justify-content: space-between; margin-bottom: 0.4rem;">
    <h2>Open &#183; 5</h2><a style="font-size: 0.9rem;">All items</a>
  </div>
  {items}
</section>"""


def today_live_content():
    steps = [
        ("done", "Picked up", "08:00:02"),
        ("done", "Call placed", "08:00:04"),
        ("live", "On the call. Checking again at 08:01:14", ""),
        ("todo", "Turning the call into rows", ""),
        ("todo", "Receipt on Telegram", ""),
    ]
    rows = ""
    for state, text, at in steps:
        if state == "done":
            mark = f'<span style="color: var(--plum); width: 16px; display: inline-flex;">{svg_check()}</span>'
            tstyle = ""
        elif state == "live":
            mark = '<span style="width: 16px; display: inline-flex; justify-content: center;"><span class="dot-live"></span></span>'
            tstyle = "font-weight: 600;"
        else:
            mark = '<span style="width: 16px; display: inline-flex; justify-content: center;"><span style="width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid var(--line);"></span></span>'
            tstyle = "color: var(--muted);"
        rows += f"""<div class="rowx" style="gap: 0.75rem; min-height: 36px;">{mark}<span style="flex: 1; {tstyle}">{text}</span><span class="mono muted">{at}</span></div>"""
    return f"""<section class="stack" style="gap: 0.4rem;">
  <span class="label">Monday 14 September</span>
  <h1>Today</h1>
</section>
<section class="wash stack" style="padding: 1.25rem; gap: 0.75rem;">
  <div class="rowx" style="gap: 0.6rem;"><span class="dot-live"></span><span class="label" style="color: var(--plum);">Calling now</span></div>
  <div style="font-size: 1.6rem; line-height: 1.15; font-weight: 600;">Your 08:00 call</div>
  <div class="stack" style="gap: 0;">{rows}</div>
  <p class="hint">Nothing to do here. This page updates on its own.</p>
</section>
<section class="stack" style="gap: 0.5rem;">
  <h2>On today's call</h2>
  <p class="hint">Orma is leading with these, in this order.</p>
  <div class="stack" style="gap: 0.1rem; margin-top: 0.25rem;">
    <div class="stack" style="padding: 0.6rem 0; border-top: 1px solid var(--hair);"><span>Book a dentist appointment</span><span class="muted" style="font-size: 0.88rem;">3 mentions &#183; 34 days</span></div>
    <div class="stack" style="padding: 0.6rem 0; border-top: 1px solid var(--hair);"><span>Renew the passport</span><span class="muted" style="font-size: 0.88rem;">1 mention &#183; 12 days</span></div>
    <div class="stack" style="padding: 0.6rem 0; border-top: 1px solid var(--hair);"><span>Call Amma</span><span class="muted" style="font-size: 0.88rem;">3 mentions &#183; 9 days</span></div>
  </div>
</section>"""


def today_first_content():
    return """<section class="stack" style="gap: 0.4rem;">
  <span class="label">Sunday 13 September</span>
  <h1>Welcome, Narayan</h1>
</section>
<section class="wash stack" style="padding: 1.5rem 1.25rem; gap: 0.75rem;">
  <span class="label" style="color: var(--plum);">Your first call</span>
  <div style="font-size: 1.9rem; line-height: 1.1; font-weight: 600;">Tomorrow, 08:00</div>
  <p>Two minutes. Orma leads with what you've told it, asks what's new, and hangs up.</p>
  <p class="hint">It comes from a number you won't recognise, and your phone may call it spam. Answer it anyway.</p>
</section>
<section class="stack" style="gap: 0.5rem;">
  <h2>What Orma knows so far &#183; 2</h2>
  <div class="stack" style="padding: 0.6rem 0; border-top: 1px solid var(--hair);"><span>Reply to the landlord</span><span class="muted" style="font-size: 0.88rem;">added on Telegram yesterday</span></div>
  <div class="stack" style="padding: 0.6rem 0; border-top: 1px solid var(--hair);"><span>Fix the bike brakes</span><span class="muted" style="font-size: 0.88rem;">added on Telegram today</span></div>
  <p class="hint" style="margin-top: 0.5rem;">Send anything else to @orma_tele_bot, or just say it on the call.</p>
</section>
<section class="stack" style="gap: 0.5rem;">
  <h2>After the call</h2>
  <p class="muted">What was captured, retired and promised shows up here, with the transcript a tap away.</p>
</section>"""


def items_content():
    open_rows = ""
    for i, (t, m, note) in enumerate(OPEN_ITEMS):
        extra = f'<span class="tag">{note}</span>' if note else ""
        if i == 1:
            open_rows += f"""<div class="stack" style="padding: 0.85rem 0; border-top: 1px solid var(--hair); gap: 0.75rem;">
  <div class="rowx" style="gap: 0.75rem; align-items: flex-start;">
    <div class="stack" style="flex: 1; gap: 0.15rem;"><span>{t}</span><span class="muted" style="font-size: 0.88rem;">{m}</span></div>
    <a class="btn btn-text" style="color: var(--muted);">{svg_down()}</a>
  </div>
  <div class="wash stack" style="padding: 0.9rem; gap: 0.6rem;">
    <div class="field"><span class="field-label" style="font-size: 0.9rem;">Since</span>
      <div class="rowx" style="gap: 0.5rem;"><span class="input" style="flex: 1;">2 September 2026</span><a class="btn btn-secondary">Save</a></div>
      <span class="hint">Orma counts the age from this date. Leave it empty to count from when you added it.</span></div>
    <div class="rowx" style="justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;">
      <a class="btn btn-secondary">Retire</a><a style="font-size: 0.9rem;">See the 2 mentions</a>
    </div>
  </div>
</div>"""
        else:
            open_rows += f"""<div class="rowx" style="padding: 0.7rem 0; border-top: 1px solid var(--hair); gap: 0.75rem;">
  <div class="stack" style="flex: 1; gap: 0.15rem;"><span>{t}</span><span class="rowx muted" style="font-size: 0.88rem; gap: 0.5rem; flex-wrap: wrap;">{m} {extra}</span></div>
  <a class="btn btn-text">Retire</a>
</div>"""
    retired = [
        ("Book a dentist appointment", "Retired on today's call &#183; waited 34 days", "0:12", True),
        ("Learn Rust", "Retired on the 9 September call &#183; waited 18 days", "0:51", False),
        ("Clean the garage", "Retired here on 3 September &#183; waited 11 days", None, False),
    ]
    ret_rows = ""
    for t, m, off, seeded in retired:
        off_html = f' &#183; said at <a class="mono">{off}</a>' if off else ""
        seed_html = ' <span class="tag">seeded</span>' if seeded else ""
        ret_rows += f"""<div class="rowx" style="padding: 0.7rem 0; border-top: 1px solid var(--hair); gap: 0.75rem;">
  <div class="stack" style="flex: 1; gap: 0.15rem;"><span class="muted">{t}{seed_html}</span><span class="muted" style="font-size: 0.85rem;">{m}{off_html}</span></div>
  <a class="btn btn-text">Restore</a>
</div>"""
    return f"""<section class="stack" style="gap: 1rem;">
  <h1>Items</h1>
  <div class="rowx" style="gap: 0.5rem;">
    <span class="input" style="flex: 1; color: var(--muted);">Add something to keep track of</span>
    <a class="btn btn-primary">Add</a>
  </div>
</section>
<section class="stack">
  <div class="rowx" style="justify-content: space-between; margin-bottom: 0.4rem;"><h2>Open &#183; 5</h2><span class="hint" style="font-size: 0.85rem;">Counts come from the calls</span></div>
  {open_rows}
</section>
<section class="stack">
  <div class="rowx" style="justify-content: space-between; margin-bottom: 0.4rem;"><h2>Retired &#183; 3</h2></div>
  {ret_rows}
  <p class="hint" style="margin-top: 0.75rem;">Retiring is never a failure. Restore brings an item back with its history.</p>
</section>"""


def transcript_html():
    out = ""
    for off, who, text, mark in TURNS:
        cls = "turn mark" if mark else "turn"
        out += f'<div class="{cls}"><a class="mono" style="text-decoration: none;">{off}</a><span class="who">{who}</span><span>{text}</span></div>'
        if mark:
            out += '<div class="rowx" style="gap: 0.4rem; padding: 0 0.5rem 0.4rem 7.5rem;"><span class="tag tag-plum">retired</span><span style="font-size: 0.85rem; color: var(--plum);">Book a dentist appointment</span></div>'
    return out


def history_content():
    calls = [
        ("Sunday 13 September", "08:00 &#183; 1 min 52 s", "Answered", "low", "Captured 2"),
        ("Saturday 12 September", "08:00", "Not answered", None, "The call did not connect."),
        ("Friday 11 September", "08:00 &#183; 2 min 06 s", "Answered", "stressed", "Nothing new"),
    ]
    rows = "".join(
        f"""<div class="rowx" style="padding: 0.85rem 0; border-top: 1px solid var(--hair); gap: 0.75rem;">
  <div class="stack" style="flex: 1; gap: 0.15rem;">
    <span>{d}</span>
    <span class="rowx muted" style="font-size: 0.88rem; gap: 0.6rem; flex-wrap: wrap;">{t} &#183; {disp} {'<span class="mood"><i></i>' + mood + '</span>' if mood else ''}</span>
    <span style="font-size: 0.92rem;">{s}</span>
  </div>
  <span class="muted">{svg_chevron()}</span>
</div>"""
        for d, t, disp, mood, s in calls
    )
    return f"""<section class="stack" style="gap: 0.4rem;"><h1>History</h1><p class="gloss">Every call, newest first. Mood is what the call heard.</p></section>
<section class="stack" style="gap: 0.9rem;">
  <div class="stack" style="gap: 0.15rem;">
    <div class="rowx" style="justify-content: space-between; gap: 0.75rem;"><span style="font-size: 1.15rem; font-weight: 600;">Monday 14 September</span><span class="mood"><i></i>ok</span></div>
    <span class="muted" style="font-size: 0.9rem;">08:00 &#183; 45 seconds &#183; Answered</span>
  </div>
  <div class="rowx" style="gap: 0.4rem; flex-wrap: wrap;">
    <span class="tag">retired 1</span><span class="tag">committed 1</span><span class="tag">captured 1</span><span class="tag">mentions 4</span>
  </div>
  <div class="stack" style="gap: 0.1rem; border-left: 2px solid var(--rule); padding-left: 0.4rem;">{transcript_html()}</div>
</section>
<section class="stack">
  <h2 style="margin-bottom: 0.4rem;">Earlier</h2>
  {rows}
</section>"""


def mood_chart(width):
    rows = ["energised", "ok", "low", "stressed"]
    left, top, row_h = 76, 12, 30
    n = len(MOODS)
    col_w = (width - left - 8) / n
    h = top + row_h * len(rows) + 34
    parts = [f'<svg width="{width}" height="{h}" viewBox="0 0 {width} {h}" style="display: block; overflow: visible;">']
    for i, r in enumerate(rows):
        y = top + i * row_h + row_h / 2
        parts.append(f'<text x="0" y="{y + 4}" font-size="12" fill="var(--muted)" font-family="Source Serif 4, Georgia, serif">{r}</text>')
        parts.append(f'<line x1="{left}" x2="{width - 8}" y1="{y}" y2="{y}" stroke="var(--hair)" stroke-width="1"></line>')
    pts = []
    for d, m in enumerate(MOODS):
        x = left + col_w * d + col_w / 2
        if m is None:
            yb = top + row_h * len(rows) + 8
            parts.append(f'<circle cx="{x:.1f}" cy="{yb}" r="3.5" fill="none" stroke="var(--line)" stroke-width="1.5"></circle>')
            continue
        y = top + rows.index(m) * row_h + row_h / 2
        pts.append((x, y))
        parts.append(f'<circle cx="{x:.1f}" cy="{y}" r="5" fill="var(--plum)"></circle>')
    for d in (0, 6, 13):
        x = left + col_w * d + col_w / 2
        parts.append(f'<text x="{x:.1f}" y="{h - 2}" font-size="11" text-anchor="middle" fill="var(--muted)" font-family="Source Code Pro, monospace">{d + 1} Sep</text>')
    parts.append("</svg>")
    return "".join(parts)


def patterns_facts():
    facts = [
        ("calls_placed", "14"), ("calls_answered", "11"), ("top_item", "Call Amma"),
        ("top_item_mentions", "4"), ("top_item_age_days", "9"), ("retired", "3"),
        ("avg_days_before_retire", "21"), ("mood_ok", "7"), ("mood_low", "3"),
        ("mood_stressed", "1"), ("mood_energised", "0"),
    ]
    return "".join(
        f'<div class="rowx" style="justify-content: space-between; gap: 1rem; padding: 0.35rem 0; border-top: 1px solid var(--hair);"><span class="mono muted">{k}</span><span class="mono">{v}</span></div>'
        for k, v in facts
    )


def num(v):
    return f'<span style="text-decoration: underline dotted var(--plum); text-underline-offset: 4px;">{v}</span>'


def patterns_content(desktop_layout=False, chart_w=342):
    prose = f"""<p style="font-size: 1.1rem; line-height: 1.65;">Over {num('14')} days you answered {num('11')} calls.
<em>Call Amma</em> came up {num('4')} times and has been open for {num('9')} days. You let {num('3')} things go,
and they had waited {num('21')} days on average before you did. Most calls heard you as ok, {num('7')} of them,
with {num('3')} low mornings and {num('1')} stressed one.</p>"""
    facts = f"""<div class="stack">
  <div class="rowx" style="justify-content: space-between; margin-bottom: 0.4rem;"><h2>Facts</h2><span class="hint" style="font-size: 0.85rem;">Computed by SQL</span></div>
  {patterns_facts()}
  <p class="hint" style="margin-top: 0.6rem;">Every number in the report is one of these. If it isn't, the report is written again.</p>
</div>"""
    head = """<section class="stack" style="gap: 0.4rem;"><span class="label">1 to 14 September</span><h1>Patterns</h1></section>"""
    chart = f"""<section class="stack" style="gap: 0.75rem;">
  <div class="rowx" style="justify-content: space-between;"><h2>Mood across the fortnight</h2></div>
  {mood_chart(chart_w)}
  <div class="rowx" style="gap: 1rem; flex-wrap: wrap;"><span class="mood"><i></i>what the call heard</span><span class="mood"><i class="none"></i>no call answered</span></div>
</section>"""
    delivered = '<p class="hint">Sent to Telegram on Monday 14 September at 09:00.</p>'
    if desktop_layout:
        return f"""{head}
<div style="display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 3rem; align-items: start;">
  <div class="stack" style="gap: 1rem;">{prose}{delivered}</div>
  {facts}
</div>
{chart}"""
    return f"""{head}
<section class="stack" style="gap: 1rem;">{prose}{delivered}</section>
{chart}
<section>{facts}</section>"""


def patterns_notyet_content():
    return """<section class="stack" style="gap: 0.4rem;"><span class="label">Your first week</span><h1>Patterns</h1></section>
<section class="wash stack" style="padding: 1.5rem 1.25rem; gap: 0.75rem;">
  <div style="font-size: 1.4rem; line-height: 1.2; font-weight: 600;">Not enough calls yet</div>
  <p>A pattern needs a run of days. You have had 2 calls. The first report comes after 7.</p>
  <p class="hint">Orma won't guess at a trend from two mornings.</p>
</section>"""


def settings_section(title, inner):
    return f'<section class="stack" style="gap: 0.9rem; padding-top: 1.5rem; border-top: 1px solid var(--hair);"><h2>{title}</h2>{inner}</section>'


def settings_content():
    call = """<div class="rowx" style="justify-content: space-between; gap: 0.75rem;">
  <div class="stack"><span style="font-size: 1.3rem; font-weight: 600;">08:00</span><span class="muted" style="font-size: 0.9rem;">Every day &#183; morning</span></div>
  <a class="btn btn-secondary">Edit</a>
</div>
<a class="btn btn-text" style="align-self: flex-start; padding-left: 0;">Add another time</a>
<div class="field"><span class="field-label">Time zone</span><span class="input rowx" style="justify-content: space-between;">Asia/Kolkata (IST)""" + svg_down() + """</span></div>"""
    pause = """<div class="rowx" style="gap: 0.5rem; flex-wrap: wrap;"><a class="btn btn-secondary">Cancel tomorrow's call</a><a class="btn btn-secondary">Pause all calls</a></div>
<p class="hint">Cancelling skips one call. Pausing stops new calls until you resume.</p>"""
    phone_s = f"""<div class="rowx" style="justify-content: space-between; gap: 0.75rem;">
  <div class="stack"><span>{PHONE_MASKED}</span><span class="muted" style="font-size: 0.9rem;">Confirmed by your first call on 11 September</span></div>
  <a class="btn btn-secondary">Change</a>
</div>"""
    consent = """<div class="stack" style="gap: 0.2rem;"><span>Calls are allowed</span><span class="muted" style="font-size: 0.9rem;">Agreed on the web, 11 September 2026 &#183; wording v1</span></div>
<a style="font-size: 0.95rem;">Read what you agreed to</a>
<div class="rowx" style="gap: 0.5rem;"><a class="btn btn-secondary">Withdraw consent</a></div>
<p class="hint">Calls stop from the next minute, not the next day.</p>"""
    receipts = """<div class="rowx" style="justify-content: space-between; gap: 1rem; min-height: 44px;"><span>Telegram</span><span class="switch on"></span></div>
<div class="rowx" style="justify-content: space-between; gap: 1rem; min-height: 44px;"><span>Email</span><span class="switch"></span></div>
<p class="hint">Receipts arrive after a call. Orma never sends a reminder.</p>"""
    telegram = """<div class="rowx" style="justify-content: space-between; gap: 0.75rem;">
  <div class="stack"><span>Linked to @orma_tele_bot</span><span class="muted" style="font-size: 0.9rem;">Chat ending &#8226;&#8226;17 &#183; send thoughts there any time</span></div>
  <a class="btn btn-secondary">Unlink</a>
</div>"""
    account = """<p>Deleting your account removes your profile, items, calls, transcripts, reports and receipts. It cannot be undone.</p>
<div class="rowx"><a class="btn btn-danger">Delete my account</a></div>"""
    return f"""<section class="stack" style="gap: 0.4rem;"><h1>Settings</h1></section>
{settings_section('Your call', call)}
{settings_section('Skip or pause', pause)}
{settings_section('Phone', phone_s)}
{settings_section('Consent', consent)}
{settings_section('Receipts', receipts)}
{settings_section('Telegram', telegram)}
{settings_section('Account', account)}"""


EVENTS = [
    ("00:10:03", "materialised", "Scheduled for 08:00 IST", None),
    ("08:00:02", "claimed", "Picked up by the minute tick", None),
    ("08:00:04", "dispatched", "Sent to CALL-E", None),
    ("08:01:14", "polled", "Still on the call, checked again 10 s later", None),
    ("08:01:52", "webhook_received", "CALL-E said the call ended", None),
    ("08:01:53", "refetched", "Confirmed completed, this delivery applied it", None),
    ("08:02:10", "ingested", "1 captured, 1 retired, 1 commitment, 4 mentions",
     '{\n  "counts": {\n    "items": 1,\n    "mentions": 4,\n    "retirements": 1,\n    "commitments": 1\n  },\n  "skipped": []\n}'),
    ("08:02:10", "finalised", "Completed, answered and extracted", None),
]


def timeline_rows(events, live=False):
    out = ""
    for at, kind, text, detail in events:
        det = ""
        if detail:
            det = f'<pre class="mono" style="margin: 0.5rem 0 0; padding: 0.75rem; border: 1px solid var(--hair); border-radius: 4px; white-space: pre; overflow: hidden; line-height: 1.5;">{detail}</pre>'
        chev = svg_down() if detail else svg_chevron()
        out += f"""<div style="display: grid; grid-template-columns: 5.2rem minmax(0, 1fr) 20px; gap: 0.75rem; padding: 0.65rem 0; border-top: 1px solid var(--hair); align-items: start;">
  <span class="mono muted" style="padding-top: 0.2rem;">{at}</span>
  <div class="stack" style="gap: 0.1rem;"><span class="mono" style="color: var(--plum);">{kind}</span><span style="font-size: 0.95rem;">{text}</span>{det}</div>
  <span class="muted" style="padding-top: 0.2rem;">{chev}</span>
</div>"""
    if live:
        out += """<div style="display: grid; grid-template-columns: 5.2rem minmax(0, 1fr) 20px; gap: 0.75rem; padding: 0.65rem 0; border-top: 1px solid var(--hair); align-items: center;">
  <span class="mono muted">next</span>
  <div class="rowx" style="gap: 0.6rem;"><span class="dot-live"></span><span style="font-size: 0.95rem;">Waiting for the call to end</span></div>
  <span></span>
</div>"""
    return out


def run_picker(live=False):
    tag = '<span class="tag tag-plum">live</span>' if live else '<span class="tag">completed</span>'
    return f"""<div class="stack" style="gap: 0.5rem;">
  <div class="input rowx" style="justify-content: space-between; gap: 0.5rem;"><span class="rowx" style="gap: 0.5rem;">Monday 14 September, 08:00 {tag}</span>{svg_down()}</div>
  <div class="rowx muted" style="gap: 0.5rem; font-size: 0.85rem; flex-wrap: wrap;"><span>Other runs:</span><a>13 Sep</a><a>12 Sep, stopped at finalised</a><span class="tag">rehearsal</span></div>
</div>"""


def timeline_content():
    return f"""<section class="stack" style="gap: 0.4rem;"><h1>Timeline</h1><p class="gloss">What happened to each call, step by step. Only your own runs.</p></section>
<section class="stack" style="gap: 1rem;">{run_picker()}<div class="stack">{timeline_rows(EVENTS)}</div></section>
<section class="stack" style="gap: 0.5rem;">
  <h2>A run that stopped</h2>
  <div style="display: grid; grid-template-columns: 5.2rem minmax(0, 1fr); gap: 0.75rem; padding: 0.65rem 0; border-top: 1px solid var(--hair);">
    <span class="mono muted">12 Sep</span>
    <div class="stack" style="gap: 0.1rem;"><span class="mono" style="color: var(--danger);">finalised</span><span style="font-size: 0.95rem;">Not answered. CALL-E reported failure 408 after dispatch.</span></div>
  </div>
</section>"""


def timeline_live_content():
    return f"""<section class="stack" style="gap: 0.4rem;"><h1>Timeline</h1><p class="gloss">What happened to each call, step by step. Only your own runs.</p></section>
<section class="stack" style="gap: 1rem;">{run_picker(live=True)}<div class="stack">{timeline_rows(EVENTS[:4], live=True)}</div>
<p class="hint">New steps appear as they happen.</p></section>"""


def login_content():
    return f"""<div style="width: 100%; max-width: 24rem; padding: 5rem 1.5rem 3rem; display: flex; flex-direction: column; gap: 2.25rem;">
  <header class="stack" style="gap: 0.25rem;">
    <div style="font-size: 2.5rem; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1;">Orma</div>
    <p class="gloss">&#3363;&#3374;&#3405;&#3374; &#8212; it remembers what you keep not doing.</p>
  </header>
  <p class="lede">Sign in to set up your daily call.</p>
  <div class="stack" style="gap: 0.75rem;">
    <div class="field"><span class="field-label">Email</span><span class="input focus">you@example.com</span></div>
    <a class="btn btn-primary" style="width: 100%;">Email me a sign-in link</a>
    <p class="hint">No password. The link signs you in on this device.</p>
  </div>
  <div class="rowx" style="gap: 0.75rem;"><span class="hair" style="flex: 1;"></span><span class="muted" style="font-size: 0.85rem;">or</span><span class="hair" style="flex: 1;"></span></div>
  <div class="stack" style="gap: 0.6rem;">
    <a class="btn btn-secondary" style="width: 100%;">{svg_send()}Continue with Telegram</a>
    <p class="hint">Orma sees your Telegram name and id. Never your messages.</p>
  </div>
  <p class="hint" style="padding-top: 1.5rem; border-top: 1px solid var(--hair);">Both ways reach the same account.</p>
</div>"""


def onboarding_content():
    def step(n, title, inner):
        return f"""<section class="stack" style="gap: 0.85rem; padding-top: 1.5rem; border-top: 1px solid var(--hair);">
  <div class="rowx" style="gap: 0.75rem;"><span class="mono muted">{n}</span><span style="font-size: 1.15rem; font-weight: 600;">{title}</span></div>
  {inner}
</section>"""
    days = "".join(
        f'<span class="rowx" style="justify-content: center; min-width: 44px; min-height: 44px; border-radius: 4px; background: var(--plum); color: var(--on-accent); font-size: 0.85rem;">{d}</span>'
        for d in ["M", "T", "W", "T", "F", "S", "S"]
    )
    return f"""<section class="stack" style="gap: 0.5rem;"><h1>Set up your call</h1><p class="gloss">Six short steps, once.</p></section>
{step('1', 'Your name', '<div class="field"><span class="input">Narayan</span><span class="hint">Orma says it when it calls, so you know who it is for.</span></div>')}
{step('2', 'Your phone', f'<div class="field"><span class="input focus">{PHONE_MASKED}</span><span class="hint">In international format, starting with +. Orma has no text messages, so it cannot check this number. Your first call confirms it.</span></div>')}
{step('3', 'Your consent', f'<div class="wash stack" style="padding: 1rem; gap: 0.5rem;"><span class="label">Wording v1</span><p style="font-size: 0.97rem;">{CONSENT_TEXT}</p></div><a class="btn btn-primary" style="align-self: flex-start;">I agree to these calls</a><p class="hint">Without this, Orma will not call. You can agree later in Settings.</p>')}
{step('4', 'When to call', f'<div class="field"><span class="field-label" style="font-size: 0.9rem;">Time</span><span class="input">08:00</span></div><div class="field"><span class="field-label" style="font-size: 0.9rem;">Days</span><div class="rowx" style="gap: 0.3rem; flex-wrap: wrap;">{days}</div></div><div class="field"><span class="field-label" style="font-size: 0.9rem;">Time zone</span><span class="input rowx" style="justify-content: space-between;">Asia/Kolkata (IST){svg_down()}</span></div>')}
{step('5', 'Receipts on Telegram', f'<p>After each call, Orma can send what it captured. One Start press lets the bot message you.</p><a class="btn btn-secondary" style="align-self: flex-start;">{svg_send()}Open @orma_tele_bot</a><p class="hint">Optional. Receipts only, never reminders.</p>')}
{step('6', 'Before the first call', '<div class="wash stack" style="padding: 1rem; gap: 0.5rem;"><p style="font-weight: 600;">It will come from a number you won\'t recognise.</p><p>A different one each time, and your phone may say it is likely spam. Answer it anyway. It is Orma.</p><p class="hint">We cannot stop that warning, and there is no number to save.</p></div>')}
<section class="stack" style="gap: 0.75rem; padding-top: 1.5rem; border-top: 1px solid var(--hair);">
  <p>Your first call is <strong>tomorrow at 08:00</strong>.</p>
  <a class="btn btn-primary" style="width: 100%;">Start my calls</a>
</section>"""


def system_content():
    tokens = [
        ("Paper", "#fbfaf8", "#14130f", "background"),
        ("Ink", "#22201c", "#e8e4dc", "15.6 / 14.7"),
        ("Muted", "#716b61", "#938c80", "5.06 / 5.58"),
        ("Plum", "#7a5283", "#cfa7d8", "6.0 / 9.0"),
        ("Plum wash", "#f6ecf8", "#271e29", "ink 14.2 / 12.7"),
        ("Line", "#948f83", "#6e685e", "3.09 / 3.37"),
        ("Rule", "#d8d2c6", "#3a352c", "decorative"),
        ("Hairline", "#e6e1d7", "#2a2620", "decorative"),
        ("Danger", "#8a2b2b", "#e08a8a", "8.2 / 7.2"),
    ]
    sw = "".join(
        f"""<div class="stack" style="gap: 0.4rem;">
  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); height: 72px; border: 1px solid var(--hair); border-radius: 6px; overflow: hidden;"><div style="background: {l};"></div><div style="background: {d};"></div></div>
  <span style="font-weight: 600;">{n}</span><span class="mono muted">{l} &#183; {d}</span><span class="hint" style="font-size: 0.82rem;">{c}</span>
</div>"""
        for n, l, d, c in tokens
    )
    ramp = """<div class="stack" style="gap: 1rem;">
  <div class="rowx" style="gap: 2rem; align-items: baseline;"><span class="mono muted" style="width: 9rem;">wordmark 40/600</span><span style="font-size: 2.5rem; font-weight: 600; letter-spacing: -0.02em;">Orma</span></div>
  <div class="rowx" style="gap: 2rem; align-items: baseline;"><span class="mono muted" style="width: 9rem;">h1 32/600</span><span style="font-size: 2rem; font-weight: 600;">Tomorrow, 08:00</span></div>
  <div class="rowx" style="gap: 2rem; align-items: baseline;"><span class="mono muted" style="width: 9rem;">lede 19</span><span class="lede">Sign in to set up your daily call.</span></div>
  <div class="rowx" style="gap: 2rem; align-items: baseline;"><span class="mono muted" style="width: 9rem;">body 16/1.6</span><span>You've mentioned the dentist 3 times. It's been 34 days.</span></div>
  <div class="rowx" style="gap: 2rem; align-items: baseline;"><span class="mono muted" style="width: 9rem;">hint 14.4</span><span class="hint">Calls stop from the next minute, not the next day.</span></div>
  <div class="rowx" style="gap: 2rem; align-items: baseline;"><span class="mono muted" style="width: 9rem;">label 12 caps</span><span class="label">Next call</span></div>
  <div class="rowx" style="gap: 2rem; align-items: baseline;"><span class="mono muted" style="width: 9rem;">mono 12.8</span><span class="mono">08:02:10 ingested 0:12</span></div>
  <div class="rowx" style="gap: 2rem; align-items: baseline;"><span class="mono muted" style="width: 9rem;">figures</span><span style="font-size: 1.4rem;">0123456789 &#183; 11 of 14 &#183; 08:00</span></div>
</div>"""
    comps = f"""<div class="stack" style="gap: 1.25rem;">
  <div class="rowx" style="gap: 0.75rem; flex-wrap: wrap;"><a class="btn btn-primary">Start my calls</a><a class="btn btn-secondary">Pause all calls</a><a class="btn btn-text">Restore</a><a class="btn btn-danger">Delete my account</a></div>
  <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem;">
    <div class="field"><span class="field-label">Default</span><span class="input">Narayan</span></div>
    <div class="field"><span class="field-label">Focused</span><span class="input focus">{PHONE_MASKED}</span></div>
    <div class="field"><span class="field-label">Error</span><span class="input" style="border-color: var(--danger);">98765</span><span class="hint" style="color: var(--danger);">Start with + and your country code.</span></div>
  </div>
  <div class="rowx" style="gap: 1rem; flex-wrap: wrap; align-items: center;"><span class="tag">seeded</span><span class="tag">rehearsal</span><span class="tag tag-plum">live</span><span class="mood"><i></i>ok</span><span class="mood"><i class="none"></i>no call</span><span class="dot-live"></span><span class="switch on"></span><span class="switch"></span></div>
  <div class="stack" style="border-left: 2px solid var(--rule); padding-left: 0.4rem; max-width: 34rem;">
    <div class="turn"><a class="mono" style="text-decoration: none;">0:06</a><span class="who">Orma</span><span>You've mentioned the dentist three times.</span></div>
    <div class="turn mark"><a class="mono" style="text-decoration: none;">0:12</a><span class="who">You</span><span>Kill it.</span></div>
  </div>
</div>"""
    return f"""<div style="width: 1200px; padding: 3.5rem; display: flex; flex-direction: column; gap: 3rem;">
  <header class="stack" style="gap: 0.4rem;"><h1>Orma app &#183; system</h1><p class="gloss">Source Serif 4 for the voice, Source Code Pro for the machinery. Plum marks where to act. Contrast is measured against paper, light then dark.</p></header>
  <section class="stack" style="gap: 1rem;"><h2>Colour</h2><div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 1.25rem;">{sw}</div></section>
  <section class="stack" style="gap: 1rem;"><h2>Type</h2>{ramp}</section>
  <section class="stack" style="gap: 1rem;"><h2>Components</h2>{comps}</section>
  <section class="stack" style="gap: 0.6rem;"><h2>Voice</h2>
    <p>Receipts, never prompts. Retire, never delete. Only numbers a row produced. Empty states read as anticipation. Honest about the unknown number.</p>
  </section>
</div>"""


# ---------- artboards ----------

ARTBOARDS = []  # (file, title, page, html, w, h)


def add(file, title, page, html, w, h):
    ARTBOARDS.append((file, title, page, html, w, h))


PH = 390
add("Main.dc.html", "Today · phone", "phone", phone("Today", today_content()), PH, 1300)
add("Login.dc.html", "Login · phone", "phone", bare(login_content(), PH, 844), PH, 900)
add("Onboarding.dc.html", "Onboarding · phone", "phone", dc(f'<div style="width: 390px; padding: 2rem 1.5rem 3rem; display: flex; flex-direction: column; gap: 1.75rem;"><div style="font-size: 1.35rem; font-weight: 600;">Orma</div>{onboarding_content()}</div>'), PH, 2400)
add("Items.dc.html", "Items · phone", "phone", phone("Items", items_content()), PH, 1500)
add("History.dc.html", "History · phone", "phone", phone("History", history_content()), PH, 1700)
add("Patterns.dc.html", "Patterns · phone", "phone", phone("Patterns", patterns_content()), PH, 1500)
add("Settings.dc.html", "Settings · phone", "phone", phone("Settings", settings_content()), PH, 2100)
add("Timeline.dc.html", "Timeline · phone", "phone", phone("Timeline", timeline_content()), PH, 1500)

DW = 1440
add("DeskToday.dc.html", "Today · desktop", "desktop", desktop("Today", today_content()), DW, 1250)
add("DeskLogin.dc.html", "Login · desktop", "desktop", bare(login_content(), DW, 900), DW, 900)
add("DeskOnboarding.dc.html", "Onboarding · desktop", "desktop", dc(f'<div style="width: 1440px; display: flex; justify-content: center;"><div style="width: 38rem; padding: 3.5rem 1.5rem 4rem; display: flex; flex-direction: column; gap: 1.75rem;"><div style="font-size: 1.6rem; font-weight: 600;">Orma</div>{onboarding_content()}</div></div>'), DW, 2100)
add("DeskItems.dc.html", "Items · desktop", "desktop", desktop("Items", items_content()), DW, 1500)
add("DeskHistory.dc.html", "History · desktop", "desktop", desktop("History", history_content(), wide=True), DW, 1700)
add("DeskPatterns.dc.html", "Patterns · desktop", "desktop", desktop("Patterns", patterns_content(True, 700), wide=True), DW, 1300)
add("DeskSettings.dc.html", "Settings · desktop", "desktop", desktop("Settings", settings_content()), DW, 1900)
add("DeskTimeline.dc.html", "Timeline · desktop", "desktop", desktop("Timeline", timeline_content(), wide=True), DW, 1500)

add("TodayFirstRun.dc.html", "Today · first run", "states", phone("Today", today_first_content()), PH, 1000)
add("TodayLive.dc.html", "Today · call in progress", "states", phone("Today", today_live_content()), PH, 1100)
add("TimelineLive.dc.html", "Timeline · live", "states", phone("Timeline", timeline_live_content()), PH, 1100)
add("PatternsNotYet.dc.html", "Patterns · not enough calls", "states", phone("Patterns", patterns_notyet_content()), PH, 844)
add("TodayDark.dc.html", "Today · dark", "states", phone("Today", today_content(), dark=True), PH, 1300)

add("System.dc.html", "System", "system", dc(system_content()), 1200, 1800)


def main():
    pages = [
        {"id": "phone", "name": "Phone"},
        {"id": "desktop", "name": "Desktop"},
        {"id": "states", "name": "States"},
        {"id": "system", "name": "System"},
    ]
    canvas = {"pages": pages, "artboards": [], "annotations": [], "launch": {"view": "canvas", "page": "phone"}}
    x_by_page = {}
    for file, title, page, html, w, h in ARTBOARDS:
        (OUT / file).write_text(html)
        if page == "desktop":
            idx = x_by_page.get(page, 0)
            x, y = (idx % 2) * (DW + 120), (idx // 2) * 2500
        else:
            x = x_by_page.get(page, 0)
            y = 0
        canvas["artboards"].append({"file": file, "title": title, "page": page, "x": x, "y": y, "w": w, "h": h})
        x_by_page[page] = (x_by_page.get(page, 0) + 1) if page == "desktop" else x + w + 100
    notes = [
        ("phone", "note-phone", "Sample data throughout. Numbers agree across screens: the 14 Sept call retired the seeded dentist item at 0:12 and wrote 4 mentions. Consent wording v1 is draft copy for review."),
        ("states", "note-states", "Live states update without a reload. A no-result call never says extraction failed, it just shows the transcript."),
    ]
    for page, nid, text in notes:
        canvas["annotations"].append({"id": nid, "page": page, "x": 0, "y": -200, "w": 520, "text": text})
    (OUT / "canvas.json").write_text(json.dumps(canvas, indent=2))
    print("\n".join(f"{a[0]} {a[4]}x{a[5]}" for a in ARTBOARDS))


if __name__ == "__main__":
    main()
