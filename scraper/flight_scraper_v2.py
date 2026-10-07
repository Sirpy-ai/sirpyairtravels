"""
flight_scraper_v2.py — resumable, sharded Google Flights scraper.

Why v2 exists
-------------
The old parallel_date_worker.py built one `asyncio.gather` over every date in
the range and held all results in memory until the very end. At ~20 days that
works. At 80 days it does not:

  * one shared browser context for 80x4 = 320 page loads -> Google starts
    serving the "unusual traffic" interstitial roughly a third of the way in,
    and every later page silently yields zero cards;
  * a crash, a rate-limit, or a single hung navigation at hour two loses the
    entire run, because nothing is written until the gather resolves;
  * inbound legs were scraped serially inside each date task, so the real
    concurrency was ~1 despite the semaphore.

v2 changes four things:

  1. CHECKPOINTING. Every (date, route) result is appended to a JSONL cache the
     moment it lands. Re-running skips whatever is already cached, so an 80-day
     run can be finished in as many sittings as it takes. This is the single
     change that makes long ranges viable.
  2. FLAT TASK QUEUE. Every (date, leg) pair is one independent unit of work
     pulled by a fixed pool of workers -- no date-level barrier.
  3. CONTEXT ROTATION. Each worker owns its own browser context (own cookie
     jar, own user agent) and recycles it every N pages, which keeps any single
     identity below Google's throttling threshold.
  4. BLOCK DETECTION + BACKOFF. A consent wall / captcha / empty result page is
     distinguished from a genuinely flightless date; blocks trigger a global
     cool-down instead of burning the retry budget.

Usage
-----
    python flight_scraper_v2.py --start 2026-08-12 --end 2026-10-30
    python flight_scraper_v2.py --start ... --end ... --workers 6 --resume
    python flight_scraper_v2.py --start ... --end ... --fresh   # ignore cache

Then:
    python build_workbook.py --from-master
"""

import argparse
import asyncio
import base64
import json
import os
import random
import re
import sys
import time
from datetime import datetime, timedelta

import pandas as pd
from playwright.async_api import async_playwright

WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
# Defaults; overridden at startup by --hub / --airports / --suffix (config.json
# drives these through start.py, so edit the config rather than this file).
AIRPORTS = ["TRZ", "MAA", "CJB"]
HUB = "SIN"
SUFFIX = "aug_oct2026"
CACHE_PATH = os.path.join(WORKSPACE_DIR, "scrape_cache.jsonl")
COLUMNS = ["Date", "Airline", "Origin to Destination", "Duration",
           "Start Time", "End Time", "Price", "Slot_ID"]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
]

AIRLINE_MAP = [
    ("Air India Express", "Air India Express"),
    ("IndiGo", "IndiGo"),
    ("Scoot", "Scoot"),
    ("Singapore Airlines", "Singapore Airlines"),
    ("Malaysia Airlines", "Malaysia Airlines"),
    ("AirAsia", "AirAsia"),
    ("Air India", "Air India"),
]

# ----------------------------------------------------------------- tfs URLs --

def _leg(field, code):
    """One protobuf LEN field: 0x6a = origin, 0x72 = destination."""
    return bytes([field, 0x07, 0x08, 0x01, 0x12, 0x03]) + code.encode()


def build_tfs(date_str, origins, destinations):
    """Multi-airport one-way non-stop search token for Google Flights."""
    body = b"\x12\x0a" + date_str.encode() + b"\x28\x00"
    for o in origins:
        body += _leg(0x6A, o)
    for d in destinations:
        body += _leg(0x72, d)
    payload = (b"\x08\x1c\x10\x02\x1a" + bytes([len(body)]) + body +
               b"\x40\x01\x48\x01\x70\x01\x82\x01\x0b\x08"
               b"\xff\xff\xff\xff\xff\xff\xff\xff\xff\x01\x98\x01\x02")
    tfs = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    return f"https://www.google.com/travel/flights/search?tfs={tfs}&tfu=EgYIABAAGAA&hl=en&curr=SGD"


def url_for(task):
    """One multi-airport request per direction per date -> 2 loads, not 4."""
    if task["dir"] == "out":
        return build_tfs(task["date"], [HUB], AIRPORTS)
    return build_tfs(task["date"], AIRPORTS, [HUB])


# ------------------------------------------------------------------ parsing --

