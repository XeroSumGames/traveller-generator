# Traveller generator - state model

The other four Xero Sum Games generators are linear wizards: a fixed `STEPS` array, a single
`S` state object, and `stepValid(i)` gating a Continue button. **That model does not fit
Traveller** and should not be forced onto it.

## Why the wizard model breaks

Traveller creation is a loop of unknown length with irreversible history:

- A term is a cycle - qualify, train, survive, event, advance - repeated an arbitrary number
  of times. There is no fixed step count to put in a `STEPS` array.
- Outcomes are **rolled, not chosen**. Fail survival and a mishap ejects you. Roll a natural 12
  on advancement and the career *forces* you to stay another term. The user does not get to go
  back and pick differently, so `stepValid()` - which asks "is this step's input complete?" -
  is answering the wrong question.
- Each term **appends to a permanent history**: skills gained, rank held, associates met,
  benefit rolls banked. Nothing is recomputed from current form state the way a point-buy is.
- Age accrues (+4/term) and drives ageing rolls, so terms are not interchangeable.

Trying to express this as `S.step` would mean either an unbounded `STEPS` array or a fake
step that secretly loops - both fight the data.

## The model to build instead

Two layers.

**1. Phase machine** (the outer, linear spine, from the book's own flowchart on printed pp14-15):

    characteristics -> background -> [pre-career education] -> TERM LOOP -> mustering out
      -> skill package -> done

Only the outer phases are wizard-like. `TERM LOOP` is a single outer phase that re-enters
itself.

**2. Term machine** (the inner cycle, one pass per 4-year term):

    start term -> qualification -> basic training | skill table roll -> survival
      -> [mishap -> leave career] -> event -> [commission] -> advancement -> continue?

`continue?` is the only branch the user drives freely; everything else is either a roll or a
choice constrained by the roll.

## State shape

    S = {
      phase: 'characteristics' | 'background' | 'education' | 'terms' | 'mustering' | 'package' | 'done',
      chars: {STR,DEX,END,INT,EDU,SOC,PSI},
      homeworld, backgroundSkills: [],
      skills: { 'Gun Combat (slug)': 2, ... },     // flat map, the single source of truth
      education: null | {type, entered, graduated, honours, events: []},
      terms: [                                      // append-only history, never mutated in place
        { n, age, career, assignment, rank, commissioned,
          qualified, drafted, basicTraining, skillRolls: [],
          survived, mishap, event, advanced, leftBecause }
      ],
      current: {...} | null,                        // the term being played, folded into terms[] on completion
      draftUsed: false,                             // once per lifetime
      benefitRolls: {cash: n, benefits: n},         // banked, spent at mustering out
      associates: [{type, note}],
      pendingChoice: null                           // what the UI is currently asking for
    }

`terms[]` being append-only is what makes the printed career history and the "terms served in
this career" advancement check trivial - both are just reads over the array.

## The part that needs care

`pendingChoice` is the crux. Because outcomes are rolled, the UI is often **reporting** rather
than asking, and sometimes asking a question that only exists because of a roll ("your mishap
ejected you - draft or Drifter?"). The renderer should switch on `pendingChoice.kind` rather
than on a step index. Kinds needed:

    pickCareer, pickAssignment, pickSkillTable, pickSkillFromList, resolveMishapChoice,
    offerCommission, continueOrLeave, changeAssignment, spendBenefits, pickPackage

## Verification consequence

The harness cannot enumerate "every step x every archetype" the way space1999's did. Instead:

- **Seed the RNG** and replay whole lifepaths deterministically, asserting invariants at every
  term boundary: age = 18 + 4*terms, no skill above 4, total skill levels within cap, rank
  never negative, draft used at most once, a career never re-entered the term immediately
  after leaving it.
- **Fuzz thousands of full lifepaths** and assert the run always terminates and always lands in
  `done` - the real risk in a loop model is a state that can never exit.
