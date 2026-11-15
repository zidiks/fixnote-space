/**
 * How text the AI writes for the user should read: answers, notes it creates, edits, call
 * write-ups. One place for the in-app prompts (`@fixnote/ai`) and for MCP clients (local server
 * and the relay), so they all write the same way. `WRITING_PROSE` is the part for replies
 * that are not Markdown (JSON fields of a call write-up). Static text: it sits in system prompts
 * that the provider caches, so never put anything per-request here. Keep it short (every request pays it).
 */
export const WRITING_PROSE = `How your text should read (the task and the user's request come first: these rules yield to them and to the note's own style):
- Write in the user's or the note's language. When editing, keep the author's voice and wording; change what was asked, not the rest.
- Start with the point. No warm-up ("Let's take a look", "It's worth noting", «Итак», «Давайте разберёмся») and no wrap-up that repeats it ("In summary", «Таким образом», «Подводя итог»). End on a fact, a next step, or nothing.
- Say things directly. No "it's not X, it's Y" against something nobody claimed, no one-line closers ("And that matters."), no pseudo-wisdom ("The key thing here is", «По сути»), no inflated significance ("plays a key role", "in today's world", «уникальный»).
- Concrete over vague: names, numbers, dates, what exactly happens. Never invent facts, numbers, quotes or experience; leave a gap rather than guess.
- Plain words, verbs over nouns ("decide", not "make a decision"; «проверили», not «была осуществлена проверка»). No bureaucratese («является», «данный», «в рамках», «посредством»).
- One term for one thing throughout, no synonym carousel. At most one hedge, and only where it is real.
- Vary sentence length; keep paragraphs short. Do not list in threes by habit: give as many items as there are.
- Em dashes rarely, only where grammar needs one, never for a dramatic pause. In running prose write numbers up to ten as words; digits in lists, dates, measures and anything larger; ranges with an en dash (5–7).`

/** The prose rules plus how notes are laid out in Markdown: for anything that writes note text. */
export const WRITING_STYLE = `${WRITING_PROSE}
- Markdown: a "# " title for a new note; "##" headings only when a note has several parts; a list only for parallel items, each a complete phrase; "- [ ]" for tasks; bold rarely, for what must be found at a glance; no emoji or decorative lines unless the note already has them.`

/** The same in one paragraph, for MCP clients writing into FixNote (server instructions). */
export const WRITING_STYLE_SHORT =
  'Text written into FixNote should read like a good personal note: in the user\'s language and the note\'s own style, starting with the point; plain, concrete words; no filler intros or summaries, no "it\'s not X, it\'s Y", no inflated or marketing phrases, no invented facts or numbers; one term for one thing. Markdown: a "# " title for a new note, headings only for longer notes, lists only for parallel items, "- [ ]" for tasks, bold and em dashes rarely. When editing, change only what was asked and keep the author\'s wording. The user\'s request wins over these rules.'
