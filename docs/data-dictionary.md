# Data dictionary

Every external field we use: where it comes from, its type after parsing, its
units, and what will bite you. Written from the recorded responses in
`samples/` (see `samples/manifest.json` for when they were captured).

Schemas live in `packages/shared/src/schemas/`. **Types below are the types
*after* Zod parsing** — several arrive as strings and are converted at the
boundary.

---

## Cross-cutting gotchas

| Gotcha | Detail |
| --- | --- |
| **Prices are in tenths** | `now_cost: 55` means £5.5m. Stays in tenths through the data layer; `tenthsToMillions()` converts for display only. |
| **Mixed numeric types** | Season totals arrive as **strings** (`"0.83"`); `*_per_90` fields arrive as **numbers**. The `numericString` schema helper converts; never do arithmetic on a raw value. |
| **Season-scoped IDs** | FPL player, team and fixture IDs, and football-data team IDs, are reassigned every season. Never hardcode one; never carry one across seasons. |
| **`CL` vs `UCL`** | football-data competition code **`CL` (id 2001) is the Champions League**. **`UCL` is the Conference League.** Using the wrong one produces a silently wrong congestion flag. |
| **TLAs are not unique** | `FCB` is both Barcelona and Bayern Munich; Bodø/Glimt reports `FK`. **Join on the numeric `id` only** — `packages/shared/src/teams.ts`. |
| **Rate-limit header names differ** | football-data documents `X-RequestsAvailable` but actually sends **`x-requests-available-minute`**, plus `X-RequestCounter-Reset`. Read both, case-insensitively. |
| **Unknown fields are stripped** | Schemas model only what we use. FPL adding a field is a non-event; FPL removing or retyping a field **we use** fails the parse loudly. |
| **Per-90 rates need minutes behind them** | `expected_goal_involvements_per_90` is arithmetically true and useless on a tiny sample: a player with **3 season minutes showed 12.9 xGI/90**. Scale any rate by the minutes supporting it before ranking on it |
| **Personal data in samples** | `fpl/entry.json` and `fpl/entry-picks.json` hold a real manager's team. Replace with anonymised samples before the repo goes public. |

---

## FPL `bootstrap-static/`

One call per run, shared across the whole job. 667 elements, 20 teams,
38 events in the captured sample.

### `elements[]` — players

**Identity and availability**

| Field | Type | Notes |
| --- | --- | --- |
| `id` | number | Season-scoped player id |
| `code` | number | Stable across seasons (useful for long-term joins) |
| `web_name` | string | Display name |
| `team` | number | FPL team id, joins `teams[].id` |
| `element_type` | number | 1 GKP, 2 DEF, 3 MID, 4 FWD |
| `status` | string | `a` available, `d` doubtful, `i` injured, `s` suspended, `u` unavailable, `n` not in squad |
| `news` | string | Free text; **empty string, not null**, when there is no news |
| `news_added` | string \| null | ISO-8601 with microseconds; null for 383/667 |
| `chance_of_playing_next_round` | number \| null | 0-100; **null means "no news", not 100** |
| `chance_of_playing_this_round` | number \| null | Same |

**Price**

| Field | Type | Notes |
| --- | --- | --- |
| `now_cost` | number | **Tenths of £m** |
| `cost_change_event` | number | Tenths, this gameweek |
| `cost_change_start` | number | Tenths, since season start |

**Ownership, form and minutes**

| Field | Type | Notes |
| --- | --- | --- |
| `selected_by_percent` | number | **String in the API**, 0-100 |
| `transfers_in_event` / `transfers_out_event` | number | This gameweek |
| `form` / `points_per_game` / `ep_next` | number | **Strings in the API** |
| `minutes`, `starts` | number | Season totals |
| `total_points`, `event_points`, `bonus`, `bps` | number | |

**Expected stats — the type trap**