def normalise_airline(raw):
    for needle, name in AIRLINE_MAP:
        if needle in raw:
            return name
    return raw.strip() or None


def parse_card(text, date_str):
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if len(lines) < 4:
        return None

    times = [(i, l) for i, l in enumerate(lines)
             if re.fullmatch(r"\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)(?:\+\d+)?", l)]
    if len(times) < 2:
        return None
    (_, start), (t2_idx, end) = times[0], times[1]

    airline = None
    for idx in range(t2_idx + 1, min(t2_idx + 4, len(lines))):
        airline = normalise_airline(lines[idx])
        if airline and len(airline) < 40:
            break
    if not airline:
        return None

    duration = "N/A"
    for l in lines:
        m = re.search(r"(\d+\s*hr(?:\s*\d+\s*min)?|\d+\s*min)", l)
        if m:
            duration = m.group(1)
            break

    route = None
    for l in lines:
        m = re.search(r"\b([A-Z]{3})\b[^A-Za-z0-9]{1,4}\b([A-Z]{3})\b", l)
        if m and m.group(1) != m.group(2):
            a, b = m.group(1), m.group(2)
            if a in AIRPORTS + [HUB] and b in AIRPORTS + [HUB]:
                route = f"{a} to {b}"
                break
    if not route:
        return None                      # unattributable row: drop, don't guess

    price = None
    for l in reversed(lines):
        m = re.fullmatch(r"(?:SGD|S?\$|₹|INR)\s*([\d,]+)", l.replace("\xa0", " "), re.I)
        if m:
            price = "SGD " + m.group(1).replace(",", "")
            break
    if not price:
        return None

    return {
        "Date": date_str,
        "Airline": airline,
        "Origin to Destination": route,
        "Duration": duration,
        "Start Time": start,
        "End Time": end,
        "Price": price,
        "Slot_ID": f"{airline} ({start} - {end})",
    }


# Phrases that only appear on a genuine interstitial. Do NOT test for
# "recaptcha" -- Google Flights ships that word in its normal page scripts, so
# matching it flags every healthy page as blocked.
BLOCK_PHRASES = ("our systems have detected unusual traffic",
                 "unusual traffic from your computer network",
                 "before you continue to google",
                 "i'm not a robot")


async def is_blocked(page):
    if "/sorry/" in page.url or "consent.google" in page.url:
        return True
    body = (await page.inner_text("body"))[:4000].lower()
    return any(p in body for p in BLOCK_PHRASES)


# ------------------------------------------------------------------- engine --

