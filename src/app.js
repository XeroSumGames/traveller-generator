/* Traveller generator -- UI driver.
   The engine owns the rules; this file owns what the screen asks next.
   Rendering dispatches on S.phase + S.sub (not a step index), because most of the
   term loop is REPORTING a roll rather than asking a question. */
(function () {
  'use strict';
  var E = window.TravellerEngine;
  var main, track;

  var PHASES = [
    ['chars', 'Characteristics'], ['background', 'Background'], ['education', 'Education'],
    ['terms', 'Careers'], ['muster', 'Mustering Out'], ['package', 'Skill Package'], ['done', 'Dossier']
  ];

  var S = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function sign(n) { return (n >= 0 ? '+' : '') + n; }
  function cr(n) { return 'Cr' + Number(n).toLocaleString('en-GB'); }

  function seed() { return (Math.floor(Math.random() * 4294967295) >>> 0) || 1; }

  function fresh() {
    S = E.start(DATA, seed());
    S.phase = 'chars';
    S.sub = null;
    S.name = '';
    S.homeworld = '';
    S.bgPicked = [];
    S.pkg = null;
    S.pkgTaken = [];
    S.musterQueue = [];
    S.crisis = false;
    S.pendingCareer = null;
    S.msg = null;
  }

  // ---------------- render ----------------
  function renderTrack() {
    var idx = 0;
    for (var i = 0; i < PHASES.length; i++) if (PHASES[i][0] === S.phase) idx = i;
    track.innerHTML = PHASES.map(function (p, i) {
      var cls = 'track-item' + (i === idx ? ' active' : (i < idx ? ' done' : ''));
      return '<div class="' + cls + '">' + esc(p[1]) + '</div>';
    }).join('');
  }

  function render() {
    renderTrack();
    var h = '';
    if (S.phase === 'chars') h = viewChars();
    else if (S.phase === 'background') h = viewBackground();
    else if (S.phase === 'education') h = viewEducation();
    else if (S.phase === 'terms') h = viewTerms();
    else if (S.phase === 'muster') h = viewMuster();
    else if (S.phase === 'package') h = viewPackage();
    else h = viewDossier();
    main.innerHTML = h + (S.phase === 'done' ? printSheet() : '');
    window.scrollTo(0, 0);
  }

  function charsPanel() {
    return '<div class="panel"><div class="panel-t">Characteristics</div><div class="chars">' +
      E.CHARS.map(function (k) {
        return '<div class="ch"><div class="ch-k">' + k + '</div><div class="ch-v">' + S.chars[k] +
          '</div><div class="ch-dm">DM ' + sign(E.dm(S.chars[k])) + '</div></div>';
      }).join('') + '</div></div>';
  }

  // ---- 1. characteristics ----
  function viewChars() {
    return '<div class="step-h">Characteristics</div>' +
      '<div class="step-p">Roll 2D for each of the six characteristics. You are 18 years old and the universe is in front of you.</div>' +
      charsPanel() +
      '<div class="note">Dice Modifiers come from the score: 0 is DM-3, 6-8 is DM+0, 15 is DM+3. Your EDU DM sets how many background skills you get next.</div>' +
      '<div class="btn-row"><button class="btn ghost" onclick="A.reroll()">&#9860; Roll again</button>' +
      '<button class="btn" onclick="A.go(\'background\')">Continue &rarr;</button></div>';
  }

  // ---- 2. background ----
  function viewBackground() {
    var n = Math.max(0, E.dm(S.chars.EDU) + 3);
    var list = DATA.core.background_skills.list;
    return '<div class="step-h">Background</div>' +
      '<div class="step-p">Choose <b>' + n + '</b> background skills &mdash; that is your EDU DM + 3 &mdash; each at level 0. These represent what you picked up growing up.</div>' +
      '<div class="panel"><div class="grid2">' +
      '<div><label class="lbl">Name</label><input class="txt" value="' + esc(S.name) + '" oninput="A.set(\'name\',this.value)" placeholder="Your Traveller"></div>' +
      '<div><label class="lbl">Homeworld</label><input class="txt" value="' + esc(S.homeworld) + '" oninput="A.set(\'homeworld\',this.value)" placeholder="Optional"></div>' +
      '</div></div>' +
      '<div class="panel"><div class="panel-t">Background skills &mdash; ' + S.bgPicked.length + ' / ' + n + '</div>' +
      '<div class="skills-list">' + list.map(function (sk) {
        var on = S.bgPicked.indexOf(sk) >= 0;
        var dis = !on && S.bgPicked.length >= n;
        return '<div class="opt' + (on ? ' on' : '') + (dis ? ' disabled' : '') + '" onclick="A.bg(\'' + esc(sk) + '\')">' +
          '<div class="opt-box">' + (on ? '&#10003;' : '') + '</div><div class="opt-n">' + esc(sk) + '</div></div>';
      }).join('') + '</div></div>' +
      '<div class="btn-row"><button class="btn ghost" onclick="A.go(\'chars\')">&larr; Back</button>' +
      '<button class="btn"' + (S.bgPicked.length === n ? '' : ' disabled') + ' onclick="A.go(\'education\')">Continue &rarr;</button></div>';
  }

  // ---- 3. pre-career education ----
  function viewEducation() {
    var u = DATA.core.pre_career_education.university, m = DATA.core.pre_career_education.military_academy;
    var h = '<div class="step-h">Pre-Career Education</div>' +
      '<div class="step-p">Optional. University or a military academy takes your first term but grants skills and a leg up into certain careers. Failing entry means you must try a career immediately &mdash; and failing that, the draft.</div>';
    if (S.education) {
      h += '<div class="panel"><div class="panel-t">' + esc(S.education.type) + '</div>' + S.education.log.map(function (l) {
        return '<div class="roll ' + (l.good ? 'good' : (l.bad ? 'bad' : '')) + '"><span class="roll-v">' + esc(l.v) + '</span><span class="roll-t">' + esc(l.t) + '</span></div>';
      }).join('') + '</div>' +
        '<div class="btn-row"><span></span><button class="btn" onclick="A.go(\'terms\')">Begin careers &rarr;</button></div>';
      return h;
    }
    h += '<div class="panel"><div class="panel-t">Choose</div>' +
      '<div class="opt" onclick="A.educate(\'university\')"><div class="opt-box"></div><div><div class="opt-n">University</div>' +
      '<div class="opt-d">Entry ' + esc(u.entry) + '. Two skills, EDU +1, then a graduation roll of ' + esc(u.graduation) + '.</div></div></div>' +
      '<div class="opt" onclick="A.educate(\'military_academy\')"><div class="opt-box"></div><div><div class="opt-n">Military Academy</div>' +
      '<div class="opt-d">Entry Army END 7+, Marines END 8+, Navy INT 8+. All service skills at 0, then graduation ' + esc(m.graduation) + '.</div></div></div>' +
      '<div class="opt" onclick="A.go(\'terms\')"><div class="opt-box"></div><div><div class="opt-n">Skip &mdash; straight to a career</div>' +
      '<div class="opt-d">Most Travellers do exactly this.</div></div></div></div>';
    return h;
  }

  // ---- 4. the term loop ----
  function historyHTML() {
    if (!S.terms.length) return '';
    return '<div class="panel"><div class="panel-t">Career history</div><div class="hist">' +
      S.terms.map(function (t, i) {
        var c = DATA.careers[t.career];
        var a = E.findAssignment(c, t.assignment);
        var rank = t.commissioned ? ('officer ' + t.officerRank) : ('rank ' + t.rank);
        return '<div class="hist-row"><div class="hist-t">Term ' + (i + 1) + '</div>' +
          '<div class="hist-c"><b>' + esc(c.name) + '</b> &middot; ' + esc(a.name) +
          (t.leftBecause ? ' <span class="hist-r">(' + esc(t.leftBecause) + ')</span>' : '') + '</div>' +
          '<div class="hist-r">age ' + t.age + ' &middot; ' + rank + '</div></div>';
      }).join('') + '</div></div>';
  }

  function skillsPanel() {
    var keys = Object.keys(S.skills).sort();
    if (!keys.length) return '';
    return '<div class="panel"><div class="panel-t">Skills &mdash; ' + E.totalSkillLevels(S) + ' levels (cap ' + E.skillCap(S) + ')</div>' +
      '<div class="skills-list">' + keys.map(function (k) {
        return '<div class="sk"><span>' + esc(k) + '</span><span class="sk-v">' + S.skills[k] + '</span></div>';
      }).join('') + '</div></div>';
  }

  function rollLine(v, t, cls) {
    return '<div class="roll ' + (cls || '') + '"><span class="roll-v">' + esc(v) + '</span><span class="roll-t">' + esc(t) + '</span></div>';
  }

  function viewTerms() {
    var h = '<div class="step-h">Term ' + (S.terms.length + 1) + '</div>' +
      '<div class="step-p">Age ' + S.age + '. Each term is four years. Choose a career and roll to qualify; from there the dice decide as much as you do.</div>';
    h += historyHTML();

    if (!S.sub || S.sub === 'pick') {
      h += '<div class="panel"><div class="panel-t">Choose a career</div>';
      var opts = E.careerOptions(S);
      h += opts.map(function (k) {
        var c = DATA.careers[k];
        return '<div class="opt' + (S.pendingCareer === k ? ' on' : '') + '" onclick="A.pickCareer(\'' + k + '\')">' +
          '<div class="opt-box">' + (S.pendingCareer === k ? '&#10003;' : '') + '</div><div>' +
          '<div class="opt-n">' + esc(c.name) + ' <span class="hist-r">&mdash; qualify ' + esc(c.qualification.check) + '</span></div>' +
          '<div class="opt-d">' + esc(c.blurb) + '</div></div></div>';
      }).join('') + '</div>';
      if (S.pendingCareer) {
        var c2 = DATA.careers[S.pendingCareer];
        h += '<div class="panel"><div class="panel-t">Assignment</div>' + c2.assignments.map(function (a) {
          return '<div class="opt" onclick="A.pickAssignment(\'' + a.key + '\')"><div class="opt-box"></div><div>' +
            '<div class="opt-n">' + esc(a.name) + ' <span class="hist-r">survival ' + esc(a.survival) + ' &middot; advancement ' + esc(a.advancement) + '</span></div>' +
            '<div class="opt-d">' + esc(a.desc) + '</div></div></div>';
        }).join('') + '</div>';
      }
      h += skillsPanel();
      return h;
    }

    // in-term reporting
    h += '<div class="panel"><div class="term-hd"><div class="term-n">' +
      esc(DATA.careers[S.current.career].name) + ' &middot; ' +
      esc(E.findAssignment(DATA.careers[S.current.career], S.current.assignment).name) +
      '</div><div class="term-age">age ' + S.current.age + '</div></div>';
    h += (S.termLog || []).map(function (l) { return rollLine(l.v, l.t, l.cls); }).join('');
    h += '</div>';

    if (S.sub === 'train') {
      var tables = E.availableSkillTables(S);
      h += '<div class="panel"><div class="panel-t">Choose a skill table &mdash; roll 1D</div>' +
        tables.map(function (t) {
          return '<div class="opt" onclick="A.train(\'' + t.key + '\')"><div class="opt-box"></div><div class="opt-n">' + esc(t.label) + '</div></div>';
        }).join('') + '</div>';
    } else if (S.sub === 'commission') {
      h += '<div class="panel"><div class="panel-t">Commission &mdash; ' + esc(DATA.careers[S.current.career].commission.check) + '</div>' +
        '<div class="opt" onclick="A.commission(true)"><div class="opt-box"></div><div class="opt-n">Try for a commission</div></div>' +
        '<div class="opt" onclick="A.commission(false)"><div class="opt-box"></div><div class="opt-n">Stay in the ranks</div></div></div>';
    } else if (S.sub === 'continue') {
      h += '<div class="panel"><div class="panel-t">Another term?</div>' +
        (S.forcedStay ? '<div class="note">You rolled a natural 12 on advancement &mdash; you are too valuable to lose and must serve another term.</div>' : '') +
        (S.mustLeave ? '<div class="note">Your advancement roll came in at or under the terms you have served. You cannot continue in this career.</div>' : '') +
        (!S.mustLeave && !S.forcedStay ? '<div class="opt" onclick="A.another(true)"><div class="opt-box"></div><div class="opt-n">Serve another term in this career</div></div>' : '') +
        (S.forcedStay ? '<div class="opt" onclick="A.another(true)"><div class="opt-box"></div><div class="opt-n">Serve another term (required)</div></div>' : '') +
        (!S.forcedStay ? '<div class="opt" onclick="A.another(false)"><div class="opt-box"></div><div class="opt-n">Leave and muster out</div></div>' : '') +
        '</div>';
    } else if (S.sub === 'report') {
      h += '<div class="btn-row"><span></span><button class="btn" onclick="A.advanceTerm()">Continue &rarr;</button></div>';
    } else if (S.sub === 'ejected') {
      h += '<div class="panel"><div class="panel-t">Out of a job</div>' +
        '<div class="opt" onclick="A.afterEject()"><div class="opt-box"></div><div class="opt-n">Muster out and look for new work</div></div></div>';
    }
    h += skillsPanel();
    return h;
  }

  // ---- 5. mustering out ----
  function viewMuster() {
    var q = S.musterQueue[0];
    var h = '<div class="step-h">Mustering Out</div>';
    if (!q) {
      h += '<div class="step-p">Nothing left to claim.</div>' +
        '<div class="btn-row"><span></span><button class="btn" onclick="A.go(\'package\')">Continue &rarr;</button></div>';
      return h;
    }
    var c = DATA.careers[q.career];
    h += '<div class="step-p">Leaving <b>' + esc(c.name) + '</b> after ' + q.terms + ' term' + (q.terms === 1 ? '' : 's') +
      '. You have <b>' + q.rolls + '</b> benefit roll' + (q.rolls === 1 ? '' : 's') + ' left to place.</div>';
    h += '<div class="panel"><div class="panel-t">Cash so far: ' + cr(S.cash) + ' &middot; cash rolls used ' + S.cashRollsUsed + ' / 3</div>' +
      '<div class="opt' + (S.cashRollsUsed >= 3 ? ' disabled' : '') + '" onclick="A.benefit(true)"><div class="opt-box"></div><div>' +
      '<div class="opt-n">Roll on the Cash column</div><div class="opt-d">Three cash rolls per lifetime, across every career. ' +
      (S.skills['Gambler'] !== undefined ? 'Your Gambler skill grants DM+1.' : '') + '</div></div></div>' +
      '<div class="opt" onclick="A.benefit(false)"><div class="opt-box"></div><div>' +
      '<div class="opt-n">Roll on the Benefits column</div><div class="opt-d">Equipment, ship shares, characteristic increases and the like.</div></div></div></div>';
    if (S.benefits.length) {
      h += '<div class="panel"><div class="panel-t">Benefits taken</div><div class="skills-list">' +
        S.benefits.map(function (b) { return '<div class="sk"><span>' + esc(b) + '</span></div>'; }).join('') + '</div></div>';
    }
    return h;
  }

  // ---- 6. skill package ----
  function viewPackage() {
    var P = DATA.packages.skill_packages;
    var h = '<div class="step-h">Skill Package</div>' +
      '<div class="step-p">A group chooses <b>one</b> package between them, then takes turns claiming skills from it until the list is used up.</div>' +
      '<div class="note">This is written as a group rule and the book gives no solo split, so nothing is granted automatically. Pick the package your table agreed on, then tick the skills you claimed.</div>';
    h += '<div class="panel"><div class="panel-t">Package</div>';
    for (var k in P) {
      if (k.charAt(0) === '_') continue;
      h += '<div class="opt' + (S.pkg === k ? ' on' : '') + '" onclick="A.pkg(\'' + k + '\')">' +
        '<div class="opt-box">' + (S.pkg === k ? '&#10003;' : '') + '</div><div>' +
        '<div class="opt-n">' + esc(k) + '</div><div class="opt-d">' + esc(P[k].desc) + '</div></div></div>';
    }
    h += '</div>';
    if (S.pkg) {
      h += '<div class="panel"><div class="panel-t">Claim your share</div><div class="skills-list">' +
        P[S.pkg].skills.map(function (sk, i) {
          var on = S.pkgTaken.indexOf(i) >= 0;
          return '<div class="opt' + (on ? ' on' : '') + '" onclick="A.pkgTake(' + i + ')">' +
            '<div class="opt-box">' + (on ? '&#10003;' : '') + '</div><div class="opt-n">' + esc(sk) + '</div></div>';
        }).join('') + '</div></div>';
    }
    h += '<div class="btn-row"><span></span><button class="btn" onclick="A.finish()">Finish &rarr;</button></div>';
    return h;
  }

  // ---- 7. dossier ----
  function viewDossier() {
    var h = '<div class="step-h">' + esc(S.name || 'Unnamed Traveller') + '</div>' +
      '<div class="step-p">Age ' + S.age + ' &middot; ' + S.terms.length + ' term' + (S.terms.length === 1 ? '' : 's') +
      (S.homeworld ? ' &middot; ' + esc(S.homeworld) : '') + '</div>';
    if (S.crisis) h += '<div class="note"><b>Ageing crisis.</b> A characteristic reached zero. Without 1D &times; Cr10000 of medical care the Traveller dies; survivors automatically fail every qualification roll from here on.</div>';
    h += charsPanel() + historyHTML() + skillsPanel();
    h += '<div class="panel"><div class="panel-t">Finances &amp; benefits</div>' +
      '<div class="grid2"><div><div class="sk"><span>Cash</span><span class="sk-v">' + cr(S.cash) + '</span></div>' +
      '<div class="sk"><span>Ship shares</span><span class="sk-v">' + S.shipShares + '</span></div></div>' +
      '<div><div class="sk"><span>Pension</span><span class="sk-v">' + cr(S.pension) + '/yr</span></div>' +
      '<div class="sk"><span>Debt</span><span class="sk-v">' + cr(S.debt) + '</span></div></div></div>' +
      (S.benefits.length ? '<div class="skills-list" style="margin-top:10px">' + S.benefits.map(function (b) {
        return '<div class="sk"><span>' + esc(b) + '</span></div>';
      }).join('') + '</div>' : '') + '</div>';
    h += '<div class="btn-row"><button class="btn ghost" onclick="A.restart()">Start over</button>' +
      '<button class="btn" onclick="window.print()">Print sheet</button></div>';
    return h;
  }

  // ---- printed sheet (CSS recreation; no publisher artwork) ----
  function printSheet() {
    var skills = Object.keys(S.skills).sort();
    var h = '<div id="printsheet"><div class="ps">';
    h += '<div class="ps-top"><div class="ps-title">Traveller</div><div class="ps-sub">CHARACTER RECORD</div></div>';
    h += '<div class="ps-box"><div class="ps-2">' +
      '<div>' + f('Name', S.name) + f('Homeworld', S.homeworld) + f('Species', 'Human') + '</div>' +
      '<div>' + f('Age', S.age) + f('Terms', S.terms.length) + f('Pension', S.pension ? cr(S.pension) + '/yr' : '') + '</div>' +
      '</div></div>';
    h += '<div class="ps-band">Characteristics</div><div class="ps-box"><div class="ps-ch">' +
      E.CHARS.concat(['PSI']).map(function (k) {
        var v = k === 'PSI' ? '' : S.chars[k];
        var d = k === 'PSI' ? '' : 'DM ' + sign(E.dm(S.chars[k]));
        return '<div><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="d">' + d + '</div></div>';
      }).join('') + '</div></div>';
    h += '<div class="ps-band">Skills</div><div class="ps-box"><div class="ps-sk">' +
      (skills.length ? skills.map(function (k) {
        return '<div><span>' + esc(k) + '</span><span>' + S.skills[k] + '</span></div>';
      }).join('') : '<div>&mdash;</div>') + '</div></div>';
    h += '<div class="ps-band">Career history</div><div class="ps-box"><table class="ps-hist">' +
      '<tr><th>Term</th><th>Career</th><th>Assignment</th><th>Rank</th><th>Left</th></tr>' +
      S.terms.map(function (t, i) {
        var c = DATA.careers[t.career];
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(c.name) + '</td><td>' +
          esc(E.findAssignment(c, t.assignment).name) + '</td><td>' +
          (t.commissioned ? 'Officer ' + t.officerRank : t.rank) + '</td><td>' + esc(t.leftBecause || '') + '</td></tr>';
      }).join('') + '</table></div>';
    h += '<div class="ps-band">Benefits &amp; finances</div><div class="ps-box"><div class="ps-2"><div>' +
      f('Cash', cr(S.cash)) + f('Ship shares', S.shipShares) + '</div><div>' +
      f('Debt', cr(S.debt)) + f('Benefits', S.benefits.join(', ')) + '</div></div></div>';
    h += '<div class="ps-foot">Traveller is a registered trade mark of Mongoose Publishing Ltd. ' +
      'This is an unofficial, fan-made character generator, not affiliated with or endorsed by the rights holders. ' +
      'All game rules and content remain the property of their respective owners.</div>';
    h += '</div></div>';
    return h;
  }
  function f(label, val) {
    return '<div class="ps-f"><div class="ps-fl">' + esc(label) + '</div><div class="ps-fv">' + esc(val) + '</div></div>';
  }

  // ---------------- actions ----------------
  var A = {};
  A.set = function (k, v) { S[k] = v; };
  A.reroll = function () { E.rollCharacteristics(S); S.bgPicked = []; render(); };
  A.go = function (p) {
    if (p === 'terms' && !S.sub) S.sub = 'pick';
    S.phase = p; render();
  };
  A.bg = function (sk) {
    var n = Math.max(0, E.dm(S.chars.EDU) + 3);
    var i = S.bgPicked.indexOf(sk);
    if (i >= 0) { S.bgPicked.splice(i, 1); delete S.skills[sk]; }
    else if (S.bgPicked.length < n) { S.bgPicked.push(sk); S.skills[sk] = 0; }
    render();
  };

  A.educate = function (kind) {
    var log = [];
    var d = DATA.core.pre_career_education[kind];
    var ok;
    if (kind === 'university') {
      var chk = E.parseCheck(d.entry);
      var mod = (S.chars.SOC >= 9 ? 1 : 0);
      var r = S.rng.d2(), tot = r + E.dm(S.chars[chk.chars[0]]) + mod;
      ok = tot >= chk.target;
      log.push({ v: tot, t: 'Entry (' + d.entry + '): ' + (ok ? 'accepted' : 'rejected'), good: ok, bad: !ok });
      if (ok) {
        E.bumpChar(S, 'EDU', 1, S.log);
        E.applySkillEntry(S, d.skill_list[Math.floor(S.rng.next() * d.skill_list.length)] + ' 1', S.log);
        var g = S.rng.d2(), gtot = g + E.dm(S.chars.INT);
        var grad = gtot >= 6, hon = gtot >= 10;
        log.push({ v: gtot, t: 'Graduation (INT 6+): ' + (hon ? 'with honours' : (grad ? 'graduated' : 'failed')), good: grad, bad: !grad });
        if (grad) { E.bumpChar(S, 'EDU', 1, S.log); }
      }
    } else {
      var svc = ['Army', 'Marines', 'Navy'][Math.floor(S.rng.next() * 3)];
      var ent = d.entry[svc] || d.entry.Army;
      var c2 = E.parseCheck(ent);
      var r2 = S.rng.d2(), t2 = r2 + E.dm(S.chars[c2.chars[0]]);
      ok = t2 >= c2.target;
      log.push({ v: t2, t: svc + ' academy entry (' + ent + '): ' + (ok ? 'accepted' : 'rejected'), good: ok, bad: !ok });
      if (ok) {
        var g2 = S.rng.d2() + E.dm(S.chars.INT) + (S.chars.END >= 8 ? 1 : 0) + (S.chars.SOC >= 8 ? 1 : 0);
        var grad2 = g2 >= 7, hon2 = g2 >= 11;
        log.push({ v: g2, t: 'Graduation (INT 7+): ' + (hon2 ? 'with honours' : (grad2 ? 'graduated' : 'failed')), good: grad2, bad: !grad2 });
        if (grad2) { E.bumpChar(S, 'EDU', 1, S.log); if (hon2) E.bumpChar(S, 'SOC', 1, S.log); }
      }
    }
    var ev = S.rng.d2();
    log.push({ v: ev, t: 'Pre-career event ' + ev + ': ' + DATA.core.pre_career_education.pre_career_events[ev - 2].text });
    S.education = { type: kind === 'university' ? 'University' : 'Military Academy', entered: ok, log: log };
    S.age += 4;
    render();
  };

  A.pickCareer = function (k) { S.pendingCareer = k; render(); };

  A.pickAssignment = function (a) {
    var k = S.pendingCareer;
    S.termLog = [];
    var q = E.qualify(S, k, a);
    if (q.auto) S.termLog.push({ v: '--', t: 'Qualification: automatic', cls: 'good' });
    else S.termLog.push({ v: q.total, t: 'Qualification ' + DATA.careers[k].qualification.check + ': ' + (q.ok ? 'accepted' : 'rejected'), cls: q.ok ? 'good' : 'bad' });
    if (!q.ok) {
      if (!S.draftUsed) {
        S.draftUsed = true;
        var row = DATA.loop.draft.table[S.rng.d6() - 1];
        var dk = row.career.toLowerCase();
        if (!DATA.careers[dk]) dk = 'drifter';
        k = dk; a = DATA.careers[k].assignments[0].key;
        S.termLog.push({ v: '&#9860;', t: 'Drafted into ' + DATA.careers[k].name, cls: 'bad' });
      } else {
        k = 'drifter'; a = DATA.careers[k].assignments[0].key;
        S.termLog.push({ v: '--', t: 'No berth anywhere. You drift.', cls: 'bad' });
      }
    }
    E.enterCareer(S, k, a);
    S.pendingCareer = null;
    S.sub = 'train';
    render();
  };

  A.train = function (tableKey) {
    var r = E.rollSkillTable(S, tableKey);
    S.termLog.push({ v: r.roll, t: 'Training: ' + r.entry });
    // survival
    var sv = E.survival(S);
    S.termLog.push({ v: sv.total, t: 'Survival ' + sv.check + ': ' + (sv.ok ? 'survived' : (sv.roll === 2 ? 'natural 2 -- automatic failure' : 'failed')), cls: sv.ok ? 'good' : 'bad' });
    if (!sv.ok) {
      var c = DATA.careers[S.current.career];
      var mr = S.rng.d6();
      var text = c.mishaps[mr - 1].text;
      S.termLog.push({ v: mr, t: 'Mishap: ' + text, cls: 'bad' });
      var stays = /do(es)? NOT cause you to leave|you do NOT have to leave|NOT ejected/i.test(text);
      S.benefitRolls -= 0; // the term's benefit roll is lost -- accounted for at muster
      S.current.lostBenefit = true;
      if (!stays) { S.current.leftBecause = 'mishap'; S.sub = 'ejected'; render(); return; }
    } else {
      var ev = S.rng.d2();
      S.termLog.push({ v: ev, t: 'Event: ' + DATA.careers[S.current.career].events[ev - 2].text });
    }
    S.sub = E.commissionAllowed(S) ? 'commission' : 'advance';
    if (S.sub === 'advance') doAdvance();
    render();
  };

  A.commission = function (tryIt) {
    if (tryIt) {
      var cm = E.commissionRoll(S);
      S.termLog.push({ v: cm.total, t: 'Commission ' + DATA.careers[S.current.career].commission.check +
        (cm.dm ? ' (DM' + sign(cm.dm) + ')' : '') + ': ' + (cm.ok ? 'commissioned' : 'refused'), cls: cm.ok ? 'good' : 'bad' });
      if (cm.ok) {
        S.current.commissioned = true; S.current.officerRank = 1;
        var rb = E.rankBonus(S);
        if (rb && rb.bonus) S.termLog.push({ v: '&#9733;', t: 'Rank bonus: ' + rb.bonus, cls: 'good' });
        S.sub = 'continue'; S.mustLeave = false; S.forcedStay = false;
        render(); return;
      }
    } else {
      S.termLog.push({ v: '--', t: 'Commission not attempted' });
    }
    doAdvance(); render();
  };

  function doAdvance() {
    var ad = E.advancement(S);
    S.termLog.push({ v: ad.total, t: 'Advancement ' + ad.check + ': ' + (ad.ok ? 'promoted' : 'passed over'), cls: ad.ok ? 'good' : '' });
    if (ad.ok) {
      if (S.current.commissioned) S.current.officerRank = Math.min(6, S.current.officerRank + 1);
      else S.current.rank = Math.min(6, S.current.rank + 1);
      var rb = E.rankBonus(S);
      if (rb && rb.bonus) S.termLog.push({ v: '&#9733;', t: 'Rank bonus: ' + rb.bonus, cls: 'good' });
      var extra = E.rollSkillTable(S, E.availableSkillTables(S)[0].key);
      S.termLog.push({ v: extra.roll, t: 'Extra training from promotion: ' + extra.entry, cls: 'good' });
    }
    if (ad.mustStay) S.termLog.push({ v: 12, t: 'A natural 12 -- you are too valuable to lose and must serve again', cls: 'good' });
    if (ad.mustLeave) S.termLog.push({ v: ad.total, t: 'At or under your terms served -- you cannot continue here', cls: 'bad' });
    S.mustLeave = ad.mustLeave; S.forcedStay = ad.mustStay;
    S.sub = 'continue';
  }

  function closeTerm(leftBecause) {
    S.age += 4;
    S.current.leftBecause = leftBecause || S.current.leftBecause;
    S.terms.push(S.current);
    var closed = S.current;
    S.current = null;
    if (E.ageingDue(S)) {
      var ag = E.ageingRoll(S);
      var res = E.applyAgeing(S, ag.effect);
      S.termLog.push({ v: ag.roll, t: 'Ageing (2D - ' + S.terms.length + ' terms): ' + (ag.effect ? 'characteristics reduced' : 'no effect'), cls: ag.effect ? 'bad' : 'good' });
      if (res.crisis) S.crisis = true;
    }
    return closed;
  }

  A.another = function (yes) {
    var closed = closeTerm(yes ? null : 'left');
    if (yes) {
      S.current = {
        career: closed.career, assignment: closed.assignment,
        rank: closed.rank, commissioned: closed.commissioned, officerRank: closed.officerRank,
        termNo: S.terms.length + 1, age: S.age, skillRolls: [], events: [], leftBecause: null
      };
      S.careerTermCount[closed.career]++;
      S.termLog = [];
      S.sub = 'train';
    } else {
      queueMuster(closed);
      S.sub = 'pick';
      S.phase = 'muster';
    }
    render();
  };

  A.afterEject = function () {
    var closed = closeTerm('mishap');
    queueMuster(closed);
    S.sub = 'pick';
    S.phase = 'muster';
    render();
  };

  function queueMuster(closed) {
    var served = S.careerTermCount[closed.career];
    var high = Math.max(closed.rank, closed.officerRank);
    var mo = E.musterOut(S, closed.career, served, high);
    var rolls = mo.rolls - (closed.lostBenefit ? 1 : 0);
    S.pension += E.pensionFor(S, closed.career, served);
    if (rolls > 0) S.musterQueue.push({ career: closed.career, terms: served, rolls: rolls, rankDM: mo.rankDM });
  }

  A.benefit = function (wantCash) {
    var q = S.musterQueue[0];
    if (!q) return;
    if (wantCash && S.cashRollsUsed >= 3) return;
    E.takeBenefit(S, q.career, wantCash, q.rankDM);
    q.rolls--;
    if (q.rolls <= 0) S.musterQueue.shift();
    if (!S.musterQueue.length) {
      // back to the loop unless the player is done
      S.phase = 'terms'; S.sub = 'pick';
    }
    render();
  };

  A.pkg = function (k) { S.pkg = k; S.pkgTaken = []; render(); };
  A.pkgTake = function (i) {
    var idx = S.pkgTaken.indexOf(i);
    var sk = DATA.packages.skill_packages[S.pkg].skills[i];
    if (idx >= 0) { S.pkgTaken.splice(idx, 1); }
    else { S.pkgTaken.push(i); E.applySkillEntry(S, sk, S.log); }
    render();
  };
  A.finish = function () { S.phase = 'done'; render(); };
  A.restart = function () { fresh(); render(); };

  A.randomise = function () {
    fresh();
    var n = Math.max(0, E.dm(S.chars.EDU) + 3);
    var pool = DATA.core.background_skills.list.slice();
    for (var i = 0; i < n; i++) {
      var p = pool.splice(Math.floor(S.rng.next() * pool.length), 1)[0];
      S.bgPicked.push(p); S.skills[p] = 0;
    }
    S.name = 'Traveller';
    // play 2-4 terms automatically
    var want = 2 + Math.floor(S.rng.next() * 3);
    var guard = 0;
    while (S.terms.length < want && guard++ < 40) {
      var keys = E.careerOptions(S);
      var k = keys[Math.floor(S.rng.next() * keys.length)];
      var a = DATA.careers[k].assignments[Math.floor(S.rng.next() * 3)].key;
      S.pendingCareer = k;
      A.pickAssignment(a);
      if (S.sub === 'ejected') { A.afterEject(); flushMuster(); continue; }
      A.train(E.availableSkillTables(S)[Math.floor(S.rng.next() * E.availableSkillTables(S).length)].key);
      if (S.sub === 'ejected') { A.afterEject(); flushMuster(); continue; }
      if (S.sub === 'commission') A.commission(S.rng.next() < 0.5);
      // The randomiser always picks a fresh career next time round, so every term here
      // genuinely ends by LEAVING. Passing true would close the term with no reason
      // recorded and the printed history would show a blank "Left" for a career change.
      A.another(false);
      flushMuster();
    }
    flushMuster();
    S.phase = 'done';
    render();
  };
  function flushMuster() {
    var guard = 0;
    while (S.musterQueue.length && guard++ < 60) A.benefit(S.cashRollsUsed < 3 && S.rng.next() < 0.4);
  }

  window.A = A;

  // theme
  window.setTheme = function (t) {
    if (t === 'light') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('traveller_theme', t); } catch (e) {}
    syncTheme();
  };
  function syncTheme() {
    var t = document.documentElement.getAttribute('data-theme') || 'light';
    var b = document.querySelectorAll('.tt-btn');
    for (var i = 0; i < b.length; i++) b[i].classList.toggle('active', b[i].getAttribute('data-tv') === t);
  }

  window.addEventListener('DOMContentLoaded', function () {
    main = document.getElementById('main');
    track = document.getElementById('track');
    fresh();
    render();
    syncTheme();
  });
})();