| Field | Type | Notes |
| --- | --- | --- |
| `expected_goals`, `expected_assists`, `expected_goal_involvements`, `expected_goals_conceded` | number | **Strings in the API** |
| `expected_goals_per_90`, `expected_assists_per_90`, `expected_goal_involvements_per_90`, `expected_goals_conceded_per_90` | number | Already numbers |
| `influence`, `creativity`, `threat`, `ict_index` | number | **Strings in the API** |
| `defensive_contribution` | number | Season total |
| `defensive_contribution_per_90` | number | Already a number |

**Set pieces** — `penalties_order`, `corners_and_indirect_freekicks_order`,
`direct_freekicks_order`: `number | null`. Null means not on duty, and is the
common case (606, 586 and 608 of 667 respectively).

### `elements[].price_change_*` — undocumented price telemetry

Modelled **optional and nullable**: they are undocumented, and optional data
must never take down the core pipeline (CLAUDE.md §10). A test asserts they
are present in today's sample, so a disappearance is noticed immediately.

| Field | Type | Observed |
| --- | --- | --- |
| `price_change_percent` | number \| null | **String in the API.** Signed. Sample range -100.7 to 95.1 |
| `price_change_hourly_rate` | number \| null | Integer. Sample range **-1,191 to 2,700**; 340/667 negative |
| `price_change_projections` | array | Always exactly 3 entries, `offset` 0, 1, 2 |
| `price_change_projections[].projected_percent` | number | **String in the API.** Signed |
| `price_change_projections[].likelihood` | number | **Signed integer, observed -5..+5** |
| `price_change_locked_until` | string \| null | ISO-8601. Non-null for 24/667 |
| `price_change_calibrating` | boolean \| null | **`false` for all 667** in the sample |

### `elements[].scout_risks`

Observed shape (15 rows across all players, all `property: "loan_ineligible"`):
`{ property: string, notes: string, gameweek: number | null, url: string | null }`.
Optional, non-fatal. Other `property` values may exist — none seen yet.

### `teams[]`

| Field | Type | Notes |
| --- | --- | --- |
| `id`, `code` | number | `id` is season-scoped |
| `name`, `short_name` | string | e.g. `"Man City"`, `"MCI"` |
| `strength` | number \| **null** | **Null for all 20 teams** — do not use |
| `strength_overall_home`, `strength_overall_away` | number | **A 1-5 SCALE**, observed range 2-4, mean 3. **Not** the ~1000-1400 scale some FPL guides describe |
| `strength_attack_home/away` | number | Same 1-5 scale |
| `strength_defence_home`, `strength_defence_away` | number | **ZERO for all 20 teams.** Unusable; fall back to overall strength as a defensive proxy |

`form` and `team_division` are also null for all 20 teams — not modelled.

### `events[]` — gameweeks

| Field | Type | Notes |
| --- | --- | --- |
| `id` | number | 1-38 |
| `deadline_time` | string | ISO-8601 UTC. **Deadlines are UK local time in the UI** — always compute in UTC |
| `finished`, `data_checked` | boolean | `data_checked` means bonus and stats are final |
| `is_previous`, `is_current`, `is_next` | boolean | The current gameweek; all three can be false mid-transition |
| `highest_score`, `most_selected`, `most_captained`, `most_transferred_in`, `top_element` | number \| null | **Null for future gameweeks** (33/38 in the sample) |
| `average_entry_score`, `transfers_made` | number | |

---

## FPL `fixtures/`

380 fixtures. Premier League fixtures **always** come from here, never from
football-data.

| Field | Type | Notes |
| --- | --- | --- |
| `id`, `code` | number | |
| `event` | number \| null | **Null when not yet assigned to a gameweek** (postponements). 0 null in the sample, but handle it |
| `team_h`, `team_a` | number | FPL team ids |
| `team_h_score`, `team_a_score` | number \| null | Null before kickoff |
| `team_h_difficulty`, `team_a_difficulty` | number | **FPL's own difficulty, 1 (easiest) to 5 (hardest)** |
| `kickoff_time` | string \| null | ISO-8601 UTC |
| `started`, `finished` | boolean | |

---

## FPL `event/{gw}/live/`

**One call returns all 667 players for a gameweek** — this is why we never
sweep `element-summary` (CLAUDE.md §5).