class Scraper:
    def __init__(self, workers, pages_per_context, cache, max_blocks=None):
        self.max_blocks = max_blocks
        self.aborted = False
        self.workers = workers
        self.pages_per_context = pages_per_context
        self.cache = cache
        self.cooldown_until = 0.0
        self.results = []
        self.blocked_hits = 0
        self.lock = asyncio.Lock()
        self.cache_fh = open(CACHE_PATH, "a", encoding="utf-8")

    async def cool_down(self, seconds):
        self.cooldown_until = max(self.cooldown_until, time.monotonic() + seconds)

    async def wait_if_cooling(self):
        while True:
            remaining = self.cooldown_until - time.monotonic()
            if remaining <= 0:
                return
            await asyncio.sleep(min(remaining, 5))

    async def record(self, key, flights):
        async with self.lock:
            self.results.extend(flights)
            self.cache_fh.write(json.dumps({"key": key, "flights": flights}) + "\n")
            self.cache_fh.flush()
            self.cache.add(key)

    async def fetch(self, context, task):
        """Returns (flights, status) where status in {ok, empty, blocked, error}."""
        page = await context.new_page()
        try:
            await page.goto(url_for(task), wait_until="domcontentloaded", timeout=45000)
            await asyncio.sleep(random.uniform(1.5, 2.5))

            if await is_blocked(page):
                return [], "blocked"

            try:
                btn = page.locator('button:has-text("Accept all"), button:has-text("I agree")').first
                if await btn.is_visible(timeout=1200):
                    await btn.click()
                    await asyncio.sleep(1.0)
            except Exception:
                pass

            try:
                await page.wait_for_selector(".pIav2d", timeout=12000)
            except Exception:
                return [], "empty"

            flights = []
            for card in await page.query_selector_all(".pIav2d"):
                parsed = parse_card(await card.inner_text(), task["date"])
                if parsed:
                    flights.append(parsed)
            return flights, ("ok" if flights else "empty")
        except Exception as exc:
            return [], f"error:{type(exc).__name__}"
        finally:
            if not page.is_closed():
                await page.close()

    async def worker(self, browser, wid, queue, total):
        context, served = None, 0
        while not self.aborted:
            try:
                task = queue.get_nowait()
            except asyncio.QueueEmpty:
                break

            key = f"{task['date']}|{task['dir']}"
            if key in self.cache:
                queue.task_done()
                continue

            await self.wait_if_cooling()
            if context is None or served >= self.pages_per_context:
                if context is not None:
                    await context.close()
                context = await browser.new_context(
                    user_agent=random.choice(USER_AGENTS),
                    viewport={"width": 1280, "height": 900},
                    locale="en-US",
                )
                await context.route(
                    re.compile(r"\.(png|jpe?g|gif|webp|svg|woff2?|ttf|mp4)$"),
                    lambda r: asyncio.ensure_future(r.abort()),
                )
                served = 0

            flights, status = [], None
            for attempt in range(4):
                flights, status = await self.fetch(context, task)
                served += 1
                if status == "ok":
                    break
                if status == "blocked":
                    self.blocked_hits += 1
                    if self.max_blocks is not None and self.blocked_hits > self.max_blocks:
                        self.aborted = True
                        print(f"  [w{wid}] BLOCKED {self.blocked_hits} times -> giving up")
                        break
                    wait = min(300, 45 * (2 ** attempt))
                    print(f"  [w{wid}] BLOCKED on {key} -> cooling {wait}s")
                    await self.cool_down(wait)
                    await self.wait_if_cooling()
                    await context.close()
                    context = await browser.new_context(
                        user_agent=random.choice(USER_AGENTS),
                        viewport={"width": 1280, "height": 900}, locale="en-US")
                    served = 0
                    continue
                if status == "empty" and attempt >= 1:
                    break                     # genuinely no non-stop service
                await asyncio.sleep(random.uniform(3, 7))

            if self.aborted:
                queue.task_done()
                break
            if status == "blocked":
                # A block is not "no flights that day": leave it uncached so the
                # date is retried next run instead of being saved as empty.
                print(f"  [w{wid}] {key:16s} still blocked, not recorded")
                queue.task_done()
                continue

            await self.record(key, flights)
            done = len(self.cache)
            print(f"  [w{wid}] {key:16s} {status:10s} {len(flights):3d} flights "
                  f"({done}/{total})")
            await asyncio.sleep(random.uniform(1.0, 2.5))
            queue.task_done()

        if context is not None:
            await context.close()

    async def run(self, tasks):
        queue = asyncio.Queue()
        for t in tasks:
            queue.put_nowait(t)
        total = queue.qsize() + len(self.cache)
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--disable-blink-features=AutomationControlled",
                      "--disable-dev-shm-usage", "--no-sandbox"],
            )
            await asyncio.gather(*[self.worker(browser, i + 1, queue, total)
                                   for i in range(self.workers)])
            await browser.close()
        self.cache_fh.close()


# --------------------------------------------------------------------- main --

def load_cache(fresh):
    cache, rows = set(), []
    if fresh or not os.path.exists(CACHE_PATH):
        if fresh and os.path.exists(CACHE_PATH):
            os.replace(CACHE_PATH, CACHE_PATH + ".bak")
        return cache, rows
    with open(CACHE_PATH, encoding="utf-8") as fh:
        for line in fh:
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            cache.add(rec["key"])
            rows.extend(rec["flights"])
    return cache, rows


def write_master_csvs(rows, force=False):
    """Write flights_<route>_aug_oct2026.csv.

    Guard: a short smoke run must never silently replace a full-season file, so
    a write that would shrink the date coverage is skipped unless --force.
    """
    if not rows:
        print("no flights collected")
        return
    df = pd.DataFrame(rows)[COLUMNS]
    df = df.drop_duplicates(subset=["Date", "Airline", "Start Time", "End Time",
                                    "Origin to Destination"])
    for code in AIRPORTS:
        for tag, route in ((f"SIN_to_{code}", f"{HUB} to {code}"),
                           (f"{code}_to_SIN", f"{code} to {HUB}")):
            sub = df[df["Origin to Destination"] == route].sort_values(["Date", "Start Time"])
            path = os.path.join(WORKSPACE_DIR, f"flights_{tag}_{SUFFIX}.csv")
            if os.path.exists(path) and not force:
                old_dates = pd.read_csv(path)["Date"].nunique()
                if sub["Date"].nunique() < old_dates:
                    print(f"{tag:12s} SKIPPED: existing file has {old_dates} dates, "
                          f"this run has {sub['Date'].nunique()} (use --force to overwrite)")
                    continue
            sub.to_csv(path, index=False, encoding="utf-8-sig")
            print(f"{tag:12s} {len(sub):5d} rows  {sub['Date'].nunique():3d} dates -> {os.path.basename(path)}")


