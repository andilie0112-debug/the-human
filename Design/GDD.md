# The Human — Game Design Document

Version 0.1, November 2026. Owner: Andi Lie.

## 1. Pitch

A 3D life simulation that runs in the web browser (phones first), set in real Indonesian daily life. You create a person, choose their religion, ethnicity and city, move into a small boarding room (kos), apply for jobs, go to interviews, get paid on the 25th, fast during Ramadan or receive angpao at Imlek, go home for mudik, fall in love, and work your way up to a house of your own. Inside the house it plays like a classic life sim; outside, you walk or ride a motorbike through a living neighborhood.

**Pillars**

1. **Feels alive.** Characters move, animate and act on their own when left alone. The neighborhood has people, traffic, day and night, rain and flooding.
2. **Feels Indonesian.** Real wages, real prices, real transport, real holidays, real traditions, local food and greetings per city.
3. **Respectful diversity.** Every religion and ethnicity is equally playable and represented through traditions, never stereotypes.
4. **Simple on a phone.** Tap to move and interact, a joystick outside, and an in-game smartphone as the menu.

**Target:** Indonesian players 16+, mobile browser first (landscape), installable as a web app, free-to-play with fair monetization (see section 12). A Play Store release can wrap the web app later.

## 2. Game modes

| Mode | Camera | Controls | Purpose |
|---|---|---|---|
| Live mode (home) | Angled overhead, orbit, pan, pinch zoom, walls cut away | Tap floor to walk, tap object for action menu, action queue at the top | Daily life: needs, skills, cooking, sleeping, worship |
| Build/Buy mode (home) | Top-down/angled, grid | Drag and drop, rotate, sell to storage | Furnish and arrange; feng shui scoring for Chindo characters |
| Neighborhood (open world) | Third person behind the character | Virtual joystick, run button, interact button, ride/dismount | Travel to work, warung, market, mall, places of worship, friends |
| Phone | Full-screen UI over any mode | Taps | Jobs, bank, chat, shopping, food delivery, tickets, calendar, property, side business, map/fast travel |

Fast travel from the phone map is always available (with transport cost and time) so players who dislike driving are never forced to.

## 3. Character creation

- Name, gender, starting age: 18 (SMA/SMK graduate, Rp2.5 million savings), 22 (fresh S1 graduate, Rp3.5 million), 25 (S1 + 2 years experience, Rp8 million), 30 (S1 + 5 years, Rp20 million and a motorbike).
- Appearance: body shape, skin tone, face presets, hairstyles, hijab styles, clothing per occasion (daily, work, formal, sleepwear, worship).
- Religion: Islam, Kristen, Katolik, Hindu, Buddha, Konghucu.
- Father's ethnicity and mother's ethnicity (may differ): Jawa, Sunda, Chindo (Tionghoa), Batak, Minang, Betawi, Bugis-Makassar, Bali. More later.
- City: Jakarta, Bandung, Karawang, Surabaya, Semarang, Yogyakarta, Medan, Makassar, Denpasar, Batam.
- Two traits from: Rajin (faster work performance), Santai (slower stress), Ramah (faster friendships), Hemat (10% cheaper shopping), Kreatif (faster creative skill), Sporty (better exercise).
- **Perantau status** is derived: if the city is not a home city of either parent's ethnicity, the character is a migrant with a "kangen kampung" (homesick) meter and mudik options.

## 4. Needs, mood and health

Needs (0–100, decay over time, faster when working or in hot rooms without a fan/AC): Kenyang (hunger), Energi, Bersih (hygiene), Sosial, Hiburan (fun). Plus Stres (0–100, higher is worse), Kesehatan (health) and Kangen (homesick, migrants only).

- Mood = weighted average of needs and inverse stress, plus buffs (Tenang after worship, Liburan after a holiday) and penalties (sick, homesick, negative balance).
- Low needs raise stress. Stress 95+ triggers burnout (forced long sleep).
- Health drops when starving or exhausted; below 30 the character may fall sick (fever). Clinic visits cure sickness; covered by BPJS when formally employed.
- **Autonomy:** when the player gives no orders, the character picks the best-scoring advertised action nearby (utility AI), weighted by need urgency, traits and distance. Autonomy can be set to Off, Low, Full.