**Confirmed: this endpoint includes per-player expected stats.**

| Field | Type | Notes |
| --- | --- | --- |
| `elements[].id` | number | Player id |
| `elements[].stats.expected_goals`, `expected_assists`, `expected_goal_involvements`, `expected_goals_conceded` | number | **Strings in the API** |
| `elements[].stats.influence`, `creativity`, `threat`, `ict_index` | number | **Strings in the API** |
| `elements[].stats.minutes`, `starts`, `bonus`, `bps`, `total_points`, `defensive_contribution`, goals/assists/cards/saves | number | |

`elements[].explain` (per-fixture points breakdown) exists but is not modelled
yet — add it if a report needs to show how points were earned.

---

## FPL `element-summary/{id}/`

Only for a small set of players of interest. `history[]` is per-gameweek,
`fixtures[]` is upcoming.

| Field | Type | Notes |
| --- | --- | --- |
| `history[].round` | number | Gameweek |
| `history[].value` | number | **Player price at the time, in tenths** — the source for price history |
| `history[].selected`, `transfers_in`, `transfers_out`, `transfers_balance` | number | |
| `history[].expected_*` | number | **Strings in the API** |
| `fixtures[].event` | number \| null | Null if unscheduled |
| `fixtures[].difficulty` | number | 1-5, **from this player's team's perspective** |
| `fixtures[].is_home` | boolean | |

---

## FPL `event-status/`

Tells us whether a gameweek is final, instead of guessing from flags.

| Field | Type | Notes |
| --- | --- | --- |
| `status[].event` | number | Gameweek |
| `status[].date` | string | `YYYY-MM-DD` |
| `status[].bonus_added` | boolean | |
| `status[].points` | string | `r` raw/live, `p` provisional, `c` confirmed |
| `leagues` | string | e.g. `"Updated"` |

---

## FPL `entry/{id}/` and `entry/{id}/event/{gw}/picks/`

The only live FPL call a visitor can trigger — cached per team ID per
gameweek and rate-limited per IP (CLAUDE.md §7).

| Field | Type | Notes |
| --- | --- | --- |
| `entry.last_deadline_value`, `last_deadline_bank` | number \| null | **Tenths** |
| `entry.summary_overall_rank`, `summary_event_rank` | number \| null | Null before the first gameweek |
| `picks[].element` | number | Player id |
| `picks[].position` | number | 1-15; 1-11 start, 12-15 bench |
| `picks[].multiplier` | number | **0 = benched**, 1 = playing, 2 = captain, 3 = triple captain |
| `picks[].is_captain`, `is_vice_captain` | boolean | |
| `entry_history.bank`, `value` | number | **Tenths** |
| `active_chip` | string \| null | |

---

## football-data.org `/v4/competitions/PL/teams`

Used once, to build the team map. **Join on `id` only.**

| Field | Type | Notes |
| --- | --- | --- |
| `teams[].id` | number | The only safe join key |
| `teams[].name` | string | e.g. `"Manchester City FC"` — note the `FC`/`AFC` suffixes |
| `teams[].shortName` | string \| null | e.g. `"Man City"` |
| `teams[].tla` | string \| null | **Not unique — never join on this** |

Name normalisation for mapping: strip `FC`/`AFC`, expand `&` to `and`, drop
apostrophes and accents, then apply aliases for FPL's abbreviations
(`Man City`, `Man Utd`, `Spurs`, `Nott'm Forest`, `Newcastle`, `Leeds`,
`Brighton`). All 20 matched with no ambiguity this season.

## football-data.org `/v4/competitions/CL/matches`

`?dateFrom=&dateTo=&status=SCHEDULED,TIMED`, one request per day. Used
**only** for Champions League fixture dates of PL clubs.

| Field | Type | Notes |
| --- | --- | --- |
| `matches[].id` | number | |
| `matches[].utcDate` | string | ISO-8601 UTC |
| `matches[].status` | string | `SCHEDULED`, `TIMED`, `IN_PLAY`, `FINISHED`, `POSTPONED`, ... |
| `matches[].stage` | string | `LEAGUE_STAGE`, `PLAYOFFS`, `LAST_16`, ... |
| `matches[].matchday` | number \| null | |
| `matches[].homeTeam.id` / `awayTeam.id` | number | Join key into the team map |

