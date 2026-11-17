/**
 * The demo device's notes (demo.ts): what an AI-app reviewer finds in the demo account. Made up,
 * in English, a little of everything the tools handle: folders with a subfolder, tasks, a link
 * note, daily notes. Change `DEMO_VERSION` with them, so the device starts over with the new set.
 */
export const DEMO_VERSION = 1

export interface DemoNote {
  /** Folder path, '/' between levels; none = no folder. */
  folder?: string
  /** Days ago it was last edited (fractions for hours). */
  ago: number
  content: string
  /** A daily note for the day `ago` days back. */
  daily?: boolean
}

export const DEMO_NOTES: DemoNote[] = [
  {
    folder: 'Work',
    ago: 0.1,
    content: `# Q1 planning

Goals for the quarter:
- Ship the new onboarding by February 15
- Cut sign-up to first note under 60 seconds
- Hire one more designer

- [ ] Send the draft to Maya by Friday
- [ ] Book the planning room for Monday
- [x] Collect numbers from last quarter`,
  },
  {
    folder: 'Work/Meetings',
    ago: 1.2,
    content: `# 1:1 with Maya

- She wants to own the onboarding project end to end
- Worried about the support queue after launch
- Next: write down who answers launch-week tickets

- [ ] Draft the support rota for launch week`,
  },
  {
    folder: 'Work/Meetings',
    ago: 6,
    content: `# Design review: onboarding

Three screens instead of five. Skip the tour; show an example note instead.
Open question: ask for the name on the first screen or later?
Decision: later, after the first note is saved.`,
  },
  {
    folder: 'Work',
    ago: 9,
    content: `# Launch checklist

- [x] Pricing page copy
- [x] Screenshots in English and Spanish
- [ ] Press kit
- [ ] Email to the waitlist
- [ ] Post on the blog`,
  },
  {
    folder: 'Travel',
    ago: 2,
    content: `# Lisbon in March

Flights: TAP, March 14 → March 21, booked.
Stay: apartment in Alfama, check-in after 3 pm.

Ideas:
- Surfing lesson in Ericeira
- Fado bar Tiago recommended in Mouraria
- Day trip to Sintra, go early

Budget: about 1,200 € for the week.`,
  },
  {
    folder: 'Travel',
    ago: 20,
    content: `# Packing list

- Passport, charger, adapter (type F)
- Rain jacket
- Running shoes
- Headphones for the flight`,
  },
  {
    folder: 'Reading',
    ago: 4,
    content: `# Thinking, Fast and Slow: notes

System 1 is fast and automatic, System 2 slow and deliberate.
Anchoring: the first number you hear pulls every estimate after it.
Use it: write down your own estimate before looking at anyone else's.`,
  },
  {
    folder: 'Reading',
    ago: 11,
    content: `# Books to read

- The Design of Everyday Things (Don Norman)
- Four Thousand Weeks (Oliver Burkeman)
- Project Hail Mary (Andy Weir)
- Atomic Habits (James Clear), started`,
  },
  {
    folder: 'Reading',
    ago: 3,
    content: `# The Zettelkasten method
https://en.wikipedia.org/wiki/Zettelkasten

> A Zettelkasten is a method of note-taking and personal knowledge management.

Small notes, one idea each, linked to each other. Worth trying for book notes.`,
  },
  {
    folder: 'Health',
    ago: 1,
    content: `# Running plan

Mon easy 5 km, Wed intervals 6 × 400 m, Sat long run 10–12 km.
Half marathon on April 12. Target pace 5:30 per km.

- [ ] Buy new running shoes before the long runs get longer`,
  },
  {
    folder: 'Health',
    ago: 15,
    content: `# Dentist

Check-up every six months. Last visit October 3, next in April.
Dr. Alvarez, Tuesday and Thursday mornings.`,
  },
  {
    folder: 'Home',
    ago: 5,
    content: `# Apartment

- [ ] Fix the bathroom tap
- [ ] Call the landlord about the heating
- [x] Pay the internet bill

Wi-Fi router is in the hallway cupboard; restart it before calling support.`,
  },
  {
    folder: 'Home',
    ago: 8,
    content: `# Recipes: weeknight pasta

Garlic, chili, olive oil, lemon zest, parsley. 15 minutes.
Add white beans to make it a full meal.`,
  },
  {
    folder: 'Ideas',
    ago: 0.5,
    content: `# App idea: voice journal

Record a minute at the end of each day, get the text and a weekly summary of moods and themes.
Everything stays on the phone.`,
  },
  {
    folder: 'Ideas',
    ago: 13,
    content: `# Gift ideas

- Mom: a cooking class for two
- Leo: the new Lego Technic set
- Sara: a good fountain pen`,
  },
  {
    ago: 0.2,
    daily: true,
    content: `- [ ] Review the onboarding copy
- [ ] Call the bank about the card
- [x] Morning run, 5 km

Lunch with Tiago moved to Thursday.`,
  },
  {
    ago: 1,
    daily: true,
    content: `- [x] Send invoices
- [ ] Book the dentist

Idea for the blog: how we test with real users every week.`,
  },
  {
    ago: 2,
    daily: true,
    content: `- [x] Planning meeting
- [x] Groceries

Felt tired in the afternoon; go to bed earlier.`,
  },
]
