/* VERIFY 1 -- fuzz the term-loop engine over whole lifepaths.
   Per DESIGN.md: the real risk in a loop model is a state that never exits, so every
   run must terminate; and invariants must hold at every term boundary.
   Run: node src/harness.js [runs]
*/
var fs = require('fs'), path = require('path');
var E = require('./engine.js').TravellerEngine;

var DIR = path.join(__dirname, 'data');
function J(p) { return JSON.parse(fs.readFileSync(path.join(DIR, p), 'utf8')); }

var DATA = { core: J('core-rules.json'), loop: J('term-loop.json'), muster: J('mustering-out.json'), careers: {} };
fs.readdirSync(path.join(DIR, 'careers')).forEach(function (f) {
  var c = J(path.join('careers', f));
  DATA.careers[c.key] = c;
});

var checks = 0, fails = [];
function ok(cond, label) { checks++; if (!cond) fails.push(label); }

var MAX_TERMS = 12;

function playLifepath(seed) {
  var S = E.start(DATA, seed);
  var rng = S.rng;

  // background skills
  var n = S.pending.count, opts = S.pending.options.slice();
  ok(n >= 0 && n <= 6, 'seed ' + seed + ': background count in 0..6 (got ' + n + ')');
  for (var i = 0; i < n; i++) {
    var pick = opts.splice(Math.floor(rng.next() * opts.length), 1)[0];
    if (S.skills[pick] === undefined) S.skills[pick] = 0;
  }
  S.phase = 'terms';

  var guard = 0;
  while (S.terms.length < MAX_TERMS) {
    if (++guard > 200) { fails.push('seed ' + seed + ': LOOP DID NOT TERMINATE'); return S; }

    var careers = E.careerOptions(S);
    ok(careers.length > 0, 'seed ' + seed + ': at least one career always available');
    var careerKey = rng.pick(careers);
    var c = DATA.careers[careerKey];
    var asg = rng.pick(c.assignments).key;

    var q = E.qualify(S, careerKey, asg);
    var enteredVia = 'qualified';
    if (!q.ok) {
      // draft (once per lifetime) or Drifter
      if (!S.draftUsed && rng.next() < 0.5) {
        S.draftUsed = true;
        var row = DATA.loop.draft.table[rng.d6() - 1];
        careerKey = row.career.toLowerCase();
        if (!DATA.careers[careerKey]) careerKey = 'drifter';
        c = DATA.careers[careerKey];
        asg = rng.pick(c.assignments).key;
        enteredVia = 'draft';
      } else {
        careerKey = 'drifter'; c = DATA.careers[careerKey]; asg = rng.pick(c.assignments).key;
        enteredVia = 'drifter-fallback';
      }
    }

    E.enterCareer(S, careerKey, asg);
    S.current.enteredVia = enteredVia;
    ok(S.current !== null, 'seed ' + seed + ': current term created');

    // skill roll
    var tables = E.availableSkillTables(S);
    ok(tables.length >= 3, 'seed ' + seed + ': at least 3 skill tables offered for ' + careerKey);
    if (DATA.careers[careerKey].skill_tables.advanced_education === null) {
      ok(!tables.some(function (t) { return t.key === 'advanced_education'; }),
        'seed ' + seed + ': drifter offers no advanced education table');
    }
    E.rollSkillTable(S, rng.pick(tables).key);

    // survival
    var sv = E.survival(S);
    if (sv.roll === 2) ok(!sv.ok, 'seed ' + seed + ': natural 2 always fails survival');
    var ejected = false;
    if (!sv.ok) {
      var mishaps = c.mishaps;
      var mr = rng.d6();
      ok(mishaps[mr - 1] !== undefined, 'seed ' + seed + ': mishap ' + mr + ' exists for ' + careerKey);
      var text = mishaps[mr - 1].text;
      // some mishaps explicitly do not eject
      ejected = !/do(es)? NOT cause you to leave|you do NOT have to leave|not ejected|You are NOT ejected/i.test(text);
      S.current.leftBecause = ejected ? 'mishap' : null;
    }

    // event (only if still in career after survival)
    if (sv.ok) {
      var er = rng.d2();
      ok(c.events[er - 2] !== undefined, 'seed ' + seed + ': event ' + er + ' exists for ' + careerKey);
      S.current.events.push(er);
    }

    // commission + advancement
    var commissionedThisTerm = false;
    if (sv.ok && E.commissionAllowed(S)) {
      if (rng.next() < 0.5) {
        var cm = E.commissionRoll(S);
        if (cm && cm.ok) {
          S.current.commissioned = true;
          S.current.officerRank = 1;
          commissionedThisTerm = true;
          E.rankBonus(S);
        }
      }
    }
    var forcedOut = false, forcedStay = false;
    if (sv.ok && !commissionedThisTerm) {
      var ad = E.advancement(S);
      if (ad.ok) {
        if (S.current.commissioned) S.current.officerRank = Math.min(6, S.current.officerRank + 1);
        else S.current.rank = Math.min(6, S.current.rank + 1);
        E.rankBonus(S);
        E.rollSkillTable(S, rng.pick(E.availableSkillTables(S)).key);
      }
      forcedOut = ad.mustLeave;
      forcedStay = ad.mustStay;
      ok(!(forcedOut && forcedStay), 'seed ' + seed + ': advancement cannot both force out and force stay');
    }

    // close the term
    S.age += 4;
    S.terms.push(S.current);
    S.benefitRolls += 1;
    if (!sv.ok) S.benefitRolls -= 1;   // failed survival costs the benefit roll for the term
    var closed = S.current;
    S.current = null;

    ok(S.age === 18 + 4 * S.terms.length, 'seed ' + seed + ': age tracks terms (' + S.age + ' vs ' + S.terms.length + ')');

    // ageing
    if (E.ageingDue(S)) {
      var ag = E.ageingRoll(S);
      var res = E.applyAgeing(S, ag.effect);
      if (res.crisis) { S.crisis = true; }
    }

    // continue?
    if (ejected || forcedOut) closed.leftBecause = closed.leftBecause || 'forced';
    var wantContinue = !ejected && !forcedOut && rng.next() < 0.6;
    if (forcedStay) wantContinue = true;
    if (!wantContinue) {
      // muster out of this career
      var served = S.careerTermCount[closed.career];
      var high = Math.max(closed.rank, closed.officerRank);
      var mo = E.musterOut(S, closed.career, served, high);
      for (var b = 0; b < mo.rolls; b++) {
        var wantCash = S.cashRollsUsed < 3 && rng.next() < 0.4;
        E.takeBenefit(S, closed.career, wantCash, mo.rankDM);
      }
      S.pension += E.pensionFor(S, closed.career, served);
      if (rng.next() < 0.5) break;   // stop creating
    }
  }

  S.done = true;
  return S;
}