## 5. Time and calendar

- Game starts on 1 January 2027, 07:00, in a kos room.
- Speeds: Pause, 1x, 2x, 3x. Sleep and work fast-forward.
- Monthly: rent or mortgage on the 1st, mobile data, paylater installments. Salary on the 25th.
- Calendar with holidays and public days off (see `Data/holidays.json`). THR (religious holiday allowance) is paid 7 days before the character's own religion's main holiday, prorated if employed less than 12 months.
- Ramadan for Muslim characters with fasting enabled: eating is locked between 04:30 and 18:00, hunger decays slower, sahur and buka moments, bukber invitations, Lebaran at the end.
- Birthday every 1 January in game time; the character ages.

## 6. Work and money

**Job hunting flow:** Loker app lists jobs available in the city (refreshed every Monday, filtered by the city's industries) → send CV → wait 1–4 days → possible outcomes: rejected for education, invited to interview, or ghosted (about 20%) → travel to the interview on the scheduled day 09:00–15:00 → three interview questions with answer choices → result based on answers, charisma, hygiene, smart clothes, mood, experience and missing skills → offer with salary, hours and work days → starts next Monday.

**On the job:** go to work during shift hours (late = performance penalty), work fast-forwards, lunch is bought automatically, overtime requests, absences without notice lead to warning letters (SP1–SP3) and dismissal, sick leave via chat with the boss, 12 days of annual leave, monthly promotion check (Senior → Supervisor → Manager, +20% salary each), rare layoffs with severance.

**Payslip:** gross salary, BPJS deduction (4%), estimated income tax above a threshold, absence deductions, net pay.

**Other income:** freelance design (needs laptop and creative skill), online shop (Lapak), ride-hailing driver (needs motorbike), arisan.

**Spending:** street food, market groceries (cheaper), food delivery, transport per trip, furniture, electronics, clothes, electricity tokens, gifts at weddings (amplop), loans to relatives, holidays, mudik tickets, paylater with interest.

**Housing:** kos room → rented house (kontrakan) → own house with a 15-year mortgage (10% down payment, 8% interest, requires 6 months of employment and salary ≥ 3× installment).

Jobs and salary multipliers are in `Data/jobs.json`. Salaries = city minimum wage × job multiplier × experience bonus.

## 7. Cities

Each city is a data profile (`Data/cities.json`): 2026 minimum wage (official where known, flagged estimates for Medan, Makassar, Denpasar), kos rent, street meal price, house price, dominant industries, public transport options and names (KRL, MRT, TransJakarta, angkot, pete-pete, BRT), signature food, local attraction, greeting, hot climate flag, flood risk (banjir or rob) and traffic jam risk.

**Visual identity per city** (open world): one shared neighborhood layout re-dressed per city with different signage, food stalls, vehicles, landmarks on the skyline, architecture details (for example Balinese gates in Denpasar, ruko rows in Medan, a canal and old buildings in Semarang).

## 8. Religion and culture

**Religion** (`Data/religions.json`) defines the home worship object, daily worship action, place of worship in the neighborhood, main holiday and THR date.

| Religion | Home object | Daily action | Neighborhood place | Key events |
|---|---|---|---|---|
| Islam | Sajadah | Sholat | Masjid | Ramadan, Idul Fitri, Idul Adha (kurban) |
| Kristen | Cross and Bible | Prayer, Bible reading | Gereja (Sunday service) | Good Friday, Easter, Christmas |
| Katolik | Cross, rosary, Bible | Rosary prayer | Gereja Katolik (Mass) | Good Friday, Easter, Christmas |
| Hindu | Small pelinggih | Prayer with canang sari | Pura | Nyepi (stay home, no lights), Galungan |
| Buddha | Buddha altar | Puja and meditation | Vihara | Waisak |
| Konghucu | Ancestor altar | Ancestor prayer | Klenteng | Imlek, Cap Go Meh, Ceng Beng |

**Ethnicity** (`Data/ethnicities.json`) adds traditions as events: Jawa selametan, Sunda botram, Chindo family dinners, angpao at Imlek (receive if unmarried, give if married), Ceng Beng, and feng shui scoring in build mode; Batak marga celebrations; Minang merantau business offers; Betawi kampung festivals; Bugis-Makassar family gatherings; Bali ngayah at the banjar. Each ethnicity has its own wedding ceremony option.

**Everyone:** 17 Agustus neighborhood games, open houses at Lebaran, Christmas greetings, New Year fireworks.

**Feng shui (Chindo characters):** score 0–5 from rules such as bed against a wall, bed not in line with the door, mirror not facing the bed, plant in a corner, desk not with its back to the door. A higher score improves luck in random events.

## 9. Social life

- NPCs have names from diverse backgrounds, a role (neighbor, coworker, café acquaintance) and a relationship value 0–100.
- Meet new people at cafés, parks, gyms, places of worship and work.
- Actions: chat, call, hang out (costs money), confess feelings (relationship 70+), propose (90+ and dating 60+ days).
- Weddings: simple at KUA/civil registry, or a full traditional ceremony matching the character's ethnicity (higher cost).
- Family: video calls, mudik, family events. Children are a later feature.

## 10. Random events (examples)

Electricity token running out, wedding invitations, relatives borrowing money, overtime requests, noisy neighbors, cracked phone screen, lucky money, flash sales, arisan, floods closing roads, traffic jams, sickness, layoffs, ethnicity and religion events, national holidays. Every event is a data asset with conditions, weight and choices.

## 11. Open world (neighborhood)

- One compact neighborhood per city variant, about 400 × 400 m: a main road, small alleys (gang), the character's kos/house, warung, traditional market, minimarket, mall entrance, café, gym, clinic, office or factory gate, places of worship for all six religions, park, ride-hailing base and a bus/train stop for fast travel.
- Walking with a virtual joystick, running, riding an owned motorbike (later a car). Pedestrian NPCs on sidewalks, motorbike and car traffic on simple waypoint lanes, street vendors.
- Enterable interiors for key places, or interaction zones at the door that open the place's action list (cheaper first version).
- Day and night lighting, street lamps, rain in the rainy season, puddles and blocked roads during floods.
- No crime, violence or police chases: the open world is about daily life, travel and discovery.

## 12. Monetization (later)

Rewarded ads for small boosts, cosmetic items (clothes, furniture, house styles), an ad-free premium unlock. Never sell career progress or relationship outcomes. Local brand sponsorships only through real agreements.

## 13. Art direction

- Goal: warm, semi-realistic stylized 3D that reads well on a phone screen, with expressive characters and cozy interiors. Original style, not a copy of any commercial game.
- Characters: rigged glTF humanoids sharing one skeleton so animations can be reused. Candidate free sources: CC0 character packs (for example Quaternius and Kenney), Mixamo characters and animations, or purchased stylized packs exported to GLB. Requirements: under about 15k triangles per character, modular parts or material swaps for skin, hair, hijab and outfits.
- Animations: Mixamo (free) for walking, sitting, sleeping, cooking, eating and talking, converted to GLB. Praying animations must be respectful and reviewed with people of each faith before release.
- Environments and props: CC0 low-poly city, interior and furniture packs (for example Kenney and Quaternius), plus custom-made Indonesian items (gerobak, angkot, warung, pelinggih, bedug, klenteng lanterns), all as optimized GLB.
- Every asset is logged in `ASSET_LICENSES.md`.

## 14. Technical targets

Runs in Chrome and Safari on phones from roughly 2021 onward, landscape, 30 fps on mid-range phones and 60 fps on PC, first load under 15 MB with lazy loading for the neighborhood and cities, three local save slots in the browser plus an export code, works offline once installed as a web app. Cloud save and login later.

## 15. Open questions

- Final character system choice after testing on a real phone.
- Whether neighborhood interiors are full 3D or door interaction zones in the first release.
- Children and aging beyond the young-adult stage.
- Exact yearly holiday calendar source (the prototype reuses approximate 2027 dates every year).