async def amain(args):
    start = datetime.strptime(args.start, "%Y-%m-%d")
    end = datetime.strptime(args.end, "%Y-%m-%d")
    dates = [(start + timedelta(days=i)).strftime("%Y-%m-%d")
             for i in range((end - start).days + 1)]

    cache, cached_rows = load_cache(args.fresh)
    tasks = [{"date": d, "dir": direction} for d in dates for direction in ("out", "in")]
    pending = [t for t in tasks if f"{t['date']}|{t['dir']}" not in cache]

    print(f"range {args.start}..{args.end}  {len(dates)} days  "
          f"{len(tasks)} requests  ({len(tasks) - len(pending)} cached, {len(pending)} to fetch)")
    if not pending:
        print("everything cached; rebuilding CSVs only")
        write_master_csvs(cached_rows, args.force)
        return

    scraper = Scraper(args.workers, args.pages_per_context, cache, args.max_blocks)
    t0 = time.monotonic()
    await scraper.run(pending)
    rows = cached_rows + scraper.results
    print(f"\ndone in {(time.monotonic() - t0) / 60:.1f} min, "
          f"{len(rows)} flight rows, {scraper.blocked_hits} block events")
    if scraper.aborted:
        # Partial data would replace good fares with gaps; write nothing.
        print(f"ABORTED: Google blocked this machine more than {args.max_blocks} times. "
              "No CSVs written.")
        sys.exit(3)
    write_master_csvs(rows, args.force)
    print("\nnext: python build_workbook.py --from-master")


def main():
    global AIRPORTS, HUB, SUFFIX, CACHE_PATH
    ap = argparse.ArgumentParser(description="Resumable multi-airport flight scraper")
    ap.add_argument("--start", required=True)
    ap.add_argument("--end", required=True)
    ap.add_argument("--workers", type=int, default=4,
                    help="parallel browser contexts; >6 invites rate limiting")
    ap.add_argument("--pages-per-context", type=int, default=12,
                    help="recycle a context after this many page loads")
    ap.add_argument("--fresh", action="store_true", help="discard the resume cache")
    ap.add_argument("--resume", action="store_true", help="(default behaviour; kept for clarity)")
    ap.add_argument("--force", action="store_true",
                    help="allow overwriting master CSVs that cover more dates")
    ap.add_argument("--hub", default=HUB, help="hub airport IATA code, e.g. SIN")
    ap.add_argument("--airports", default=",".join(AIRPORTS),
                    help="comma-separated spoke airports, e.g. TRZ,MAA,CJB")
    ap.add_argument("--suffix", default=SUFFIX,
                    help="filename tag for output CSVs, e.g. aug_oct2026")
    ap.add_argument("--cache", default=CACHE_PATH, help="resume checkpoint path")
    ap.add_argument("--max-blocks", type=int, default=None,
                    help="give up (exit 3, no CSVs written) after this many block events; "
                         "default waits out blocks indefinitely")
    args = ap.parse_args()

    HUB = args.hub.strip().upper()
    AIRPORTS = [a.strip().upper() for a in args.airports.split(",") if a.strip()]
    SUFFIX = args.suffix
    CACHE_PATH = args.cache if os.path.isabs(args.cache) else os.path.join(WORKSPACE_DIR, args.cache)
    if HUB in AIRPORTS:
        sys.exit(f"hub {HUB} must not also be listed as a spoke airport")
    if not AIRPORTS:
        sys.exit("no spoke airports configured")

    # NOTE: do not set WindowsSelectorEventLoopPolicy here -- Playwright drives
    # the browser over a subprocess pipe, which the selector loop cannot create.
    asyncio.run(amain(args))


if __name__ == "__main__":
    main()