var runs = parseInt(process.argv[2] || '3000', 10);
console.log('fuzzing ' + runs + ' lifepaths...');
var terminated = 0, crisisCount = 0, maxTerms = 0, careerHits = {};

for (var seed = 1; seed <= runs; seed++) {
  var S = playLifepath(seed);
  if (S.done) terminated++;
  if (S.crisis) crisisCount++;
  maxTerms = Math.max(maxTerms, S.terms.length);

  // ---- invariants ----
  ok(S.terms.length >= 1, 'seed ' + seed + ': at least one term played');
  ok(S.age === 18 + 4 * S.terms.length, 'seed ' + seed + ': final age consistent');
  ok(S.cashRollsUsed <= 3, 'seed ' + seed + ': never more than 3 cash rolls in a lifetime (got ' + S.cashRollsUsed + ')');

  for (var k in S.skills) {
    ok(S.skills[k] >= 0 && S.skills[k] <= 4, 'seed ' + seed + ': skill ' + k + ' within 0..4 (got ' + S.skills[k] + ')');
    ok(!/^[A-Z]{3}\s*\+/.test(k), 'seed ' + seed + ': characteristic bump "' + k + '" must not be stored as a skill');
    ok(!/\sor\s/.test(k), 'seed ' + seed + ': unresolved "or" left in skill name "' + k + '"');
    ok(!/\d$/.test(k), 'seed ' + seed + ': skill name "' + k + '" must not end in a level');
  }
  E.CHARS.forEach(function (c) {
    var v = S.chars[c];
    ok(typeof v === 'number' && !isNaN(v), 'seed ' + seed + ': ' + c + ' is a number');
    ok(v >= 0 && v <= 15, 'seed ' + seed + ': ' + c + ' within 0..15 (got ' + v + ')');
  });
  ok(S.cash >= 0, 'seed ' + seed + ': cash never negative');
  ok(S.shipShares >= 0, 'seed ' + seed + ': ship shares never negative');
  ok(S.pension >= 0, 'seed ' + seed + ': pension never negative');

  S.terms.forEach(function (t, i) {
    ok(t.rank >= 0 && t.rank <= 6, 'seed ' + seed + ' term ' + (i + 1) + ': rank within 0..6');
    ok(t.officerRank >= 0 && t.officerRank <= 6, 'seed ' + seed + ' term ' + (i + 1) + ': officer rank within 0..6');
    ok(!!DATA.careers[t.career], 'seed ' + seed + ' term ' + (i + 1) + ': career "' + t.career + '" is real');
    var c = DATA.careers[t.career];
    ok(c.assignments.some(function (a) { return a.key === t.assignment; }),
      'seed ' + seed + ' term ' + (i + 1) + ': assignment "' + t.assignment + '" belongs to ' + t.career);
    careerHits[t.career] = (careerHits[t.career] || 0) + 1;
  });

  // A career may not be re-entered in the term immediately after leaving it -- with the
  // book's two stated exceptions (printed p18): the draft CAN return you to a career you
  // were ejected from, and the Drifter career is always open.
  for (var i = 1; i < S.terms.length; i++) {
    if (S.terms[i - 1].leftBecause) {
      var t = S.terms[i];
      var exempt = t.career === 'drifter' || t.enteredVia === 'draft';
      if (!exempt) {
        ok(t.career !== S.terms[i - 1].career,
          'seed ' + seed + ': career ' + t.career + ' re-entered immediately after leaving (via ' + t.enteredVia + ')');
      }
    }
  }
}

console.log('\nterminated cleanly : ' + terminated + '/' + runs);
console.log('max terms seen     : ' + maxTerms);
console.log('ageing crises      : ' + crisisCount);
console.log('careers exercised  : ' + Object.keys(careerHits).length + '/12  ' + JSON.stringify(careerHits));
console.log('\n' + checks + ' checks, ' + fails.length + ' failed');
if (fails.length) {
  var seen = {}, shown = 0;
  fails.forEach(function (f) {
    var key = f.replace(/seed \d+/, 'seed N');
    if (!seen[key] && shown < 25) { seen[key] = 1; shown++; console.log('  FAIL  ' + f); }
  });
  console.log('  (' + fails.length + ' total, ' + Object.keys(seen).length + ' distinct)');
  process.exit(1);
}
console.log('ALL PASS');
