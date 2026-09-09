# Where the customer data lives, and why it is not here

## The situation

`travisliscumb-netizen/Test` is a **public** GitHub repository.

Before this rebuild, `index.html` on `main` contained roughly a hundred real
customer addresses with coordinates, service notes, a gate code, and a
customer's first name and phone number — all readable by anyone, and all still
present in the git history.

The route is 238 real properties in Barrie and Midhurst, their access
instructions, and a season of service history. That is customer data. A static
host serves whatever it is given to anyone who guesses the path, with no
sign-in of any kind.

## The rule

**Customer data never enters this repository, and never enters a deployed
bundle.**

`.gitignore` blocks the file names the data actually arrives under:

```
private/
*.private.json
data/seed-1.0.json
data/backup-1.0*.json
data/verified-coords.json
teds-route-bundle*.json
shots/
```

Screenshots are excluded too — they show real addresses.

## How the app gets the route instead

On first run the app asks for a route file. It is an ordinary Ted's Route
backup, so it goes through exactly the same validated restore path as any later
restore: parsed, checksum-verified, counted, summarised, and only then applied.
One code path, one set of checks.

Keep the file in Files or iCloud Drive. Select it once. After that the route
lives in IndexedDB on the phone and the file is only a backup.

## Building the route file

The three source files from the 1.0 checkpoint —

| file | what it is |
|---|---|
| `seed-1.0.json` | the master route list: 238 addresses, crew, day, order, notes |
| `backup-1.0-2026-08-27.json` | the 1.0 backup: coordinate edits and a season of history |
| `verified-coords.json` | the coordinate overlay: 1 field-confirmed pin + 128 municipal address points |

— are merged by `tools/build-bundle.mjs` into one restore file:

```
node tools/build-bundle.mjs <dir with the three files> teds-route-bundle.json
```

It prints a reconciliation, which must match:

```
  total                238
  active               235
  with coordinates     238
    human-confirmed      1
    from 1.0 edits      67
    from 1.0 seed       42
    overlay geocoded   128
    rejected (region)    0
```

Anything else means one of the three inputs is the wrong vintage — the count
that is short names which one.

This is the acceptance test the previous build defined and never passed on the
phone, because its import screen called the overlay file "optional" and enabled
its button without it, so 129 properties silently arrived unmapped. In this
version the three files are merged **once, here**, into a single file with a
checksum, and the phone imports one thing. There is no third file to forget.

## Decision: the repository is private

The owner chose to make `travisliscumb-netizen/Test` **private** rather than
rewrite history. That keeps every commit, needs no force-push, and stops any
further exposure immediately.

### What that does not undo

The repository was public from 3 August 2026 until the change. Making it
private now removes it from public view; it does not reach anything that was
already taken while it was open — clones, forks, or third-party caches and
mirrors. So:

- Treat the addresses that were committed to `main` as **having been public.**
- **Rotate the gate code** that appeared in the old `index.html`. It is the one
  item in that file that is a live credential rather than a fact about a
  property, and it is the only one that can be changed.

Nothing further is required in the code: the working tree no longer contains
any customer data, and `.gitignore` blocks the file names it arrives under.

### The hosting consequence

GitHub Pages serves sites from **public** repositories on the free plan; a
private repository needs a paid plan. Pages was never enabled here, so nothing
goes down — but that route to getting the app onto the phone is now closed.

The app still needs to be served over **HTTPS** for two reasons that are not
optional:

- a service worker will not register otherwise, so there is no offline mode;
- **Add to Home Screen** will not give the standalone shell.

Free tiers that deploy from a *private* GitHub repository:

| host | notes |
|---|---|
| Vercel | Hobby tier, private repos included |
| Netlify | free tier, private repos included |
| Cloudflare Pages | free tier, private repos included |

**Publishing the app is safe.** The deployed bundle contains no address, no
coordinate, no note and no shop location — that is the whole point of the
split. The route lives in one file the operator holds and restores onto the
phone, and after that it lives only in that phone's IndexedDB. A public URL
serving this program discloses nothing about any customer.