**Refresh every run.** Knockout fixtures do not exist until the league stage
finishes, so a cached "season's fixtures" silently goes stale.

**The window must look backward too, and include `FINISHED`.** The congestion
flag needs matches that were already played; without them `is_after_cl` can
never fire and `days_since_cl` is always null. Use
`status=SCHEDULED,TIMED,IN_PLAY,PAUSED,FINISHED` with a **35-day lookback** and
a ~45-day forward window, in one request.

**How many rows to expect.** The window decides this, and it is easy to
misread. In the captured sample the forward window reached matchdays 2, 3 and
4 only (18 matches each, 54 total). Five Premier League clubs are in the
competition and each plays once per matchday, so those three matchdays yield
**15** club-perspective rows, and the 35-day lookback adds matchday 1 (played
8-10 September) for **20** in total. The full league stage is 8 matchdays, so
the whole remaining season would be 7 x 5 = **35** rows — that figure describes
the season, not a 45-day window.

The free tier covers 12 competitions: **Europa League, Conference League and
domestic cups are not included**, so the congestion flag covers **Champions
League games only** and the UI must say so.

---

## To be confirmed by observation

Open questions. We store the price-change fields daily from Phase 2 and settle
these against our own history rather than guessing.

1. **What does `price_change_percent` actually measure?** It is signed, and
   its magnitude can exceed 100 (`-100.7` observed here; `103.8` seen in
   manual exploration) **without an immediate price change**. Hypotheses:
   changes apply only at the nightly update; or a change is suppressed by
   `price_change_locked_until` / `price_change_calibrating`. Until confirmed,
   **crossing 100% is never reported as a confirmed change**.
2. **What does `price_change_hourly_rate` mean, and why does its sign
   disagree with the percent?** It is definitely **signed**: range -1,191 to
   2,700, 340/667 negative, and its sign disagrees with
   `price_change_percent` for **113 of 667 players**.

   **Working hypothesis:** `price_change_percent` is the **position** toward a
   change (how far along the player is) and `price_change_hourly_rate` is the
   **current momentum** (which way they are moving right now). Under that
   reading a disagreement is meaningful rather than contradictory — a player
   deep into falling territory whose transfers have turned positive is a
   reversal in progress, and exactly the case worth alerting on.

   So we **keep the sign** and expose it as `hourly_rate` alongside
   `hourly_rate_magnitude`, plus a `momentum` column (`with` / `against` /
   null). `momentum` is **EXPERIMENTAL** and labelled as such in the view
   comments.

   **The rule is unchanged: direction comes ONLY from
   `price_change_percent`.** Never from the rate, and never from `momentum`.
   Confirm or kill the hypothesis by checking whether `against` players
   actually reverse before their price moves, using the signed `min_rate`,
   `max_rate` and `close_rate` columns kept forever in
   `core.price_observation_daily`.
3. **What is `likelihood`?** A signed integer observed across -5..+5, present
   on all three projections. Sign agrees with `price_change_percent` for all
   but 20 players. Is it a confidence band, a bucketed rate, or something
   else?
4. **What is `offset`?** Always 0, 1, 2 — presumably days ahead. Confirm by
   checking whether `offset: 0` predicts tonight's change.
5. **When is `price_change_locked_until` set?** Non-null for 24/667, and
   **every locked player had `price_change_percent` exactly `0.0`** — so a
   lock may reset the counter. New signings? Recently changed players?
6. **Does `price_change_calibrating` ever become true?** `false` for all 667
   here. Likely set for new players with no transfer history.
7. **Why is `strength_defence_*` zero for every team**, and does it ever get
   populated? Until it does, goal threat uses overall strength as the
   defensive proxy, which conflates a good attack with a good defence.
8. **Is `elements[].status` enough for injury alerts**, or do we need
   `news` text diffing to catch "return date" changes that leave the status
   unchanged?
