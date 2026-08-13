# Independent cross-check: audit the generator's data against the factual rules claims in
# Xero's 'Traveler MGT2 Character Creation Tips' article -- a second source written from
# several hundred characters built in two OTHER generators. Re-run after touching career data.
#   py src/audit-tips.py
import io, json, os, re
D = r'D:\Coding\RPG Character Generators\traveller-generator\src\data'
def J(p): return json.load(io.open(os.path.join(D, p), encoding='utf-8'))
careers = {}
for f in sorted(os.listdir(os.path.join(D, 'careers'))):
    c = J(os.path.join('careers', f)); careers[c['key']] = c
core = J('core-rules.json'); loop = J('term-loop.json')

ok = fail = 0
def check(label, cond, detail=''):
    global ok, fail
    if cond: ok += 1; print('  PASS  %s' % label)
    else:    fail += 1; print('  FAIL  %s   %s' % (label, detail))

def rankbonus(ck, track, rank):
    r = careers[ck]['ranks']
    t = r.get(track)
    if t is None:
        for k in r:
            if track in k: t = r[k]; break
    if t is None: return None
    for row in t:
        if row['rank'] == rank: return row['bonus']
    return None

print('== rank bonuses (the article lists 12) ==')
claims = [
    ('Agent Corporate r1 Deception 1',   'agent',  'intelligence_corporate', 1, 'Deception 1'),
    ('Army enlisted r0 Gun Combat 1',    'army',   'enlisted', 0, 'Gun Combat 1'),
    ('Army enlisted r1 Recon 1',         'army',   'enlisted', 1, 'Recon 1'),
    ('Entertainer Performer r1 DEX +1',  'entertainer', 'performer', 1, 'DEX +1'),
    ('Marine enlisted r0 Gun or Melee',  'marine', 'enlisted', 0, None),
    ('Marine enlisted r1 Gun 1',         'marine', 'enlisted', 1, 'Gun Combat (any) 1'),
    ('Merchant FreeTrader r1 Persuade 1','merchant','free_trader', 1, 'Persuade 1'),
    ('Merchant Broker r1 Broker 1',      'merchant','broker', 1, 'Broker 1'),
    ('Merchant MMarine r1 Mechanic 1',   'merchant','merchant_marine', 1, 'Mechanic 1'),
    ('Navy enlisted r1 Mechanic 1',      'navy',   'enlisted', 1, 'Mechanic 1'),
    ('Navy enlisted r2 Vacc Suit 1',     'navy',   'enlisted', 2, 'Vacc Suit 1'),
    ('Rogue Thief r1 Stealth 1',         'rogue',  'thief', 1, 'Stealth 1'),
    ('Rogue Enforcer r1 Persuade 1',     'rogue',  'enforcer', 1, 'Persuade 1'),
    ('Rogue Pirate r1 Pilot or Gunner',  'rogue',  'pirate', 1, None),
    ('Scout any r1 Vacc Suit 1',         'scout',  'all', 1, 'Vacc Suit 1'),
]
for label, ck, track, rank, want in claims:
    got = rankbonus(ck, track, rank)
    if want is None:
        check(label, got is not None and ('or' in got), 'got %r' % got)
    else:
        check(label, got == want, 'got %r want %r' % (got, want))

print('== other mechanical claims ==')
check('background skills = 3 + EDU DM',
      'EDU DM + 3' in core['background_skills']['count'])
check('Noble auto-qualifies at SOC 10+',
      careers['noble']['qualification'].get('auto_if', {}).get('min') == 10)
check('DM-1 per previous career',
      any('previous career' in d['when'] and d['dm'] == -1
          for c in careers.values() for d in c['qualification'].get('dms', [])))
check('only Citizen and Drifter use assignment table for basic training',
      sorted(k for k, c in careers.items() if c.get('basic_training_exception')) == ['citizen', 'drifter'],
      sorted(k for k, c in careers.items() if c.get('basic_training_exception')))
ships = sorted(k for k, c in careers.items()
               if any(re.search(r'Yacht|Free Trader|Lab Ship|Scout Ship', r['benefit']) for r in c['mustering_out']))
check('ship careers are Merchant/Noble/Scholar/Scout',
      ships == ['merchant', 'noble', 'scholar', 'scout'], ships)
check('Corporate Agent survives easier than Intelligence',
      careers['agent']['assignments'][2]['survival'] < careers['agent']['assignments'][1]['survival'],
      'corp %s vs intel %s' % (careers['agent']['assignments'][2]['survival'],
                               careers['agent']['assignments'][1]['survival']))
hard = ['agent', 'marine', 'navy', 'rogue', 'scholar']
easy = ['citizen', 'entertainer', 'merchant', 'scout']
def target(c):
    m = re.search(r'(\d+)\+', careers[c]['qualification']['check']); return int(m.group(1)) if m else 99
check('hard careers all need 6+, easy ones 5+ or less',
      all(target(c) >= 6 for c in hard) and all(target(c) <= 5 for c in easy),
      {c: target(c) for c in hard + easy})
check('connections: max level 3, no Jack-of-all-Trades',
      'above level 3' in loop['connections_rule']['constraint'] and 'Jack' in loop['connections_rule']['constraint'])
endcount = sum(1 for c in careers.values()
               if 'END' in c['qualification']['check']
               or any('END' in a['survival'] or 'END' in a['advancement'] for a in c['assignments']))
print('  INFO  careers using END for qualification or survival/advancement: %d (article says 7 of 12)' % endcount)
print('== university EDU ==')
u = core['pre_career_education']['university']
print('  entry bonus  :', u['edu_bonus_on_entry'])
print('  grad benefits:', [b for b in u['graduation_benefits'] if 'EDU' in b])
print('\n%d passed, %d failed' % (ok, fail))
